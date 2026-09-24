import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import { startServer, stopServer, idInexistente } from './helpers.js';

let api;
let app;
let routers;

before(async () => {
    ({ api, app } = await startServer());

    // Mismas instancias que usa la app (módulos en caché): permiten saber dónde está montado cada router
    routers = {
        docs: (await import('../src/docs/swagger.js')).default,
        api: (await import('../src/routes/index.js')).default,
        auth: (await import('../src/routes/auth.routes.js')).default,
        equipos: (await import('../src/routes/equipos.routes.js')).default,
        jugadores: (await import('../src/routes/jugadores.routes.js')).default
    };
});

after(stopServer);

const METODOS_HTTP = ['get', 'post', 'put', 'patch', 'delete'];

// Express 5 no guarda la ruta de montaje en la capa: se replica lo que hacen app.js y routes/index.js
function prefijoDe(router) {
    const prefijos = new Map([
        [routers.api, '/api'],
        [routers.auth, '/auth'],
        [routers.equipos, '/equipos'],
        [routers.jugadores, '/jugadores']
    ]);
    return prefijos.get(router);
}

// '/api/equipos/:id/' -> '/api/equipos/{id}'
function aFormatoOpenApi(ruta) {
    const sinBarraFinal = ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta;
    return sinBarraFinal.replace(/:(\w+)/g, '{$1}');
}

function rutasRegistradas(stack, prefijo = '') {
    const rutas = [];
    for (const capa of stack) {
        if (capa.route) {
            for (const ruta of [capa.route.path].flat()) {
                for (const metodo of Object.keys(capa.route.methods)) {
                    rutas.push(`${metodo.toUpperCase()} ${aFormatoOpenApi(prefijo + ruta)}`);
                }
            }
        } else if (capa.handle?.stack) {
            // Las rutas de Swagger UI sirven la propia documentación: no forman parte de la API
            if (capa.handle === routers.docs) continue;

            const prefijoRouter = prefijoDe(capa.handle);
            assert.notEqual(prefijoRouter, undefined, 'Hay un router montado cuyo prefijo no conoce esta prueba');
            rutas.push(...rutasRegistradas(capa.handle.stack, prefijo + prefijoRouter));
        }
    }
    return [...new Set(rutas)].sort();
}

function operacionesDocumentadas(spec) {
    return Object.entries(spec.paths)
        .flatMap(([ruta, operaciones]) =>
            Object.keys(operaciones)
                .filter((metodo) => METODOS_HTTP.includes(metodo))
                .map((metodo) => `${metodo.toUpperCase()} ${ruta}`)
        )
        .sort();
}

