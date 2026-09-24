import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
    startServer,
    stopServer,
    registrar,
    crearAdmin,
    crearEquipo,
    crearJugador,
    unico,
    idInexistente,
    fechaHaceAnios,
    camposConError,
    BEARER
} from './helpers.js';

let api;
let admin;
let usuario;

before(async () => {
    ({ api } = await startServer());
    admin = await crearAdmin(api);
    usuario = await registrar(api, { nombre: 'Usuario Normal' });
});

after(stopServer);

function datosJugador(equipo, cambios = {}) {
    return {
        nombre: 'Juan',
        apellido: unico('Pérez'),
        numeroCamiseta: 10,
        posicion: 'Centrocampista',
        fechaNacimiento: '2000-05-14',
        equipo,
        ...cambios
    };
}

const crear = (datos) => api.post('/api/jugadores').auth(usuario.token, BEARER).send(datos);
const actualizar = (id, cambios) => api.put(`/api/jugadores/${id}`).auth(usuario.token, BEARER).send(cambios);
const obtener = (id) => api.get(`/api/jugadores/${id}`).auth(usuario.token, BEARER);

async function plantilla(equipoId) {
    const res = await api.get(`/api/equipos/${equipoId}/jugadores`).auth(usuario.token, BEARER);
    assert.equal(res.status, 200);
    return res.body.datos;
}

describe('Creación de jugadores', () => {
    let equipo;

    before(async () => {
        equipo = await crearEquipo(api, usuario.token, { ciudad: 'Tunja', estadio: 'La Independencia' });
    });

    it('responde 201 con el equipo poblado (nombre, ciudad) y la edad calculada', async () => {
        const anio = new Date().getUTCFullYear() - 20;
        const res = await crear(datosJugador(equipo._id, { numeroCamiseta: 10, fechaNacimiento: `${anio}-01-01` }));

        assert.equal(res.status, 201);
        assert.equal(res.body.mensaje, 'Jugador creado correctamente');

        const { datos } = res.body;
        assert.match(datos._id, /^[a-f\d]{24}$/);
        assert.deepEqual(datos.equipo, { _id: equipo._id, nombre: equipo.nombre, ciudad: 'Tunja' });
        assert.equal(datos.edad, 20);
        assert.equal(datos.nacionalidad, 'Colombia', 'nacionalidad por defecto');
        assert.equal(datos.numeroCamiseta, 10);
    });

    it('ignora los campos no permitidos (_id, edad, createdAt)', async () => {
        const idForzado = idInexistente();
        const res = await crear(
            datosJugador(equipo._id, { numeroCamiseta: 11, _id: idForzado, edad: 99, createdAt: '2000-01-01T00:00:00.000Z' })
        );

        assert.equal(res.status, 201);
        assert.notEqual(res.body.datos._id, idForzado);
        assert.notEqual(res.body.datos.edad, 99);
        assert.notEqual(res.body.datos.createdAt, '2000-01-01T00:00:00.000Z');
    });

    it('responde 400 con un detalle por cada campo obligatorio faltante', async () => {
        const res = await crear({});

        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Datos inválidos');
        assert.deepEqual(camposConError(res.body).sort(), [
            'apellido',
            'equipo',
            'fechaNacimiento',
            'nombre',
            'numeroCamiseta',
            'posicion'
        ]);
    });

    it('responde 400 si la posición no es válida', async () => {
        const res = await crear(datosJugador(equipo._id, { numeroCamiseta: 12, posicion: 'Arquero' }));

        assert.equal(res.status, 400);
        assert.deepEqual(camposConError(res.body), ['posicion']);
        assert.match(res.body.detalles[0].mensaje, /Posición no válida: Arquero/);
    });

    for (const numero of [0, 100, 10.5, -7, 'diez']) {
        it(`responde 400 si el número de camiseta es ${JSON.stringify(numero)}`, async () => {
            const res = await crear(datosJugador(equipo._id, { numeroCamiseta: numero }));

            assert.equal(res.status, 400);
            assert.deepEqual(camposConError(res.body), ['numeroCamiseta']);
        });
    }

    it('acepta los números de camiseta límite 1 y 99', async () => {
        const uno = await crear(datosJugador(equipo._id, { numeroCamiseta: 1 }));
        const noventaYNueve = await crear(datosJugador(equipo._id, { numeroCamiseta: 99 }));

        assert.equal(uno.status, 201);
        assert.equal(noventaYNueve.status, 201);
    });

    it('responde 400 si el jugador tiene menos de 15 años', async () => {
        const res = await crear(datosJugador(equipo._id, { numeroCamiseta: 13, fechaNacimiento: fechaHaceAnios(10) }));

        assert.equal(res.status, 400);
        assert.deepEqual(camposConError(res.body), ['fechaNacimiento']);
        assert.match(res.body.detalles[0].mensaje, /al menos 15 años/);
    });

    it('acepta a un jugador que cumple 15 años hoy y rechaza al que los cumple mañana', async () => {
        const cumpleHoy = await crear(datosJugador(equipo._id, { numeroCamiseta: 14, fechaNacimiento: fechaHaceAnios(15) }));
        assert.equal(cumpleHoy.status, 201);
        assert.equal(cumpleHoy.body.datos.edad, 15);

        const cumpleManana = await crear(datosJugador(equipo._id, { numeroCamiseta: 16, fechaNacimiento: fechaHaceAnios(15, 1) }));
        assert.equal(cumpleManana.status, 400);
        assert.deepEqual(camposConError(cumpleManana.body), ['fechaNacimiento']);
    });

    it('responde 400 si la fecha de nacimiento no es una fecha', async () => {
        const res = await crear(datosJugador(equipo._id, { numeroCamiseta: 17, fechaNacimiento: 'no-es-una-fecha' }));

        assert.equal(res.status, 400);
        assert.deepEqual(camposConError(res.body), ['fechaNacimiento']);
    });

    it('responde 422 si el equipo no existe', async () => {
        const id = idInexistente();
        const res = await crear(datosJugador(id, { numeroCamiseta: 18 }));

        assert.equal(res.status, 422);
        assert.equal(res.body.error, `El equipo con id ${id} no existe`);
    });

    it('responde 400 si el id del equipo está mal formado', async () => {
        const res = await crear(datosJugador('no-es-un-id', { numeroCamiseta: 19 }));

        assert.equal(res.status, 400);
        assert.deepEqual(res.body.detalles, [{ campo: 'equipo', mensaje: 'Valor no válido para equipo' }]);
    });

    it('responde 409 si el número de camiseta ya está ocupado en el mismo equipo', async () => {
        const primero = await crear(datosJugador(equipo._id, { numeroCamiseta: 9, nombre: 'Radamel', apellido: 'Falcao' }));
        assert.equal(primero.status, 201);

        const repetido = await crear(datosJugador(equipo._id, { numeroCamiseta: 9 }));
        assert.equal(repetido.status, 409);
        assert.match(repetido.body.error, /El número 9 ya lo usa Radamel Falcao/);
    });

    it('permite el mismo número de camiseta en equipos distintos', async () => {
        const otroEquipo = await crearEquipo(api, usuario.token);

        const enOtro = await crear(datosJugador(otroEquipo._id, { numeroCamiseta: 10 }));
        assert.equal(enOtro.status, 201);
        assert.equal(enOtro.body.datos.equipo._id, otroEquipo._id);
    });

    it('responde 401 si no se envía token', async () => {
        const res = await api.post('/api/jugadores').send(datosJugador(equipo._id, { numeroCamiseta: 20 }));

        assert.equal(res.status, 401);
    });
});

