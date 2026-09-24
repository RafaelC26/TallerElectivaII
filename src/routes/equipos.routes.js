import { Router } from 'express';
import {
    listarEquipos,
    obtenerEquipo,
    crearEquipo,
    actualizarEquipo,
    eliminarEquipo,
    listarJugadoresDeEquipo
} from '../controllers/equipos.controller.js';
import { autenticar, autorizar } from '../middlewares/auth.js';
import { validarId } from '../middlewares/validarId.js';

const router = Router();

router.param('id', validarId);
router.use(autenticar);

router.route('/')
    .get(listarEquipos)
    .post(crearEquipo);

router.route('/:id')
    .get(obtenerEquipo)
    .put(actualizarEquipo)
    .delete(autorizar('admin'), eliminarEquipo);

router.get('/:id/jugadores', listarJugadoresDeEquipo);

export default router;
