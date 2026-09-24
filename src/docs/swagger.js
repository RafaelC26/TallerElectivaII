import { Router } from 'express';
import { openapi } from './openapi.js';

// Swagger UI se carga desde CDN: swagger-ui-express sirve sus assets desde node_modules,
// y en Vercel esos archivos no se incluyen en la función (la UI queda en blanco).
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.0';

const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Documentación · API Equipos y Jugadores</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css">
  <link rel="stylesheet" href="/css/swagger.css">
</head>
<body>
  <header class="docs-bar">
    <a class="docs-brand" href="/">
      <img src="/favicon.svg" alt="" width="28" height="28">
      <span>API Equipos y Jugadores</span>
    </a>
    <nav class="docs-nav">
      <a href="/">Inicio</a>
      <a href="/#diagramas">Diagramas</a>
      <a href="/api-docs.json" target="_blank" rel="noopener">OpenAPI JSON</a>
    </nav>
  </header>
  <main id="swagger-ui"></main>
  <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
  <script src="/api-docs/init.js"></script>
</body>
</html>`;

const init = `window.addEventListener('load', function () {
  window.ui = SwaggerUIBundle({
    url: '/api-docs.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
    tryItOutEnabled: true,
    defaultModelsExpandDepth: 0
  });
});`;

const router = Router();

router.get('/api-docs.json', (req, res) => res.json(openapi));
router.get('/api-docs/init.js', (req, res) => res.type('application/javascript').send(init));
router.get(['/api-docs', '/api-docs/'], (req, res) => res.type('html').send(html));

export default router;