describe('Límite de 25 jugadores por equipo', () => {
    let lleno;
    let delLleno;

    before(async () => {
        lleno = await crearEquipo(api, usuario.token);
        for (let numeroCamiseta = 1; numeroCamiseta <= 25; numeroCamiseta++) {
            const jugador = await crearJugador(api, usuario.token, lleno._id, { numeroCamiseta });
            delLleno ??= jugador;
        }
    });

    it('permite 25 jugadores y responde 409 al intentar agregar el 26', async () => {
        const res = await crear(datosJugador(lleno._id, { numeroCamiseta: 26 }));

        assert.equal(res.status, 409);
        assert.match(res.body.error, /máximo de 25 jugadores/);

        const equipo = await api.get(`/api/equipos/${lleno._id}`).auth(usuario.token, BEARER);
        assert.equal(equipo.body.datos.totalJugadores, 25);
    });

    it('permite editar a un jugador de un equipo lleno (no cuenta como fichaje nuevo)', async () => {
        const res = await actualizar(delLleno._id, { numeroCamiseta: 50 });

        assert.equal(res.status, 200);
        assert.equal(res.body.datos.numeroCamiseta, 50);
    });

    it('permite reenviar el mismo equipo al editar a un jugador de un equipo lleno', async () => {
        const res = await actualizar(delLleno._id, { equipo: lleno._id, nombre: 'Mismo Equipo' });

        assert.equal(res.status, 200);
        assert.equal(res.body.datos.nombre, 'Mismo Equipo');
    });

    it('responde 409 al transferir un jugador a un equipo lleno', async () => {
        const origen = await crearEquipo(api, usuario.token);
        const jugador = await crearJugador(api, usuario.token, origen._id, { numeroCamiseta: 90 });

        const res = await actualizar(jugador._id, { equipo: lleno._id });
        assert.equal(res.status, 409);
        assert.match(res.body.error, /máximo de 25 jugadores/);

        const sigue = await obtener(jugador._id);
        assert.equal(sigue.body.datos.equipo._id, origen._id, 'el jugador permanece en su equipo');
    });
});

