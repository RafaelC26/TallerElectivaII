// Pruebas de regresión de los hallazgos de la auditoría (concurrencia, validaciones y errores)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import {
    startServer,
    stopServer,
    registrar,
    crearAdmin,
    crearEquipo,
    crearJugador,
    unico,
    emailUnico,
    camposConError,
    JWT_SECRET,
    PASSWORD,
    BEARER
} from './helpers.js';

const ejecutar = promisify(execFile);

let api;
let modelos;
let admin;
let usuario;

before(async () => {
    ({ api, modelos } = await startServer());
    admin = await crearAdmin(api);
    usuario = await registrar(api, { nombre: 'Usuario Normal' });
});

after(stopServer);

const jugadorNuevo = (equipo, numeroCamiseta) => ({
    nombre: 'Juan',
    apellido: unico('Concurrente'),
    numeroCamiseta,
    posicion: 'Defensa',
    fechaNacimiento: '2000-05-14',
    equipo
});

async function equipoCon(cantidad) {
    const equipo = await crearEquipo(api, usuario.token);
    for (let i = 1; i <= cantidad; i++) {
        await crearJugador(api, usuario.token, equipo._id, { numeroCamiseta: i });
    }
    return equipo;
}

describe('Reglas de negocio con peticiones simultáneas (transacciones)', () => {
    it('el cupo de 25 jugadores se respeta aunque lleguen varias altas a la vez', async () => {
        const equipo = await equipoCon(24);

        const respuestas = await Promise.all(
            [50, 51, 52, 53, 54, 55].map((numero) =>
                api.post('/api/jugadores').auth(usuario.token, BEARER).send(jugadorNuevo(equipo._id, numero))
            )
        );

        const estados = respuestas.map((r) => r.status).sort();
        assert.deepEqual(estados, [201, 409, 409, 409, 409, 409]);
        assert.equal(await modelos.Jugador.countDocuments({ equipo: equipo._id }), 25);
    });

    it('el cupo también se respeta con transferencias simultáneas', async () => {
        const destino = await equipoCon(24);
        const origen = await crearEquipo(api, usuario.token);
        const transferibles = [];
        for (const numero of [60, 61, 62, 63]) {
            transferibles.push(await crearJugador(api, usuario.token, origen._id, { numeroCamiseta: numero }));
        }

        const respuestas = await Promise.all(
            transferibles.map((j) => api.put(`/api/jugadores/${j._id}`).auth(usuario.token, BEARER).send({ equipo: destino._id }))
        );

        assert.equal(respuestas.filter((r) => r.status === 200).length, 1);
        assert.ok(respuestas.every((r) => [200, 409].includes(r.status)));
        assert.equal(await modelos.Jugador.countDocuments({ equipo: destino._id }), 25);
    });

    it('borrar un equipo mientras se le agrega un jugador nunca deja jugadores huérfanos', async () => {
        for (let intento = 0; intento < 8; intento++) {
            const equipo = await crearEquipo(api, usuario.token);
            const [borrado, alta] = await Promise.all([
                api.delete(`/api/equipos/${equipo._id}`).auth(admin.token, BEARER),
                api.post('/api/jugadores').auth(usuario.token, BEARER).send(jugadorNuevo(equipo._id, 7))
            ]);

            const combinacion = `${borrado.status}/${alta.status}`;
            // O se borró primero (alta → 422) o se agregó primero (borrado → 409 por tener jugadores)
            assert.ok(['200/422', '409/201'].includes(combinacion), `combinación inesperada ${combinacion}`);

            const existeEquipo = await modelos.Equipo.exists({ _id: equipo._id });
            const jugadores = await modelos.Jugador.countDocuments({ equipo: equipo._id });
            assert.ok(existeEquipo || jugadores === 0, 'quedó un jugador apuntando a un equipo eliminado');
        }
    });

    it('un PUT sobre un jugador que se elimina al mismo tiempo responde 200 o 404, nunca 500', async () => {
        const equipo = await crearEquipo(api, usuario.token);
        for (let intento = 0; intento < 5; intento++) {
            const jugador = await crearJugador(api, usuario.token, equipo._id);
            const [edicion, borrado] = await Promise.all([
                api.put(`/api/jugadores/${jugador._id}`).auth(usuario.token, BEARER).send({ posicion: 'Delantero' }),
                api.delete(`/api/jugadores/${jugador._id}`).auth(admin.token, BEARER)
            ]);
            assert.ok([200, 404].includes(edicion.status), `PUT respondió ${edicion.status}`);
            assert.equal(borrado.status, 200);
        }
    });
});

