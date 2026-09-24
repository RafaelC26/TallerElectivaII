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

describe('CRUD de equipos', () => {
    it('crea, consulta, actualiza parcialmente y elimina un equipo', async () => {
        const nombre = unico('Patriotas');
        const creado = await api
            .post('/api/equipos')
            .auth(usuario.token, BEARER)
            .send({ nombre: `  ${nombre}  `, ciudad: 'Tunja', estadio: 'La Independencia', anioFundacion: 2003, entrenador: 'Andrés Mesa' });

        assert.equal(creado.status, 201);
        assert.equal(creado.body.mensaje, 'Equipo creado correctamente');
        const { _id: id } = creado.body.datos;
        assert.match(id, /^[a-f\d]{24}$/);
        assert.equal(creado.body.datos.nombre, nombre, 'el nombre se guarda sin espacios sobrantes');
        assert.ok(creado.body.datos.createdAt);

        const consultado = await api.get(`/api/equipos/${id}`).auth(usuario.token, BEARER);
        assert.equal(consultado.status, 200);
        assert.equal(consultado.body.datos.nombre, nombre);
        assert.equal(consultado.body.datos.totalJugadores, 0);
        assert.deepEqual(consultado.body.datos.jugadores, []);

        const actualizado = await api.put(`/api/equipos/${id}`).auth(usuario.token, BEARER).send({ ciudad: 'Duitama' });
        assert.equal(actualizado.status, 200);
        assert.equal(actualizado.body.mensaje, 'Equipo actualizado correctamente');
        assert.equal(actualizado.body.datos.ciudad, 'Duitama');
        assert.equal(actualizado.body.datos.nombre, nombre, 'PUT solo cambia los campos enviados');
        assert.equal(actualizado.body.datos.estadio, 'La Independencia');
        assert.equal(actualizado.body.datos.anioFundacion, 2003);

        const eliminado = await api.delete(`/api/equipos/${id}`).auth(admin.token, BEARER);
        assert.equal(eliminado.status, 200);
        assert.equal(eliminado.body.mensaje, 'Equipo eliminado correctamente');
        assert.equal(eliminado.body.jugadoresEliminados, 0);

        const despues = await api.get(`/api/equipos/${id}`).auth(usuario.token, BEARER);
        assert.equal(despues.status, 404);
    });

    it('responde 401 si no se envía token', async () => {
        const listar = await api.get('/api/equipos');
        const crear = await api.post('/api/equipos').send({ nombre: 'Sin Token', ciudad: 'Tunja' });

        assert.equal(listar.status, 401);
        assert.equal(crear.status, 401);
    });

    it('responde 409 si el nombre ya existe, sin distinguir mayúsculas', async () => {
        const equipo = await crearEquipo(api, usuario.token);

        const res = await api
            .post('/api/equipos')
            .auth(usuario.token, BEARER)
            .send({ nombre: equipo.nombre.toUpperCase(), ciudad: 'Sogamoso' });

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Ya existe un equipo con ese nombre');
    });

    it('responde 409 al renombrar un equipo con el nombre de otro', async () => {
        const primero = await crearEquipo(api, usuario.token);
        const segundo = await crearEquipo(api, usuario.token);

        const res = await api
            .put(`/api/equipos/${segundo._id}`)
            .auth(usuario.token, BEARER)
            .send({ nombre: primero.nombre.toLowerCase() });

        assert.equal(res.status, 409);
    });

    it('permite cambiar solo las mayúsculas del nombre del propio equipo', async () => {
        const equipo = await crearEquipo(api, usuario.token);

        const res = await api
            .put(`/api/equipos/${equipo._id}`)
            .auth(usuario.token, BEARER)
            .send({ nombre: equipo.nombre.toUpperCase() });

        assert.equal(res.status, 200);
        assert.equal(res.body.datos.nombre, equipo.nombre.toUpperCase());
    });

    it('responde 400 con detalles si faltan los campos obligatorios', async () => {
        const res = await api.post('/api/equipos').auth(usuario.token, BEARER).send({ estadio: 'Solo estadio' });

        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Datos inválidos');
        assert.deepEqual(camposConError(res.body).sort(), ['ciudad', 'nombre']);
    });

    const aniosInvalidos = [
        { caso: 'en el futuro', valor: new Date().getFullYear() + 1, mensaje: /futuro/ },
        { caso: 'no entero', valor: 1999.5, mensaje: /entero/ },
        { caso: 'anterior a 1850', valor: 1849, mensaje: /1850/ },
        { caso: 'que no es un número', valor: 'mil novecientos', mensaje: /no válido/ }
    ];

    for (const { caso, valor, mensaje } of aniosInvalidos) {
        it(`responde 400 si anioFundacion es ${caso}`, async () => {
            const res = await api
                .post('/api/equipos')
                .auth(usuario.token, BEARER)
                .send({ nombre: unico('Año Inválido'), ciudad: 'Tunja', anioFundacion: valor });

            assert.equal(res.status, 400);
            assert.deepEqual(camposConError(res.body), ['anioFundacion']);
            assert.match(res.body.detalles[0].mensaje, mensaje);
        });
    }

    it('acepta como anioFundacion el año actual', async () => {
        const anio = new Date().getFullYear();
        const equipo = await crearEquipo(api, usuario.token, { anioFundacion: anio });

        assert.equal(equipo.anioFundacion, anio);
    });

    it('responde 400 si el id no es un ObjectId válido', async () => {
        const rutas = [
            api.get('/api/equipos/abc123'),
            api.put('/api/equipos/abc123').send({ ciudad: 'Tunja' }),
            api.delete('/api/equipos/abc123'),
            api.get('/api/equipos/abc123/jugadores')
        ];

        for (const peticion of rutas) {
            const res = await peticion.auth(admin.token, BEARER);
            assert.equal(res.status, 400, `${res.req.method} ${res.req.path}`);
            assert.equal(res.body.error, 'El id "abc123" no es un identificador válido');
        }
    });

    it('responde 404 si el equipo no existe', async () => {
        const id = idInexistente();
        const rutas = [
            api.get(`/api/equipos/${id}`),
            api.put(`/api/equipos/${id}`).send({ ciudad: 'Tunja' }),
            api.delete(`/api/equipos/${id}`),
            api.get(`/api/equipos/${id}/jugadores`)
        ];

        for (const peticion of rutas) {
            const res = await peticion.auth(admin.token, BEARER);
            assert.equal(res.status, 404, `${res.req.method} ${res.req.path}`);
            assert.equal(res.body.error, `No existe un equipo con id ${id}`);
        }
    });

    it('responde 400 si el PUT llega sin campos', async () => {
        const equipo = await crearEquipo(api, usuario.token);
        const res = await api.put(`/api/equipos/${equipo._id}`).auth(usuario.token, BEARER).send({});

        assert.equal(res.status, 400);
        assert.match(res.body.error, /Envíe al menos uno de estos campos/);
    });

    it('responde 400 si el PUT solo trae campos desconocidos', async () => {
        const equipo = await crearEquipo(api, usuario.token);
        const res = await api
            .put(`/api/equipos/${equipo._id}`)
            .auth(usuario.token, BEARER)
            .send({ presupuesto: 1000, colores: 'verde' });

        assert.equal(res.status, 400);
    });

    it('ignora en el PUT los campos desconocidos o protegidos (_id, createdAt)', async () => {
        const equipo = await crearEquipo(api, usuario.token);
        const res = await api
            .put(`/api/equipos/${equipo._id}`)
            .auth(usuario.token, BEARER)
            .send({ ciudad: 'Paipa', _id: idInexistente(), createdAt: '2000-01-01T00:00:00.000Z', presupuesto: 1000 });

        assert.equal(res.status, 200);
        assert.equal(res.body.datos._id, equipo._id);
        assert.equal(res.body.datos.ciudad, 'Paipa');
        assert.equal(res.body.datos.createdAt, equipo.createdAt);
        assert.equal('presupuesto' in res.body.datos, false);
    });
});

