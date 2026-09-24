import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
    startServer,
    stopServer,
    registrar,
    loginComo,
    emailUnico,
    camposConError,
    JWT_SECRET,
    EMISOR,
    PASSWORD,
    BEARER
} from './helpers.js';

let api;
let modelos;

before(async () => {
    ({ api, modelos } = await startServer());
});

after(stopServer);

// Token HS256 firmado igual que la API; las opciones permiten fabricar tokens inválidos
function firmar(sub, { secreto = JWT_SECRET, ...opciones } = {}) {
    return jwt.sign({ rol: 'usuario', nombre: 'Prueba' }, secreto, {
        subject: String(sub),
        issuer: EMISOR,
        algorithm: 'HS256',
        expiresIn: '1h',
        ...opciones
    });
}

const base64url = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');

describe('POST /api/auth/registro', () => {
    it('registra un usuario y responde 201 con token y usuario sin contraseña', async () => {
        const email = emailUnico();
        const res = await api
            .post('/api/auth/registro')
            .send({ nombre: '  Rafael Cristancho  ', email: `  ${email.toUpperCase()} `, password: PASSWORD });

        assert.equal(res.status, 201);
        assert.equal(res.body.mensaje, 'Usuario registrado correctamente');
        assert.equal(res.body.tipo, 'Bearer');
        assert.equal(res.body.expiraEn, '2h');
        assert.equal(typeof res.body.token, 'string');

        const { usuario } = res.body;
        assert.ok(usuario._id);
        assert.equal(usuario.nombre, 'Rafael Cristancho');
        assert.equal(usuario.email, email, 'el email se guarda sin espacios y en minúsculas');
        assert.equal(usuario.rol, 'usuario');
        assert.equal('password' in usuario, false, 'la respuesta no debe incluir la contraseña');

        const payload = jwt.verify(res.body.token, JWT_SECRET, { algorithms: ['HS256'], issuer: EMISOR });
        assert.equal(payload.sub, usuario._id);
        assert.equal(payload.rol, 'usuario');
    });

    it('guarda la contraseña cifrada con bcrypt, nunca en texto plano', async () => {
        const { usuario } = await registrar(api);
        const guardado = await modelos.Usuario.findById(usuario._id).select('+password').lean();

        assert.notEqual(guardado.password, PASSWORD);
        assert.match(guardado.password, /^\$2[aby]\$10\$/);
    });

    it('ignora el campo "rol" enviado en el cuerpo (asignación masiva)', async () => {
        const res = await api
            .post('/api/auth/registro')
            .send({ nombre: 'Intruso', email: emailUnico(), password: PASSWORD, rol: 'admin' });

        assert.equal(res.status, 201);
        assert.equal(res.body.usuario.rol, 'usuario');

        const guardado = await modelos.Usuario.findById(res.body.usuario._id).lean();
        assert.equal(guardado.rol, 'usuario');
        assert.equal(jwt.decode(res.body.token).rol, 'usuario');
    });

    it('responde 409 si el email ya está registrado, sin distinguir mayúsculas', async () => {
        const { credenciales } = await registrar(api);

        const res = await api
            .post('/api/auth/registro')
            .send({ nombre: 'Otra persona', email: credenciales.email.toUpperCase(), password: PASSWORD });

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Ya existe un usuario registrado con ese email');
    });

    const casosInvalidos = [
        { caso: 'nombre demasiado corto', cambios: { nombre: 'A' }, campo: 'nombre' },
        { caso: 'email con formato inválido', cambios: { email: 'no-es-un-email' }, campo: 'email' },
        { caso: 'contraseña sin números', cambios: { password: 'SoloLetrasAqui' }, campo: 'password' },
        { caso: 'contraseña de menos de 8 caracteres', cambios: { password: 'abc123' }, campo: 'password' }
    ];

    for (const { caso, cambios, campo } of casosInvalidos) {
        it(`responde 400 con detalles cuando hay ${caso}`, async () => {
            const res = await api
                .post('/api/auth/registro')
                .send({ nombre: 'Usuario Válido', email: emailUnico(), password: PASSWORD, ...cambios });

            assert.equal(res.status, 400);
            assert.equal(res.body.error, 'Datos inválidos');
            assert.deepEqual(camposConError(res.body), [campo]);
            assert.equal(typeof res.body.detalles[0].mensaje, 'string');
        });
    }

    it('responde 400 con un detalle por cada campo obligatorio faltante', async () => {
        const res = await api.post('/api/auth/registro').send({});

        assert.equal(res.status, 400);
        assert.deepEqual(camposConError(res.body).sort(), ['email', 'nombre', 'password']);
    });

    it('responde 400 si el cuerpo no es un objeto JSON', async () => {
        const res = await api.post('/api/auth/registro').send([{ nombre: 'Lista' }]);

        assert.equal(res.status, 400);
        assert.match(res.body.error, /cuerpo JSON/);
    });
});