describe('Actualización y transferencia de jugadores', () => {
    let equipoA;
    let equipoB;

    before(async () => {
        equipoA = await crearEquipo(api, usuario.token);
        equipoB = await crearEquipo(api, usuario.token, { ciudad: 'Bogotá' });
    });

    it('actualiza parcialmente: solo cambian los campos enviados', async () => {
        const jugador = await crearJugador(api, usuario.token, equipoA._id, { posicion: 'Defensa' });

        const res = await actualizar(jugador._id, { posicion: 'Delantero' });

        assert.equal(res.status, 200);
        assert.equal(res.body.mensaje, 'Jugador actualizado correctamente');
        assert.equal(res.body.datos.posicion, 'Delantero');
        assert.equal(res.body.datos.apellido, jugador.apellido);
        assert.equal(res.body.datos.numeroCamiseta, jugador.numeroCamiseta);
        assert.deepEqual(res.body.datos.equipo, { _id: equipoA._id, nombre: equipoA.nombre, ciudad: equipoA.ciudad });
    });

    it('permite reenviar el mismo número de camiseta del propio jugador', async () => {
        const jugador = await crearJugador(api, usuario.token, equipoA._id);

        const soloNumero = await actualizar(jugador._id, { numeroCamiseta: jugador.numeroCamiseta });
        assert.equal(soloNumero.status, 200);

        const numeroYEquipo = await actualizar(jugador._id, {
            numeroCamiseta: jugador.numeroCamiseta,
            equipo: equipoA._id,
            nombre: 'Sin Conflicto'
        });
        assert.equal(numeroYEquipo.status, 200);
        assert.equal(numeroYEquipo.body.datos.nombre, 'Sin Conflicto');
    });

    it('responde 409 al cambiar a un número ocupado dentro del mismo equipo', async () => {
        const ocupante = await crearJugador(api, usuario.token, equipoA._id);
        const jugador = await crearJugador(api, usuario.token, equipoA._id);

        const res = await actualizar(jugador._id, { numeroCamiseta: ocupante.numeroCamiseta });

        assert.equal(res.status, 409);
        assert.match(res.body.error, new RegExp(`El número ${ocupante.numeroCamiseta} ya lo usa`));
    });

    it('transfiere a un jugador con PUT { equipo }', async () => {
        const jugador = await crearJugador(api, usuario.token, equipoA._id, { numeroCamiseta: 77 });

        const res = await actualizar(jugador._id, { equipo: equipoB._id });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.datos.equipo, { _id: equipoB._id, nombre: equipoB.nombre, ciudad: 'Bogotá' });
        assert.ok(!(await plantilla(equipoA._id)).some((j) => j._id === jugador._id), 'ya no está en el equipo de origen');
        assert.ok((await plantilla(equipoB._id)).some((j) => j._id === jugador._id), 'aparece en el equipo de destino');
    });

    it('responde 409 al transferir a un equipo donde su número ya está ocupado', async () => {
        await crearJugador(api, usuario.token, equipoB._id, { numeroCamiseta: 8 });
        const jugador = await crearJugador(api, usuario.token, equipoA._id, { numeroCamiseta: 8 });

        const res = await actualizar(jugador._id, { equipo: equipoB._id });
        assert.equal(res.status, 409);
        assert.match(res.body.error, /El número 8 ya lo usa/);

        const sigue = await obtener(jugador._id);
        assert.equal(sigue.body.datos.equipo._id, equipoA._id, 'el jugador permanece en su equipo');
    });

    it('permite transferir y cambiar de número a la vez si el nuevo número está libre', async () => {
        await crearJugador(api, usuario.token, equipoB._id, { numeroCamiseta: 5 });
        const jugador = await crearJugador(api, usuario.token, equipoA._id, { numeroCamiseta: 5 });

        const res = await actualizar(jugador._id, { equipo: equipoB._id, numeroCamiseta: 55 });

        assert.equal(res.status, 200);
        assert.equal(res.body.datos.equipo._id, equipoB._id);
        assert.equal(res.body.datos.numeroCamiseta, 55);
    });

    it('responde 422 al transferir a un equipo que no existe', async () => {
        const jugador = await crearJugador(api, usuario.token, equipoA._id);

        const res = await actualizar(jugador._id, { equipo: idInexistente() });
        assert.equal(res.status, 422);
    });

    it('responde 400 si los nuevos valores no son válidos', async () => {
        const jugador = await crearJugador(api, usuario.token, equipoA._id);

        const numero = await actualizar(jugador._id, { numeroCamiseta: 200 });
        assert.equal(numero.status, 400);
        assert.deepEqual(camposConError(numero.body), ['numeroCamiseta']);

        const edad = await actualizar(jugador._id, { fechaNacimiento: fechaHaceAnios(12) });
        assert.equal(edad.status, 400);
        assert.deepEqual(camposConError(edad.body), ['fechaNacimiento']);

        const posicion = await actualizar(jugador._id, { posicion: 'Líbero' });
        assert.equal(posicion.status, 400);
        assert.deepEqual(camposConError(posicion.body), ['posicion']);
    });

    it('responde 400 si el PUT llega sin campos permitidos', async () => {
        const jugador = await crearJugador(api, usuario.token, equipoA._id);

        const vacio = await actualizar(jugador._id, {});
        const desconocidos = await actualizar(jugador._id, { apodo: 'El Tigre' });

        assert.equal(vacio.status, 400);
        assert.equal(desconocidos.status, 400);
        assert.match(vacio.body.error, /Envíe al menos uno de estos campos/);
    });

    it('responde 400 con id inválido y 404 con id inexistente', async () => {
        const invalido = await actualizar('123', { nombre: 'Nadie' });
        const inexistente = await actualizar(idInexistente(), { nombre: 'Nadie' });

        assert.equal(invalido.status, 400);
        assert.equal(inexistente.status, 404);
    });
});

