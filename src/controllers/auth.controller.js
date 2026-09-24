import bcrypt from 'bcryptjs';
import { Usuario } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { elegirCampos } from '../utils/consultas.js';
import { firmarToken } from '../utils/jwt.js';

// Hash de relleno: el login tarda lo mismo exista o no el email (evita enumerar usuarios)
const HASH_FICTICIO = bcrypt.hashSync('password-ficticio-1', 10);

function respuestaConToken(usuario, mensaje) {
    return {
        mensaje,
        token: firmarToken(usuario),
        tipo: 'Bearer',
        expiraEn: env.JWT_EXPIRES_IN,
        usuario
    };
}

export async function registrar(req, res) {
    // "rol" no se acepta desde el cliente: todo registro público crea un usuario normal
    const usuario = new Usuario(elegirCampos(req.body, ['nombre', 'email', 'password']));

    // Primero se valida todo: así no se puede averiguar qué emails existen enviando datos basura
    await usuario.validate();
    if (await Usuario.exists({ email: usuario.email })) {
        throw ApiError.conflict('Ya existe un usuario registrado con ese email');
    }

    await usuario.save();
    res.status(201).json(respuestaConToken(usuario, 'Usuario registrado correctamente'));
}

export async function login(req, res) {
    const { email, password } = elegirCampos(req.body, ['email', 'password']);

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        throw ApiError.badRequest('El email y la contraseña son obligatorios');
    }

    const usuario = await Usuario.findOne({ email: email.trim().toLowerCase() }).select('+password');
    const passwordValida = await bcrypt.compare(password, usuario?.password ?? HASH_FICTICIO);

    if (!usuario || !passwordValida) {
        throw ApiError.unauthorized('Credenciales inválidas');
    }

    res.json(respuestaConToken(usuario, 'Inicio de sesión exitoso'));
}

export function perfil(req, res) {
    res.json({ datos: req.usuario });
}
