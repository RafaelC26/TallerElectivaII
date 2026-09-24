// Utilidades compartidas por las pruebas de integración (no es un archivo *.test.js)
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

// Secreto propio de las pruebas: así los tests pueden firmar tokens (vencidos, con otro emisor...)
export const JWT_SECRET = randomBytes(48).toString('hex');
export const EMISOR = 'api-equipos-jugadores';
export const PASSWORD = 'ClaveSegura123';
export const BEARER = { type: 'bearer' };

let mongo;
let servidor;
let db;
let modelos;

/**
 * Levanta MongoDB en memoria y la app en un puerto libre.
 * Devuelve { app, api, modelos } donde api es el cliente de supertest.
 */
export async function startServer() {
    // Replica set de un nodo: las transacciones (cupo de 25, borrado en cascada) lo necesitan, igual que en Atlas
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });

    // Deben definirse ANTES de importar la app: env.js lee process.env al cargarse
    // y dotenv nunca sobrescribe variables que ya existen (el .env real no interviene)
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongo.getUri('equipos_test');
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_EXPIRES_IN = '2h';
    process.env.CORS_ORIGIN = '*';
    process.env.DOTENV_CONFIG_QUIET = 'true';

    const { default: app } = await import('../src/app.js');
    db = await import('../src/config/db.js');
    modelos = await import('../src/models/index.js');

    // Conectar antes de las pruebas garantiza que los índices únicos ya existan
    await db.conectarBD();

    servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');

    return { app, api: request(servidor), modelos };
}

export async function stopServer() {
    if (servidor) {
        servidor.closeAllConnections();
        await new Promise((resolver) => servidor.close(resolver));
    }
    if (db) await db.desconectarBD();
    if (mongo) await mongo.stop();
}

// ---------- Datos únicos ----------
let contador = 0;

export function unico(prefijo) {
    contador += 1;
    return `${prefijo} ${contador}-${randomUUID().slice(0, 8)}`;
}

export function emailUnico() {
    contador += 1;
    return `usuario.${contador}.${randomUUID().slice(0, 8)}@correo.com`;
}

// ObjectId con formato válido que no corresponde a ningún documento
export function idInexistente() {
    return randomBytes(12).toString('hex');
}

// Fecha 'AAAA-MM-DD' (UTC) de hace N años, desplazada opcionalmente en días
export function fechaHaceAnios(anios, dias = 0) {
    const hoy = new Date();
    const fecha = new Date(Date.UTC(hoy.getUTCFullYear() - anios, hoy.getUTCMonth(), hoy.getUTCDate() + dias));
    return fecha.toISOString().slice(0, 10);
}

// ---------- Usuarios ----------
export async function registrar(api, overrides = {}) {
    const datos = { nombre: 'Usuario de prueba', email: emailUnico(), password: PASSWORD, ...overrides };
    const res = await api.post('/api/auth/registro').send(datos);
    assert.equal(res.status, 201, `No se pudo registrar el usuario: ${JSON.stringify(res.body)}`);

    return {
        token: res.body.token,
        usuario: res.body.usuario,
        credenciales: { email: datos.email, password: datos.password }
    };
}

export async function loginComo(api, { email, password }) {
    const res = await api.post('/api/auth/login').send({ email, password });
    assert.equal(res.status, 200, `No se pudo iniciar sesión: ${JSON.stringify(res.body)}`);
    return res.body.token;
}

// El registro público siempre crea rol "usuario": el admin se promueve directamente en la BD
export async function crearAdmin(api) {
    const { usuario, credenciales } = await registrar(api, { nombre: 'Administrador' });
    await modelos.Usuario.updateOne({ _id: usuario._id }, { rol: 'admin' });
    const token = await loginComo(api, credenciales);

    return { token, usuario: { ...usuario, rol: 'admin' }, credenciales };
}

// ---------- Equipos y jugadores ----------
export async function crearEquipo(api, token, overrides = {}) {
    const datos = {
        nombre: unico('Equipo'),
        ciudad: 'Tunja',
        estadio: 'Estadio La Independencia',
        anioFundacion: 2003,
        entrenador: 'Andrés Mesa',
        ...overrides
    };
    const res = await api.post('/api/equipos').auth(token, BEARER).send(datos);
    assert.equal(res.status, 201, `No se pudo crear el equipo: ${JSON.stringify(res.body)}`);
    return res.body.datos;
}

async function siguienteNumeroLibre(api, token, equipoId) {
    const res = await api.get(`/api/equipos/${equipoId}/jugadores`).auth(token, BEARER);
    assert.equal(res.status, 200, `No se pudo consultar la plantilla: ${JSON.stringify(res.body)}`);
    const usados = new Set(res.body.datos.map((jugador) => jugador.numeroCamiseta));
    for (let numero = 1; numero <= 99; numero++) {
        if (!usados.has(numero)) return numero;
    }
    throw new Error(`El equipo ${equipoId} no tiene números de camiseta libres`);
}

export async function crearJugador(api, token, equipoId, overrides = {}) {
    const datos = {
        nombre: 'Jugador',
        apellido: unico('Prueba'),
        posicion: 'Centrocampista',
        fechaNacimiento: '2000-05-14',
        equipo: equipoId,
        ...overrides
    };
    datos.numeroCamiseta ??= await siguienteNumeroLibre(api, token, equipoId);

    const res = await api.post('/api/jugadores').auth(token, BEARER).send(datos);
    assert.equal(res.status, 201, `No se pudo crear el jugador: ${JSON.stringify(res.body)}`);
    return res.body.datos;
}

// Nombres de los campos reportados en "detalles" de un error de validación
export function camposConError(body) {
    assert.ok(Array.isArray(body.detalles), `Se esperaba "detalles" en la respuesta: ${JSON.stringify(body)}`);
    return body.detalles.map((detalle) => detalle.campo);
}