describe('Listado y filtros de jugadores', () => {
    const sufijo = randomUUID().slice(0, 8);
    let equipo;

    before(async () => {
        equipo = await crearEquipo(api, usuario.token);
        const jugadores = [
            { nombre: 'Andrés', apellido: `Zuluaga${sufijo}`, posicion: 'Portero', numeroCamiseta: 1 },
            { nombre: 'Bruno', apellido: 'Arias', posicion: 'Defensa', numeroCamiseta: 2 },
            { nombre: 'Carlos', apellido: 'Borja', posicion: 'Delantero', numeroCamiseta: 9 },
            { nombre: 'Diego', apellido: 'Cárdenas', posicion: 'Portero', numeroCamiseta: 12 }
        ];
        for (const datos of jugadores) {
            await crearJugador(api, usuario.token, equipo._id, datos);
        }
    });

    const listar = (query) => api.get('/api/jugadores').query(query).auth(usuario.token, BEARER);

    it('filtra por equipo y devuelve cada jugador con su equipo poblado', async () => {
        const res = await listar({ equipo: equipo._id });

        assert.equal(res.status, 200);
        assert.equal(res.body.paginacion.total, 4);
        for (const jugador of res.body.datos) {
            assert.deepEqual(jugador.equipo, { _id: equipo._id, nombre: equipo.nombre, ciudad: equipo.ciudad });
        }
        assert.deepEqual(
            res.body.datos.map((j) => j.apellido),
            ['Arias', 'Borja', 'Cárdenas', `Zuluaga${sufijo}`],
            'ordenados por apellido'
        );
    });

    it('responde 400 si el filtro equipo no es un id válido', async () => {
        const res = await listar({ equipo: 'xyz' });

        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'El filtro "equipo" debe ser un id válido');
    });

    it('devuelve una lista vacía si el equipo del filtro no existe', async () => {
        const res = await listar({ equipo: idInexistente() });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.datos, []);
        assert.equal(res.body.paginacion.total, 0);
    });

    it('filtra por posición', async () => {
        const res = await listar({ equipo: equipo._id, posicion: 'Portero' });

        assert.equal(res.status, 200);
        assert.equal(res.body.paginacion.total, 2);
        assert.ok(res.body.datos.every((j) => j.posicion === 'Portero'));
    });

    it('responde 400 si la posición del filtro no es válida', async () => {
        const invalida = await listar({ posicion: 'Arquero' });
        const minusculas = await listar({ posicion: 'portero' });

        assert.equal(invalida.status, 400);
        assert.equal(minusculas.status, 400);
        assert.match(invalida.body.error, /Portero, Defensa, Centrocampista, Delantero/);
    });

    it('el filtro nombre también busca en el apellido (parcial y sin mayúsculas)', async () => {
        const porApellido = await listar({ nombre: `zuluaga${sufijo}`.toUpperCase().slice(2) });
        assert.equal(porApellido.status, 200);
        assert.equal(porApellido.body.paginacion.total, 1);
        assert.equal(porApellido.body.datos[0].nombre, 'Andrés');

        const porNombre = await listar({ equipo: equipo._id, nombre: 'bruno' });
        assert.equal(porNombre.body.paginacion.total, 1);
        assert.equal(porNombre.body.datos[0].apellido, 'Arias');
    });

    it('el filtro nombre no falla con caracteres especiales de regex', async () => {
        for (const texto of ['(', '[', '*', '+?']) {
            const res = await listar({ nombre: texto });
            assert.equal(res.status, 200, `nombre=${texto}`);
            assert.equal(res.body.paginacion.total, 0);
        }
    });

    it('pagina los resultados', async () => {
        const pagina1 = await listar({ equipo: equipo._id, limite: 3, pagina: 1 });
        const pagina2 = await listar({ equipo: equipo._id, limite: 3, pagina: 2 });

        assert.deepEqual(pagina1.body.paginacion, { total: 4, pagina: 1, limite: 3, paginas: 2 });
        assert.deepEqual(pagina1.body.datos.map((j) => j.apellido), ['Arias', 'Borja', 'Cárdenas']);
        assert.deepEqual(pagina2.body.paginacion, { total: 4, pagina: 2, limite: 3, paginas: 2 });
        assert.deepEqual(pagina2.body.datos.map((j) => j.apellido), [`Zuluaga${sufijo}`]);
    });
});