describe('Listado de equipos: paginación y filtros', () => {
    // Prefijo propio para aislar estos datos de los equipos creados en otras pruebas
    const prefijo = `Liga ${randomUUID().slice(0, 8)}`;
    const ciudad = `Villa ${randomUUID().slice(0, 8)}`;

    before(async () => {
        for (let i = 1; i <= 5; i++) {
            await crearEquipo(api, usuario.token, { nombre: `${prefijo} Club ${i}`, ciudad: i <= 2 ? ciudad : 'Tunja' });
        }
    });

    it('pagina los resultados con total, pagina, limite y paginas', async () => {
        const pagina1 = await api.get('/api/equipos').query({ nombre: prefijo, limite: 2, pagina: 1 }).auth(usuario.token, BEARER);

        assert.equal(pagina1.status, 200);
        assert.deepEqual(pagina1.body.paginacion, { total: 5, pagina: 1, limite: 2, paginas: 3 });
        assert.deepEqual(
            pagina1.body.datos.map((e) => e.nombre),
            [`${prefijo} Club 1`, `${prefijo} Club 2`],
            'ordenados por nombre'
        );

        const pagina3 = await api.get('/api/equipos').query({ nombre: prefijo, limite: 2, pagina: 3 }).auth(usuario.token, BEARER);
        assert.equal(pagina3.body.datos.length, 1);
        assert.equal(pagina3.body.datos[0].nombre, `${prefijo} Club 5`);

        const fueraDeRango = await api.get('/api/equipos').query({ nombre: prefijo, limite: 2, pagina: 9 }).auth(usuario.token, BEARER);
        assert.equal(fueraDeRango.status, 200);
        assert.deepEqual(fueraDeRango.body.datos, []);
    });

    it('usa valores seguros si pagina o limite no son válidos', async () => {
        const invalidos = await api.get('/api/equipos').query({ pagina: 'abc', limite: 'xyz' }).auth(usuario.token, BEARER);
        assert.equal(invalidos.status, 200);
        assert.equal(invalidos.body.paginacion.pagina, 1);
        assert.equal(invalidos.body.paginacion.limite, 10);

        const excesivo = await api.get('/api/equipos').query({ limite: 1000 }).auth(usuario.token, BEARER);
        assert.equal(excesivo.body.paginacion.limite, 100);

        const negativos = await api.get('/api/equipos').query({ pagina: -3, limite: -5 }).auth(usuario.token, BEARER);
        assert.equal(negativos.body.paginacion.pagina, 1);
        assert.equal(negativos.body.paginacion.limite, 1);
    });

    it('filtra por nombre de forma parcial y sin distinguir mayúsculas', async () => {
        const res = await api
            .get('/api/equipos')
            .query({ nombre: `${prefijo.toUpperCase()} club 3`.slice(2) })
            .auth(usuario.token, BEARER);

        assert.equal(res.status, 200);
        assert.equal(res.body.paginacion.total, 1);
        assert.equal(res.body.datos[0].nombre, `${prefijo} Club 3`);
    });

    it('filtra por ciudad de forma parcial y sin distinguir mayúsculas', async () => {
        const res = await api.get('/api/equipos').query({ ciudad: ciudad.toUpperCase().slice(1) }).auth(usuario.token, BEARER);

        assert.equal(res.status, 200);
        assert.equal(res.body.paginacion.total, 2);
        assert.ok(res.body.datos.every((e) => e.ciudad === ciudad));
    });

    it('combina los filtros de nombre y ciudad', async () => {
        const res = await api.get('/api/equipos').query({ nombre: prefijo, ciudad: 'tunja' }).auth(usuario.token, BEARER);

        assert.equal(res.status, 200);
        assert.equal(res.body.paginacion.total, 3);
    });

    it('trata los caracteres especiales de regex como texto literal', async () => {
        const especial = await crearEquipo(api, usuario.token, { nombre: unico('Club (Especial) [x]') });

        for (const texto of ['(', ')', '[', '*', '\\', '.*', '(Especial) [x]']) {
            const res = await api.get('/api/equipos').query({ nombre: texto }).auth(usuario.token, BEARER);
            assert.equal(res.status, 200, `nombre=${texto}`);
        }

        const literal = await api.get('/api/equipos').query({ nombre: '(Especial) [x]' }).auth(usuario.token, BEARER);
        assert.deepEqual(literal.body.datos.map((e) => e._id), [especial._id]);

        const comodin = await api.get('/api/equipos').query({ nombre: '.*' }).auth(usuario.token, BEARER);
        assert.equal(comodin.body.paginacion.total, 0, '".*" no debe funcionar como comodín');
    });

    it('incluye totalJugadores en cada equipo del listado', async () => {
        const conJugadores = await crearEquipo(api, usuario.token, { nombre: unico(`${prefijo} Con Plantilla`) });
        await crearJugador(api, usuario.token, conJugadores._id);
        await crearJugador(api, usuario.token, conJugadores._id);

        const res = await api.get('/api/equipos').query({ nombre: prefijo, limite: 100 }).auth(usuario.token, BEARER);

        assert.equal(res.status, 200);
        for (const equipo of res.body.datos) {
            assert.equal(typeof equipo.totalJugadores, 'number', `${equipo.nombre} sin totalJugadores`);
        }
        const encontrado = res.body.datos.find((e) => e._id === conJugadores._id);
        assert.equal(encontrado.totalJugadores, 2);
        assert.equal(res.body.datos.find((e) => e.nombre === `${prefijo} Club 1`).totalJugadores, 0);
    });
});

