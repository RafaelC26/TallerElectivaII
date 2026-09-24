import mongoose from 'mongoose';
import { Equipo, Jugador } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { busquedaParcial, elegirCampos, metaPaginacion, paginacion } from '../utils/consultas.js';

const CAMPOS_EQUIPO = ['nombre', 'ciudad', 'estadio', 'anioFundacion', 'entrenador'];

async function buscarEquipoOFallar(id) {
    const equipo = await Equipo.findById(id);
    if (!equipo) throw ApiError.notFound(`No existe un equipo con id ${id}`);
    return equipo;
}

// GET /api/equipos?nombre=&ciudad=&pagina=&limite=
export async function listarEquipos(req, res) {
    const pag = paginacion(req.query);
    const filtro = {};
    const nombre = busquedaParcial(req.query.nombre);
    const ciudad = busquedaParcial(req.query.ciudad);
    if (nombre) filtro.nombre = nombre;
    if (ciudad) filtro.ciudad = ciudad;

    const [total, datos] = await Promise.all([
        Equipo.countDocuments(filtro),
        Equipo.find(filtro)
            .collation({ locale: 'es', strength: 2 })
            .sort({ nombre: 1 })
            .skip(pag.saltar)
            .limit(pag.limite)
            .populate('totalJugadores')
    ]);

    res.json({ datos, paginacion: metaPaginacion(total, pag) });
}

// GET /api/equipos/:id — incluye la lista de jugadores (lado "muchos")
export async function obtenerEquipo(req, res) {
    const equipo = await Equipo.findById(req.params.id).populate('totalJugadores').populate('jugadores');
    if (!equipo) throw ApiError.notFound(`No existe un equipo con id ${req.params.id}`);
    res.json({ datos: equipo });
}

export async function crearEquipo(req, res) {
    const equipo = await Equipo.create(elegirCampos(req.body, CAMPOS_EQUIPO));
    res.status(201).json({ mensaje: 'Equipo creado correctamente', datos: equipo });
}

export async function actualizarEquipo(req, res) {
    const cambios = elegirCampos(req.body, CAMPOS_EQUIPO);
    if (Object.keys(cambios).length === 0) {
        throw ApiError.badRequest(`Envíe al menos uno de estos campos: ${CAMPOS_EQUIPO.join(', ')}`);
    }

    const equipo = await buscarEquipoOFallar(req.params.id);
    equipo.set(cambios);
    await equipo.save();
    await equipo.populate('totalJugadores');

    res.json({ mensaje: 'Equipo actualizado correctamente', datos: equipo });
}

// DELETE /api/equipos/:id?cascada=true
// Regla de negocio: un equipo con jugadores no se elimina, salvo que se pida en cascada.
// Va en una transacción que borra primero el equipo: si al mismo tiempo se está agregando
// un jugador, las dos operaciones chocan y se reintentan en orden (nunca quedan jugadores huérfanos)
export async function eliminarEquipo(req, res) {
    const cascada = req.query.cascada === 'true';
    let equipo;
    let jugadoresEliminados = 0;

    await mongoose.connection.transaction(async (session) => {
        equipo = await Equipo.findOneAndDelete({ _id: req.params.id }, { session });
        if (!equipo) throw ApiError.notFound(`No existe un equipo con id ${req.params.id}`);

        const totalJugadores = await Jugador.countDocuments({ equipo: equipo._id }).session(session);
        if (totalJugadores > 0 && !cascada) {
            throw ApiError.conflict(
                `El equipo "${equipo.nombre}" tiene ${totalJugadores} jugador(es). Reasígnelos o elimínelos, o use ?cascada=true`,
                { totalJugadores }
            );
        }

        ({ deletedCount: jugadoresEliminados } = await Jugador.deleteMany({ equipo: equipo._id }, { session }));
    });

    res.json({ mensaje: 'Equipo eliminado correctamente', datos: equipo, jugadoresEliminados });
}

// GET /api/equipos/:id/jugadores — recurso anidado de la relación 1:N
export async function listarJugadoresDeEquipo(req, res) {
    const equipo = await buscarEquipoOFallar(req.params.id);
    const datos = await Jugador.find({ equipo: equipo._id }).sort({ numeroCamiseta: 1 });

    res.json({ equipo: { _id: equipo._id, nombre: equipo.nombre }, total: datos.length, datos });
}
