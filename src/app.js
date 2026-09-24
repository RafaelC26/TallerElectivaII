import express from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, esTest } from './config/env.js';
import apiRoutes from './routes/index.js';
import docsRoutes from './docs/swagger.js';
import { rutaNoEncontrada, manejadorErrores } from './middlewares/errores.js';

const app = express();

// En Vercel hay exactamente un proxy delante (reescribe X-Forwarded-For): así req.ip es la IP real.
// En local no hay proxy; confiar en ese header dejaría a un cliente saltarse el rate limit
app.set('trust proxy', process.env.VERCEL ? 1 : false);

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
                imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
                connectSrc: ["'self'"],
                upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null
            }
        }
    })
);
app.use(cors({ origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '100kb' }));

// Límite general de peticiones por IP para toda la API
app.use(
    '/api',
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 300,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        skip: () => esTest,
        message: { error: 'Demasiadas peticiones, intente de nuevo más tarde' }
    })
);

// Página de inicio y diagramas (en Vercel la carpeta public/ la sirve directamente la CDN)
app.use(express.static(path.join(import.meta.dirname, '..', 'public')));

// En Vercel la CDN no asocia "/" con index.html: esa ruta llega a la función y se responde aquí.
// new URL(..., import.meta.url) hace que Vercel incluya el archivo dentro de la función
const paginaInicio = readFileSync(new URL('../public/index.html', import.meta.url));
app.get('/', (req, res) => res.type('html').send(paginaInicio));

app.use(docsRoutes);
app.use('/api', apiRoutes);

app.use(rutaNoEncontrada);
app.use(manejadorErrores);

export default app;
