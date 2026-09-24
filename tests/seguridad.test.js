import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
    startServer,
    stopServer,
    registrar,
    crearAdmin,
    crearEquipo,
    crearJugador,
    unico,
    JWT_SECRET,
    EMISOR,
    BEARER
} from './helpers.js';

let api;
let modelos;
let usuario;

before(async () => {
    ({ api, modelos } = await startServer());
    usuario = await registrar(api, { nombre: 'Usuario Normal' });
});

after(stopServer);

describe('Cabeceras de seguridad (helmet y CORS)', () => {
    it('incluye las cabeceras de helmet y oculta X-Powered-By', async () => {
        const res = await api.get('/api');

        assert.equal(res.headers['x-content-type-options'], 'nosniff');
        assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
        assert.equal(res.headers['x-powered-by'], undefined);
        assert.match(res.headers['content-security-policy'], /default-src 'self'/);
        assert.match(res.headers['content-security-policy'], /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
    });

    it('permite CORS desde cualquier origen cuando CORS_ORIGIN es "*"', async () => {
        const res = await api.get('/api/health').set('Origin', 'https://ejemplo.com');
        assert.equal(res.headers['access-control-allow-origin'], '*');

        const preflight = await api
            .options('/api/equipos')
            .set('Origin', 'https://ejemplo.com')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'authorization,content-type');
        assert.equal(preflight.status, 204);
    });
});

describe('Validación de entradas', () => {
    it('responde 413 si el cuerpo supera 100 kb', async () => {
        const res = await api
            .post('/api/auth/registro')
            .send({ nombre: 'Grande', email: 'grande@correo.com', password: 'x'.repeat(120 * 1024) });

        assert.equal(res.status, 413);
        assert.equal(res.body.error, 'El cuerpo de la petición es demasiado grande');
    });

    it('rechaza operadores de MongoDB enviados como valores de campos', async () => {
        const res = await api
            .post('/api/equipos')
            .auth(usuario.token, BEARER)
            .send({ nombre: { $gt: '' }, ciudad: 'Tunja' });

        assert.equal(res.status, 400);
        assert.deepEqual(Object.keys(res.body).sort(), ['detalles', 'error']);
    });

    it('ignora los operadores de MongoDB en la query string de los filtros', async () => {
        const equipos = await api.get('/api/equipos?nombre[$ne]=x&ciudad[$regex]=.*').auth(usuario.token, BEARER);
        assert.equal(equipos.status, 200);

        const jugadores = await api.get('/api/jugadores?equipo[$ne]=x').auth(usuario.token, BEARER);
        assert.equal(jugadores.status, 200);
    });

    it('responde 400 si un filtro llega repetido (arreglo) en lugar de un texto', async () => {
        const equipo = await api.get('/api/jugadores?equipo=a&equipo=b').auth(usuario.token, BEARER);
        const posicion = await api.get('/api/jugadores?posicion=Portero&posicion=Defensa').auth(usuario.token, BEARER);

        assert.equal(equipo.status, 400);
        assert.equal(posicion.status, 400);
    });

    it('los errores no exponen detalles internos (stack, nombres de Mongoose)', async () => {
        const res = await api.post('/api/equipos').auth(usuario.token, BEARER).send({ nombre: 'X', anioFundacion: 'abc' });

        assert.equal(res.status, 400);
        const texto = JSON.stringify(res.body);
        assert.doesNotMatch(texto, /stack|ValidatorError|CastError|node_modules/);
    });
});

describe('Autorización por rol', () => {
    it('el rol se lee de la base de datos, no del token (un token con rol "admin" falsificado no basta)', async () => {
        const equipo = await crearEquipo(api, usuario.token);
        const tokenConRolAdmin = jwt.sign({ rol: 'admin', nombre: 'Falso Admin' }, JWT_SECRET, {
            subject: usuario.usuario._id,
            issuer: EMISOR,
            algorithm: 'HS256',
            expiresIn: '1h'
        });

        const res = await api.delete(`/api/equipos/${equipo._id}`).auth(tokenConRolAdmin, BEARER);
        assert.equal(res.status, 403);
    });

    it('un admin degradado a usuario pierde el permiso de eliminar aunque su token siga vigente', async () => {
        const admin = await crearAdmin(api);
        const equipo = await crearEquipo(api, admin.token);
        const jugador = await crearJugador(api, admin.token, equipo._id);

        await modelos.Usuario.updateOne({ _id: admin.usuario._id }, { rol: 'usuario' });

        const res = await api.delete(`/api/jugadores/${jugador._id}`).auth(admin.token, BEARER);
        assert.equal(res.status, 403);
    });

    it('un usuario promovido a admin puede eliminar', async () => {
        const admin = await crearAdmin(api);
        const equipo = await crearEquipo(api, usuario.token, { nombre: unico('Para Borrar') });

        const res = await api.delete(`/api/equipos/${equipo._id}`).auth(admin.token, BEARER);
        assert.equal(res.status, 200);
    });
});