describe('Validaciones estrictas', () => {
    let equipo;

    before(async () => {
        equipo = await crearEquipo(api, usuario.token);
    });

    for (const fecha of ['2000-02-30', '2000-13-01', '5', 'hola 2000', 'June 5 2000', 20]) {
        it(`rechaza la fecha de nacimiento ${JSON.stringify(fecha)} con 400`, async () => {
            const res = await api
                .post('/api/jugadores')
                .auth(usuario.token, BEARER)
                .send({ ...jugadorNuevo(equipo._id, 30), fechaNacimiento: fecha });

            assert.equal(res.status, 400);
            assert.deepEqual(camposConError(res.body), ['fechaNacimiento']);
        });
    }

    it('acepta fechas reales en formato AAAA-MM-DD o ISO completo (incluido el 29 de febrero bisiesto)', async () => {
        const bisiesto = await api
            .post('/api/jugadores')
            .auth(usuario.token, BEARER)
            .send({ ...jugadorNuevo(equipo._id, 31), fechaNacimiento: '2000-02-29' });
        assert.equal(bisiesto.status, 201);
        assert.equal(bisiesto.body.datos.fechaNacimiento, '2000-02-29T00:00:00.000Z');

        const iso = await api
            .post('/api/jugadores')
            .auth(usuario.token, BEARER)
            .send({ ...jugadorNuevo(equipo._id, 32), fechaNacimiento: '1999-12-31T00:00:00.000Z' });
        assert.equal(iso.status, 201);
    });

    it('anioFundacion (opcional) se puede borrar enviando null', async () => {
        const otro = await crearEquipo(api, usuario.token, { anioFundacion: 1990 });
        const res = await api.put(`/api/equipos/${otro._id}`).auth(usuario.token, BEARER).send({ anioFundacion: null });

        assert.equal(res.status, 200);
        assert.equal(res.body.datos.anioFundacion ?? null, null);
    });

    it('rechaza contraseñas de más de 72 bytes aunque tengan menos de 72 caracteres', async () => {
        const password = `Clave1${'ñ'.repeat(40)}`; // 46 caracteres, 86 bytes
        const res = await api.post('/api/auth/registro').send({ nombre: 'Ñandú', email: emailUnico(), password });

        assert.equal(res.status, 400);
        assert.deepEqual(camposConError(res.body), ['password']);
    });

    it('el registro con datos inválidos responde 400 aunque el email ya exista (no revela usuarios)', async () => {
        const res = await api
            .post('/api/auth/registro')
            .send({ nombre: 'X', email: usuario.credenciales.email, password: 'corta' });

        assert.equal(res.status, 400);
    });
});

describe('Errores del cliente y del protocolo', () => {
    it('acepta el esquema "bearer" sin distinguir mayúsculas', async () => {
        for (const esquema of ['bearer', 'BEARER', 'Bearer ']) {
            const res = await api.get('/api/auth/perfil').set('Authorization', `${esquema} ${usuario.token}`);
            assert.equal(res.status, 200, `falló con "${esquema}"`);
        }
    });

    it('responde 415 (no 500) a un charset o una codificación no soportados', async () => {
        const charset = await api
            .post('/api/auth/login')
            .set('Content-Type', 'application/json; charset=latin1')
            .send(JSON.stringify({ email: 'a@b.co', password: 'x' }));
        assert.equal(charset.status, 415);

        const codificacion = await api
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .set('Content-Encoding', 'zzz')
            .send(JSON.stringify({ email: 'a@b.co', password: 'x' }));
        assert.equal(codificacion.status, 415);
    });

    it('responde 400 (no 500) a un parámetro de URL mal codificado', async () => {
        const res = await api.get('/api/equipos/%E0%A4%A').auth(usuario.token, BEARER);
        assert.equal(res.status, 400);
    });

    it('DELETE de un jugador devuelve el equipo poblado, como documenta Swagger', async () => {
        const equipo = await crearEquipo(api, usuario.token);
        const jugador = await crearJugador(api, usuario.token, equipo._id);
        const res = await api.delete(`/api/jugadores/${jugador._id}`).auth(admin.token, BEARER);

        assert.equal(res.status, 200);
        assert.equal(res.body.datos.equipo.nombre, equipo.nombre);
    });
});

describe('Orden alfabético en español', () => {
    it('ordena equipos ignorando tildes y mayúsculas', async () => {
        const marca = unico('Orden').replace(/\s/g, '');
        for (const nombre of ['Zipaquirá', 'atlético', 'Águilas', 'Bucaramanga']) {
            await crearEquipo(api, usuario.token, { nombre: `${nombre} ${marca}` });
        }

        const res = await api.get(`/api/equipos?nombre=${marca}`).auth(usuario.token, BEARER);
        assert.deepEqual(
            res.body.datos.map((e) => e.nombre.split(' ')[0]),
            ['Águilas', 'atlético', 'Bucaramanga', 'Zipaquirá']
        );
    });
});

describe('Configuración insegura', () => {
    it('un JWT_SECRET corto se reporta en /api/health y bloquea la emisión de tokens', async () => {
        const { env } = await import('../src/config/env.js');
        const original = env.JWT_SECRET;
        env.JWT_SECRET = 'corto';
        try {
            const salud = await api.get('/api/health');
            assert.equal(salud.status, 503);
            assert.deepEqual(salud.body.variablesFaltantes, ['JWT_SECRET']);

            const login = await api.post('/api/auth/login').send(usuario.credenciales);
            assert.equal(login.status, 500);
            assert.match(login.body.error, /JWT_SECRET/);
        } finally {
            env.JWT_SECRET = original;
        }
    });

    it('el seed no asciende a admin una cuenta que ya existía con ADMIN_EMAIL', async () => {
        const intruso = await registrar(api, { nombre: 'Intruso', email: emailUnico() });
        const raiz = path.join(import.meta.dirname, '..');

        await assert.rejects(
            ejecutar(process.execPath, ['scripts/seed.js'], {
                cwd: raiz,
                env: {
                    ...process.env,
                    MONGODB_URI: process.env.MONGODB_URI,
                    JWT_SECRET,
                    ADMIN_EMAIL: intruso.credenciales.email,
                    ADMIN_PASSWORD: PASSWORD
                }
            }),
            (error) => error.code === 1 && /no se asciende/.test(error.stderr)
        );

        const guardado = await modelos.Usuario.findById(intruso.usuario._id);
        assert.equal(guardado.rol, 'usuario');
    });
});
