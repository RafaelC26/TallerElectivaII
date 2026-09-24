import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { esTest } from '../config/env.js';

const CAMPOS_DUPLICADOS = {
    email: 'Ya existe un usuario registrado con ese email',
    nombre: 'Ya existe un equipo con ese nombre',
    numeroCamiseta: 'Ese número de camiseta ya está asignado a otro jugador del equipo'
};

function mensajeDeCampo(error) {
    if (error.name !== 'CastError') return error.message;
    return error.kind === 'date'
        ? `Fecha no válida para ${error.path} (use el formato AAAA-MM-DD)`
        : `Valor no válido para ${error.path}`;
}

export function rutaNoEncontrada(req, res) {
    res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// Traduce cualquier error a una respuesta JSON uniforme: { error, detalles? }
// eslint-disable-next-line no-unused-vars
export function manejadorErrores(err, req, res, next) {
    let status = 500;
    let mensaje = 'Error interno del servidor';
    let detalles;

    if (err instanceof ApiError) {
        status = err.status;
        mensaje = err.message;
        detalles = err.detalles;
    } else if (err instanceof mongoose.Error.ValidationError) {
        status = 400;
        mensaje = 'Datos inválidos';
        detalles = Object.values(err.errors).map((e) => ({ campo: e.path, mensaje: mensajeDeCampo(e) }));
    } else if (err instanceof mongoose.Error.CastError) {
        status = 400;
        mensaje = `Valor no válido para el campo ${err.path}`;
    } else if (err?.code === 11000) {
        const campo = Object.keys(err.keyPattern || err.keyValue || {}).find((c) => CAMPOS_DUPLICADOS[c]);
        status = 409;
        mensaje = CAMPOS_DUPLICADOS[campo] || 'El registro ya existe';
    } else if (err instanceof mongoose.Error.DocumentNotFoundError) {
        // Otro cliente eliminó el documento mientras este lo actualizaba
        status = 404;
        mensaje = 'El recurso ya no existe (fue eliminado)';
    } else if (err instanceof mongoose.mongo.MongoServerSelectionError || err instanceof mongoose.mongo.MongoNetworkError) {
        status = 503;
        mensaje = 'La base de datos no está disponible, intente más tarde';
    } else if (err?.type === 'entity.parse.failed') {
        status = 400;
        mensaje = 'El cuerpo de la petición no es un JSON válido';
    } else if (err?.type === 'entity.too.large') {
        status = 413;
        mensaje = 'El cuerpo de la petición es demasiado grande';
    } else if (err?.status >= 400 && err.status < 500) {
        // Otros errores del cliente detectados por Express/body-parser (charset, codificación, URL mal formada)
        status = err.status;
        mensaje = status === 415 ? 'Tipo de contenido no soportado: envíe JSON en UTF-8' : 'Petición inválida';
    }

    if (status >= 500 && !esTest) {
        console.error(err);
    }

    res.status(status).json(detalles ? { error: mensaje, detalles } : { error: mensaje });
}