describe('Consulta y eliminación de jugadores', () => {
    let equipo;

    before(async () => {
        equipo = await crearEquipo(api, usuario.token, { estadio: 'El Campín' });
    });

    it('GET /api/jugadores/:id devuelve el jugador con su equipo (incluye estadio)', async () => {
        const jugador = await crearJugador(api, usuario.token, equipo._id);
        const res = await obtener(jugador._id);

        assert.equal(res.status, 200);
        assert.equal(res.body.datos._id, jugador._id);
        assert.deepEqual(res.body.datos.equipo, {
            _id: equipo._id,
            nombre: equipo.nombre,
            ciudad: equipo.ciudad,
            estadio: 'El Campín'
        });
        assert.equal(typeof res.body.datos.edad, 'number');
    });

    it('GET /api/jugadores/:id responde 400 con id inválido y 404 si no existe', async () => {
        const invalido = await obtener('zzz');
        const inexistente = await obtener(idInexistente());

        assert.equal(invalido.status, 400);
        assert.equal(inexistente.status, 404);
        assert.match(inexistente.body.error, /No existe un jugador con id/);
    });

    it('DELETE responde 403 para un usuario sin rol admin', async () => {
        const jugador = await crearJugador(api, usuario.token, equipo._id);

        const res = await api.delete(`/api/jugadores/${jugador._id}`).auth(usuario.token, BEARER);
        assert.equal(res.status, 403);

        const sigue = await obtener(jugador._id);
        assert.equal(sigue.status, 200, 'el jugador no debe eliminarse');
    });

    it('DELETE como admin responde 200 y luego el jugador ya no existe', async () => {
        const jugador = await crearJugador(api, usuario.token, equipo._id);

        const res = await api.delete(`/api/jugadores/${jugador._id}`).auth(admin.token, BEARER);
        assert.equal(res.status, 200);
        assert.equal(res.body.mensaje, 'Jugador eliminado correctamente');
        assert.equal(res.body.datos._id, jugador._id);

        const consulta = await obtener(jugador._id);
        assert.equal(consulta.status, 404);
        assert.ok(!(await plantilla(equipo._id)).some((j) => j._id === jugador._id));

        const otraVez = await api.delete(`/api/jugadores/${jugador._id}`).auth(admin.token, BEARER);
        assert.equal(otraVez.status, 404);
    });

    it('DELETE responde 400 si el id no es válido', async () => {
        const res = await api.delete('/api/jugadores/no-valido').auth(admin.token, BEARER);

        assert.equal(res.status, 400);
    });
});
