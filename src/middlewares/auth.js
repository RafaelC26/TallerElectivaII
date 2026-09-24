import jwt from 'jsonwebtoken';
import { Usuario } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { verificarToken } from '../utils/jwt.js';

// Exige el header "Authorization: Bearer <token>" y carga el usuario en req.usuario
export async function autenticar(req, res, next) {
    // El esquema no distingue mayúsculas (RFC 9110): "bearer" también es válido
    const [esquema, token] = (req.headers.authorization || '').trim().split(/\s+/);

    if (esquema?.toLowerCase() !== 'bearer' || !token) {
        res.set('WWW-Authenticate', 'Bearer');
        throw ApiError.unauthorized('Token no proporcionado. Use el header Authorization: Bearer <token>');
    }

    let payload;
    try {
        payload = verificarToken(token);
    } catch (error) {
        res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
        if (error instanceof jwt.TokenExpiredError) {
            throw ApiError.unauthorized('El token ha expirado, inicie sesión nuevamente');
        }
        if (error instanceof ApiError) throw error;
        throw ApiError.unauthorized('Token inválido');
    }

    // El usuario debe seguir existiendo (un token de un usuario eliminado deja de servir)
    const usuario = await Usuario.findById(payload.sub);
    if (!usuario) {
        throw ApiError.unauthorized('El usuario del token ya no existe');
    }

    req.usuario = usuario;
    next();
}

// Autorización por rol: autorizar('admin')
export function autorizar(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
            throw ApiError.forbidden(`Acción permitida solo para el rol: ${rolesPermitidos.join(', ')}`);
        }
        next();
    };
}
