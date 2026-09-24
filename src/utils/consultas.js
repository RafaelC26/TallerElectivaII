import { ApiError } from './ApiError.js';

const LIMITE_POR_DEFECTO = 10;
const LIMITE_MAXIMO = 100;

// ?pagina=1&limite=10 -> valores seguros para skip/limit
export function paginacion(query) {
    const pagina = Math.max(1, Number.parseInt(query.pagina, 10) || 1);
    const limite = Math.min(LIMITE_MAXIMO, Math.max(1, Number.parseInt(query.limite, 10) || LIMITE_POR_DEFECTO));
    return { pagina, limite, saltar: (pagina - 1) * limite };
}

export function metaPaginacion(total, { pagina, limite }) {
    return { total, pagina, limite, paginas: Math.ceil(total / limite) };
}

// Búsqueda parcial sin distinguir mayúsculas; se escapan los caracteres especiales de regex
export function busquedaParcial(valor) {
    if (typeof valor !== 'string' || !valor.trim()) return undefined;
    const escapado = valor.trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escapado, 'i');
}

// Toma del body solo los campos permitidos (evita asignación masiva de campos como "rol" o "_id")
export function elegirCampos(body, permitidos) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw ApiError.badRequest('Debe enviar un cuerpo JSON (Content-Type: application/json)');
    }
    const datos = {};
    for (const campo of permitidos) {
        if (Object.hasOwn(body, campo) && body[campo] !== undefined) datos[campo] = body[campo];
    }
    return datos;
}
