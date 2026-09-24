import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { registrar, login, perfil } from '../controllers/auth.controller.js';
import { autenticar } from '../middlewares/auth.js';
import { esTest } from '../config/env.js';

const router = Router();

// Frena ataques de fuerza bruta: 20 intentos de login/registro cada 15 minutos por IP
const limiteAuth = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => esTest,
    message: { error: 'Demasiados intentos, intente de nuevo en 15 minutos' }
});

router.post('/registro', limiteAuth, registrar);
router.post('/login', limiteAuth, login);
router.get('/perfil', autenticar, perfil);

export default router;