describe('Relación equipo → jugadores', () => {
    let equipo;

    before(async () => {
        equipo = await crearEquipo(api, usuario.token);
        for (const numeroCamiseta of [30, 7, 15]) {
            await crearJugador(api, usuario.token, equipo._id, { numeroCamiseta });
        }
    });

    it('GET /api/equipos/:id incluye los jugadores ordenados por número de camiseta', async () => {
        const res = await api.get(`/api/equipos/${equipo._id}`).auth(usuario.token, BEARER);

        assert.equal(res.status, 200);
        assert.equal(res.body.datos.totalJugadores, 3);
        assert.deepEqual(res.body.datos.jugadores.map((j) => j.numeroCamiseta), [7, 15, 30]);
        assert.ok(res.body.datos.jugadores.every((j) => j.equipo === equipo._id));
    });

    it('GET /api/equipos/:id/jugadores devuelve la plantilla ordenada', async () => {
        const res = await api.get(`/api/equipos/${equipo._id}/jugadores`).auth(usuario.token, BEARER);

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.equipo, { _id: equipo._id, nombre: equipo.nombre });
        assert.equal(res.body.total, 3);
        assert.deepEqual(res.body.datos.map((j) => j.numeroCamiseta), [7, 15, 30]);
    });

    it('GET /api/equipos/:id/jugadores de un equipo vacío devuelve una lista vacía', async () => {
        const vacio = await crearEquipo(api, usuario.token);
        const res = await api.get(`/api/equipos/${vacio._id}/jugadores`).auth(usuario.token, BEARER);

        assert.equal(res.status, 200);
        assert.equal(res.body.total, 0);
        assert.deepEqual(res.body.datos, []);
    });
});

