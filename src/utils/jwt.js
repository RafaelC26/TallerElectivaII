import jwt from 'jsonwebtoken';
import { env, jwtSecretSeguro } from '../config/env.js';
import { ApiError } from './ApiError.js';

const ALGORITMO = 'HS256';
const EMISOR = 'api-equipos-jugadores';

function secreto() {
    if (!jwtSecretSeguro()) {
        throw new ApiError(500, 'Servidor mal configurado: JWT_SECRET falta o es inseguro (mínimo 32 caracteres aleatorios)');
    }
    return env.JWT_SECRET;
}

export function firmarToken(usuario) {
    return jwt.sign({ rol: usuario.rol, nombre: usuario.nombre }, secreto(), {
        subject: String(usuario._id),
        expiresIn: env.JWT_EXPIRES_IN,
        issuer: EMISOR,
        algorithm: ALGORITMO
    });
}

// Se fija el algoritmo para impedir tokens firmados con "none" u otro algoritmo
export function verificarToken(token) {
    return jwt.verify(token, secreto(), { algorithms: [ALGORITMO], issuer: EMISOR });
}
