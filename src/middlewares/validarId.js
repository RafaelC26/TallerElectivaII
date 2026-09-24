import { ApiError } from '../utils/ApiError.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

// router.param('id', validarId): responde 400 si el :id no es un ObjectId de MongoDB
export function validarId(req, res, next, valor) {
    if (!OBJECT_ID.test(valor)) {
        return next(ApiError.badRequest(`El id "${valor}" no es un identificador válido`));
    }
    next();
}

export function esObjectId(valor) {
    return typeof valor === 'string' && OBJECT_ID.test(valor);
}
