// Error HTTP con código de estado; lo captura el manejador central de errores
export class ApiError extends Error {
    constructor(status, mensaje, detalles) {
        super(mensaje);
        this.name = 'ApiError';
        this.status = status;
        this.detalles = detalles;
    }

    static badRequest(mensaje, detalles) {
        return new ApiError(400, mensaje, detalles);
    }

    static unauthorized(mensaje = 'No autenticado') {
        return new ApiError(401, mensaje);
    }

    static forbidden(mensaje = 'No tiene permisos para realizar esta acción') {
        return new ApiError(403, mensaje);
    }

    static notFound(mensaje = 'Recurso no encontrado') {
        return new ApiError(404, mensaje);
    }

    static conflict(mensaje, detalles) {
        return new ApiError(409, mensaje, detalles);
    }

    static unprocessable(mensaje, detalles) {
        return new ApiError(422, mensaje, detalles);
    }
}
