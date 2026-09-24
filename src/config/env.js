import dotenv from 'dotenv';
import path from 'node:path';

// En local se cargan las credenciales generadas por MongoDB Atlas y luego el .env
// (si una variable está en ambos, gana atlas-credentials.env). En Vercel ninguno
// de los dos archivos existe: las variables se configuran en el panel del proyecto.
const raiz = path.join(import.meta.dirname, '..', '..');
dotenv.config({
    path: [path.join(raiz, 'atlas-credentials.env'), path.join(raiz, '.env')],
    quiet: true
});

// Variables de entorno centralizadas (ver .env.example)
export const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: Number(process.env.PORT) || 3000,
    MONGODB_URI: process.env.MONGODB_URI || '',
    // La URI de Atlas no trae nombre de base de datos: sin esto Mongoose usaría "test"
    MONGODB_DB: process.env.MONGODB_DB || 'equipos_db',
    JWT_SECRET: process.env.JWT_SECRET || '',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
};

export const esTest = env.NODE_ENV === 'test';

const SECRETO_DE_EJEMPLO = 'cambie-este-valor-por-uno-largo-y-aleatorio';

// Un secreto corto o copiado de .env.example permitiría falsificar tokens de administrador
export function jwtSecretSeguro() {
    return env.JWT_SECRET.length >= 32 && env.JWT_SECRET !== SECRETO_DE_EJEMPLO;
}

// Devuelve las variables obligatorias que faltan o no son válidas (se reporta en /api/health)
export function variablesFaltantes() {
    const faltantes = [];
    if (!env.MONGODB_URI) faltantes.push('MONGODB_URI');
    if (!jwtSecretSeguro()) faltantes.push('JWT_SECRET');
    return faltantes;
}
