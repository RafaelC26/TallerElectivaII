import mongoose from 'mongoose';
import { Equipo, Jugador, POSICIONES, MAX_JUGADORES_POR_EQUIPO } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { busquedaParcial, elegirCampos, metaPaginacion, paginacion } from '../utils/consultas.js';
import { esObjectId } from '../middlewares/validarId.js';

const CAMPOS_JUGADOR = ['nombre', 'apellido', 'numeroCamiseta', 'posicion', 'fechaNacimiento', 'nacionalidad', 'equipo'];
const DATOS_EQUIPO = 'nombre ciudad';
const ORDEN_ESPANOL = { locale: 'es', strength: 2 };

async function buscarJugadorOFallar(id) {
    const jugador = await Jugador.findById(id);
    if (!jugador) throw ApiError.notFound(`No existe un jugador con id ${id}`);
    return jugador;
}

// Reglas de negocio que dependen de otros documentos (se validan antes de guardar)
async function validarReglasDeNegocio(jugador, session) {
    const equipo = await Equipo.findById(jugador.equipo).session(session);
    if (!equipo) {
        throw ApiError.unprocessable(`El equipo con id ${jugador.equipo} no existe`);
    }

    const cambiaDeEquipo = jugador.isNew || jugador.isModified('equipo');

    if (cambiaDeEquipo) {
        const totalJugadores = await Jugador.countDocuments({ equipo: equipo._id }).session(session);
        if (totalJugadores >= MAX_JUGADORES_POR_EQUIPO) {
            throw ApiError.conflict(
                `El equipo "${equipo.nombre}" ya tiene el máximo de ${MAX_JUGADORES_POR_EQUIPO} jugadores`
            );
        }
    }

    if (cambiaDeEquipo || jugador.isModified('numeroCamiseta')) {
        const ocupante = await Jugador.findOne({ equipo: equipo._id, numeroCamiseta: jugador.numeroCamiseta }).session(session);
        if (ocupante && !ocupante._id.equals(jugador._id)) {
            throw ApiError.conflict(
                `El número ${jugador.numeroCamiseta} ya lo usa ${ocupante.nombre} ${ocupante.apellido} en ${equipo.nombre}`
            );
        }
    }
}

// Se guarda dentro de una transacción que primero "toca" el equipo destino: si llegan dos
// altas o transferencias simultáneas al mismo equipo chocan (WriteConflict) y MongoDB las
// reintenta una tras otra, así el cupo de 25 y la existencia del equipo nunca se rompen
async function guardarConReglas(jugador) {
    await jugador.validate();
    await mongoose.connection.transaction(async (session) => {
        await Equipo.updateOne({ _id: jugador.equipo }, { $currentDate: { updatedAt: true } }, { session });
        await validarReglasDeNegocio(jugador, session);
        await jugador.save({ session, validateBeforeSave: false });
    });
    return jugador.populate('equipo', DATOS_EQUIPO);
}

// GET /api/jugadores?equipo=&posicion=&nombre=&pagina=&limite=
export async function listarJugadores(req, res) {
    const pag = paginacion(req.query);
    const { equipo, posicion } = req.query;
    const filtro = {};

    if (equipo !== undefined) {
        if (!esObjectId(equipo)) throw ApiError.badRequest('El filtro "equipo" debe ser un id válido');
        filtro.equipo = equipo;
    }
    if (posicion !== undefined) {
        if (!POSICIONES.includes(posicion)) {
            throw ApiError.badRequest(`El filtro "posicion" debe ser uno de: ${POSICIONES.join(', ')}`);
        }
        filtro.posicion = posicion;
    }
    const nombre = busquedaParcial(req.query.nombre);
    if (nombre) filtro.$or = [{ nombre }, { apellido: nombre }];

    const [total, datos] = await Promise.all([
        Jugador.countDocuments(filtro),
        Jugador.find(filtro)
            .collation(ORDEN_ESPANOL)
            .sort({ apellido: 1, nombre: 1, _id: 1 })
            .skip(pag.saltar)
            .limit(pag.limite)
            .populate('equipo', DATOS_EQUIPO)
    ]);

    res.json({ datos, paginacion: metaPaginacion(total, pag) });
}

export async function obtenerJugador(req, res) {
    const jugador = await Jugador.findById(req.params.id).populate('equipo', 'nombre ciudad estadio');
    if (!jugador) throw ApiError.notFound(`No existe un jugador con id ${req.params.id}`);
    res.json({ datos: jugador });
}

export async function crearJugador(req, res) {
    const jugador = new Jugador(elegirCampos(req.body, CAMPOS_JUGADOR));
    await guardarConReglas(jugador);
    res.status(201).json({ mensaje: 'Jugador creado correctamente', datos: jugador });
}

// PUT /api/jugadores/:id — cambiar "equipo" equivale a transferir al jugador
export async function actualizarJugador(req, res) {
    const cambios = elegirCampos(req.body, CAMPOS_JUGADOR);
    if (Object.keys(cambios).length === 0) {
        throw ApiError.badRequest(`Envíe al menos uno de estos campos: ${CAMPOS_JUGADOR.join(', ')}`);
    }

    const jugador = await buscarJugadorOFallar(req.params.id);
    jugador.set(cambios);
    await guardarConReglas(jugador);

    res.json({ mensaje: 'Jugador actualizado correctamente', datos: jugador });
}

export async function eliminarJugador(req, res) {
    const jugador = await Jugador.findByIdAndDelete(req.params.id);
    if (!jugador) throw ApiError.notFound(`No existe un jugador con id ${req.params.id}`);
    await jugador.populate('equipo', DATOS_EQUIPO);
    res.json({ mensaje: 'Jugador eliminado correctamente', datos: jugador });
}