describe('POST /api/auth/login', () => {
    let credenciales;

    before(async () => {
        ({ credenciales } = await registrar(api, { nombre: 'Usuaria Login' }));
    });

    it('inicia sesión y responde 200 con token y usuario sin contraseña', async () => {
        const res = await api.post('/api/auth/login').send(credenciales);

        assert.equal(res.status, 200);
        assert.equal(res.body.mensaje, 'Inicio de sesión exitoso');
        assert.equal(res.body.tipo, 'Bearer');
        assert.equal(res.body.usuario.email, credenciales.email);
        assert.equal('password' in res.body.usuario, false);
        assert.equal(jwt.verify(res.body.token, JWT_SECRET).sub, res.body.usuario._id);
    });

    it('acepta el email con mayúsculas y espacios alrededor', async () => {
        const res = await api
            .post('/api/auth/login')
            .send({ email: `  ${credenciales.email.toUpperCase()}  `, password: credenciales.password });

        assert.equal(res.status, 200);
    });

    it('responde 401 si la contraseña es incorrecta', async () => {
        const res = await api.post('/api/auth/login').send({ ...credenciales, password: 'Incorrecta999' });

        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Credenciales inválidas');
        assert.equal(res.body.token, undefined);
    });

    it('responde 401 con el mismo mensaje si el email no existe (no permite enumerar usuarios)', async () => {
        const res = await api.post('/api/auth/login').send({ email: emailUnico(), password: PASSWORD });

        assert.equal(res.status, 401);
        assert.deepEqual(res.body, { error: 'Credenciales inválidas' });
    });

    it('responde 400 si falta el email o la contraseña', async () => {
        const sinPassword = await api.post('/api/auth/login').send({ email: credenciales.email });
        const sinEmail = await api.post('/api/auth/login').send({ password: credenciales.password });

        assert.equal(sinPassword.status, 400);
        assert.equal(sinEmail.status, 400);
        assert.equal(sinPassword.body.error, 'El email y la contraseña son obligatorios');
    });

    it('rechaza la inyección NoSQL en el email ({ "$gt": "" })', async () => {
        const res = await api.post('/api/auth/login').send({ email: { $gt: '' }, password: credenciales.password });

        assert.ok([400, 401].includes(res.status), `status inesperado ${res.status}`);
        assert.equal(res.body.token, undefined);
    });

    it('rechaza la inyección NoSQL en la contraseña ({ "$ne": null })', async () => {
        const res = await api.post('/api/auth/login').send({ email: credenciales.email, password: { $ne: null } });

        assert.ok([400, 401].includes(res.status), `status inesperado ${res.status}`);
        assert.equal(res.body.token, undefined);
    });
});

describe('GET /api/auth/perfil', () => {
    let sesion;

    before(async () => {
        sesion = await registrar(api, { nombre: 'Perfil Prueba' });
    });

    it('responde 200 con los datos del usuario autenticado', async () => {
        const res = await api.get('/api/auth/perfil').auth(sesion.token, BEARER);

        assert.equal(res.status, 200);
        assert.equal(res.body.datos._id, sesion.usuario._id);
        assert.equal(res.body.datos.email, sesion.credenciales.email);
        assert.equal(res.body.datos.rol, 'usuario');
        assert.equal('password' in res.body.datos, false);
    });

    it('funciona con el token obtenido en el login', async () => {
        const token = await loginComo(api, sesion.credenciales);
        const res = await api.get('/api/auth/perfil').auth(token, BEARER);

        assert.equal(res.status, 200);
        assert.equal(res.body.datos._id, sesion.usuario._id);
    });

    it('responde 401 con WWW-Authenticate si falta el header Authorization', async () => {
        const res = await api.get('/api/auth/perfil');

        assert.equal(res.status, 401);
        assert.equal(res.headers['www-authenticate'], 'Bearer');
        assert.match(res.body.error, /Token no proporcionado/);
    });

    it('responde 401 si el esquema no es Bearer', async () => {
        const res = await api.get('/api/auth/perfil').set('Authorization', `Basic ${sesion.token}`);

        assert.equal(res.status, 401);
        assert.equal(res.headers['www-authenticate'], 'Bearer');
    });

    it('responde 401 si el token está mal formado', async () => {
        const res = await api.get('/api/auth/perfil').auth('esto.no-es.un-jwt', BEARER);

        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Token inválido');
        assert.match(res.headers['www-authenticate'], /invalid_token/);
    });

    it('responde 401 si el token fue firmado con otro secreto', async () => {
        const token = firmar(sesion.usuario._id, { secreto: 'otro-secreto-que-no-es-el-de-la-api-0123456789' });
        const res = await api.get('/api/auth/perfil').auth(token, BEARER);

        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Token inválido');
    });

    it('responde 401 si el token usa el algoritmo "none"', async () => {
        const ahora = Math.floor(Date.now() / 1000);
        const cabecera = base64url({ alg: 'none', typ: 'JWT' });
        const payload = base64url({ sub: sesion.usuario._id, rol: 'admin', iss: EMISOR, iat: ahora, exp: ahora + 3600 });
        const res = await api.get('/api/auth/perfil').auth(`${cabecera}.${payload}.`, BEARER);

        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Token inválido');
    });

    it('responde 401 si el token fue emitido por otro emisor', async () => {
        const token = firmar(sesion.usuario._id, { issuer: 'otra-api' });
        const res = await api.get('/api/auth/perfil').auth(token, BEARER);

        assert.equal(res.status, 401);
    });

    it('responde 401 si el token expiró', async () => {
        const token = firmar(sesion.usuario._id, { expiresIn: '-10s' });
        const res = await api.get('/api/auth/perfil').auth(token, BEARER);

        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'El token ha expirado, inicie sesión nuevamente');
        assert.match(res.headers['www-authenticate'], /invalid_token/);
    });

    it('responde 401 si el usuario del token ya fue eliminado', async () => {
        const eliminado = await registrar(api, { nombre: 'Usuario Eliminado' });
        await modelos.Usuario.deleteOne({ _id: eliminado.usuario._id });

        const res = await api.get('/api/auth/perfil').auth(eliminado.token, BEARER);

        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'El usuario del token ya no existe');
    });
});