describe('Eliminación de equipos', () => {
    it('responde 403 si un usuario sin rol admin intenta eliminar', async () => {
        const equipo = await crearEquipo(api, usuario.token);

        const res = await api.delete(`/api/equipos/${equipo._id}`).auth(usuario.token, BEARER);
        assert.equal(res.status, 403);
        assert.equal(res.body.error, 'Acción permitida solo para el rol: admin');

        const sigue = await api.get(`/api/equipos/${equipo._id}`).auth(usuario.token, BEARER);
        assert.equal(sigue.status, 200, 'el equipo no debe eliminarse');
    });

    it('responde 409 con detalles.totalJugadores si el equipo tiene jugadores', async () => {
        const equipo = await crearEquipo(api, usuario.token);
        await crearJugador(api, usuario.token, equipo._id);
        await crearJugador(api, usuario.token, equipo._id);

        for (const query of [{}, { cascada: 'false' }]) {
            const res = await api.delete(`/api/equipos/${equipo._id}`).query(query).auth(admin.token, BEARER);
            assert.equal(res.status, 409);
            assert.deepEqual(res.body.detalles, { totalJugadores: 2 });
            assert.match(res.body.error, /cascada=true/);
        }

        const sigue = await api.get(`/api/equipos/${equipo._id}`).auth(usuario.token, BEARER);
        assert.equal(sigue.status, 200);
        assert.equal(sigue.body.datos.totalJugadores, 2);
    });

    it('con ?cascada=true elimina el equipo y todos sus jugadores', async () => {
        const equipo = await crearEquipo(api, usuario.token);
        const jugadores = [
            await crearJugador(api, usuario.token, equipo._id),
            await crearJugador(api, usuario.token, equipo._id),
            await crearJugador(api, usuario.token, equipo._id)
        ];

        const res = await api.delete(`/api/equipos/${equipo._id}`).query({ cascada: 'true' }).auth(admin.token, BEARER);
        assert.equal(res.status, 200);
        assert.equal(res.body.jugadoresEliminados, 3);
        assert.equal(res.body.datos._id, equipo._id);

        for (const jugador of jugadores) {
            const consulta = await api.get(`/api/jugadores/${jugador._id}`).auth(usuario.token, BEARER);
            assert.equal(consulta.status, 404);
        }
        const equipoBorrado = await api.get(`/api/equipos/${equipo._id}`).auth(usuario.token, BEARER);
        assert.equal(equipoBorrado.status, 404);
    });

    it('elimina un equipo sin jugadores con 200', async () => {
        const equipo = await crearEquipo(api, usuario.token);

        const res = await api.delete(`/api/equipos/${equipo._id}`).auth(admin.token, BEARER);
        assert.equal(res.status, 200);
        assert.equal(res.body.jugadoresEliminados, 0);

        const otraVez = await api.delete(`/api/equipos/${equipo._id}`).auth(admin.token, BEARER);
        assert.equal(otraVez.status, 404);
    });
});
