import { Router } from 'express';
import {
    listarJugadores,
    obtenerJugador,
    crearJugador,
    actualizarJugador,
    eliminarJugador
} from '../controllers/jugadores.controller.js';
import { autenticar, autorizar } from '../middlewares/auth.js';
import { validarId } from '../middlewares/validarId.js';

const router = Router();

router.param('id', validarId);
router.use(autenticar);

router.route('/')
    .get(listarJugadores)
    .post(crearJugador);

router.route('/:id')
    .get(obtenerJugador)
    .put(actualizarJugador)
    .delete(autorizar('admin'), eliminarJugador);

export default router;
