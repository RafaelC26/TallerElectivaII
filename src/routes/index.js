import { Router } from 'express';
import authRoutes from './auth.routes.js';
import equiposRoutes from './equipos.routes.js';
import jugadoresRoutes from './jugadores.routes.js';
import { conectarBD, estadoBD } from '../config/db.js';
import { variablesFaltantes } from '../config/env.js';

const router = Router();

router.get('/', (req, res) => {
    res.json({
        nombre: 'API Equipos y Jugadores',
        version: '1.0.0',
        documentacion: '/api-docs',
        recursos: ['/api/auth', '/api/equipos', '/api/jugadores', '/api/health']
    });
});

// Estado del servicio y de la conexión con MongoDB Atlas (público)
router.get('/health', async (req, res) => {
    let baseDatos;
    try {
        await conectarBD();
        baseDatos = estadoBD();
    } catch (error) {
        baseDatos = `error: ${error.message}`;
    }
    const faltantes = variablesFaltantes();
    const ok = baseDatos === 'conectado' && faltantes.length === 0;

    res.status(ok ? 200 : 503).json({
        estado: ok ? 'ok' : 'degradado',
        baseDatos,
        ...(faltantes.length && { variablesFaltantes: faltantes }),
        fecha: new Date().toISOString()
    });
});

// Todas las rutas siguientes necesitan la base de datos
router.use(async (req, res, next) => {
    await conectarBD();
    next();
});

router.use('/auth', authRoutes);
router.use('/equipos', equiposRoutes);
router.use('/jugadores', jugadoresRoutes);

export default router;