describe('Documentación Swagger', () => {
    it('GET /api-docs devuelve la página HTML de Swagger UI', async () => {
        for (const ruta of ['/api-docs', '/api-docs/']) {
            const res = await api.get(ruta);

            assert.equal(res.status, 200, ruta);
            assert.match(res.headers['content-type'], /text\/html/);
            assert.match(res.text, /id="swagger-ui"/);
            assert.match(res.text, /swagger-ui-dist@[\d.]+\/swagger-ui-bundle\.js/);
            assert.match(res.text, /src="\/api-docs\/init\.js"/);
        }
    });

    it('GET /api-docs/init.js devuelve el JavaScript que inicializa Swagger UI', async () => {
        const res = await api.get('/api-docs/init.js');

        assert.equal(res.status, 200);
        assert.match(res.headers['content-type'], /application\/javascript/);
        assert.match(res.text, /SwaggerUIBundle\(/);
        assert.match(res.text, /url: '\/api-docs\.json'/);
    });

    it('GET /api-docs.json es una especificación OpenAPI 3 válida', async () => {
        const res = await api.get('/api-docs.json');

        assert.equal(res.status, 200);
        assert.match(res.headers['content-type'], /application\/json/);
        assert.equal(res.body.openapi, '3.0.3');

        // El parser resuelve los $ref sobre el mismo objeto: se valida una copia
        await assert.doesNotReject(SwaggerParser.validate(structuredClone(res.body)));
    });

    it('cada ruta registrada en Express está documentada con el mismo método', async () => {
        const { body: spec } = await api.get('/api-docs.json');
        const documentadas = new Set(operacionesDocumentadas(spec));
        // GET / sirve la página de inicio (HTML), igual que Swagger UI: no es una operación de la API
        const registradas = rutasRegistradas(app.router.stack).filter((ruta) => ruta !== 'GET /');

        assert.ok(registradas.length >= 15, `Se esperaban al menos 15 rutas y se encontraron ${registradas.length}`);
        const sinDocumentar = registradas.filter((ruta) => !documentadas.has(ruta));
        assert.deepEqual(sinDocumentar, [], `Rutas sin documentar en openapi.js: ${sinDocumentar.join(', ')}`);
    });

    it('cada operación documentada existe realmente en Express', async () => {
        const { body: spec } = await api.get('/api-docs.json');
        const registradas = new Set(rutasRegistradas(app.router.stack));

        const inexistentes = operacionesDocumentadas(spec).filter((ruta) => !registradas.has(ruta));
        assert.deepEqual(inexistentes, [], `Operaciones documentadas que no existen: ${inexistentes.join(', ')}`);
    });

    it('la seguridad documentada (bearerAuth) coincide con la que exige la API', async () => {
        const { body: spec } = await api.get('/api-docs.json');

        for (const operacion of operacionesDocumentadas(spec)) {
            const [metodo, ruta] = operacion.split(' ');
            const definicion = spec.paths[ruta][metodo.toLowerCase()];
            const seguridad = definicion.security ?? spec.security ?? [];
            const pideToken = seguridad.some((requisito) => 'bearerAuth' in requisito);

            const url = ruta.replace('{id}', idInexistente());
            const res = await api[metodo.toLowerCase()](url).send({});

            if (pideToken) {
                assert.equal(res.status, 401, `${operacion} está documentada con token pero no lo exige`);
            } else {
                assert.notEqual(res.status, 401, `${operacion} está documentada como pública pero exige token`);
            }
        }
    });
});

describe('Rutas generales de la API', () => {
    it('GET /api describe la API', async () => {
        const res = await api.get('/api');

        assert.equal(res.status, 200);
        assert.equal(res.body.nombre, 'API Equipos y Jugadores');
        assert.equal(res.body.documentacion, '/api-docs');
        assert.ok(res.body.recursos.includes('/api/equipos'));
    });

    it('GET /api/health responde 200 con estado "ok" y la base de datos conectada', async () => {
        const res = await api.get('/api/health');

        assert.equal(res.status, 200);
        assert.equal(res.body.estado, 'ok');
        assert.equal(res.body.baseDatos, 'conectado');
        assert.equal(res.body.variablesFaltantes, undefined);
        assert.ok(!Number.isNaN(Date.parse(res.body.fecha)));
    });

    it('una ruta desconocida responde 404 en formato JSON', async () => {
        const res = await api.get('/api/no-existe');

        assert.equal(res.status, 404);
        assert.match(res.headers['content-type'], /application\/json/);
        assert.deepEqual(res.body, { error: 'Ruta no encontrada: GET /api/no-existe' });

        const fueraDeApi = await api.post('/no-existe');
        assert.equal(fueraDeApi.status, 404);
        assert.equal(fueraDeApi.body.error, 'Ruta no encontrada: POST /no-existe');
    });

    it('un cuerpo JSON mal formado responde 400', async () => {
        const res = await api
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{"email": "a@b.co", "password": ');

        assert.equal(res.status, 400);
        assert.deepEqual(res.body, { error: 'El cuerpo de la petición no es un JSON válido' });
    });

    it('GET / sirve la página de inicio estática', async () => {
        const res = await api.get('/');

        assert.equal(res.status, 200);
        assert.match(res.headers['content-type'], /text\/html/);
    });
});
