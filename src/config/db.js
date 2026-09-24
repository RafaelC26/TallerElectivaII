import mongoose from 'mongoose';
import { env } from './env.js';
import { ApiError } from '../utils/ApiError.js';
import '../models/index.js';

// Convierte {"$gt": ""} en {"$eq": {"$gt": ""}}: evita inyección NoSQL en los filtros
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

// En Vercel cada función puede reutilizar el proceso entre peticiones:
// se guarda la conexión en globalThis para no abrir una nueva en cada request.
const cache = globalThis.__mongooseCache ?? (globalThis.__mongooseCache = { conexion: null, promesa: null });

export async function conectarBD(uri = env.MONGODB_URI) {
    if (cache.conexion && mongoose.connection.readyState === 1) {
        return cache.conexion;
    }

    if (!uri) {
        throw new ApiError(503, 'Base de datos no configurada: falta la variable MONGODB_URI');
    }

    if (!cache.promesa) {
        cache.promesa = mongoose
            .connect(uri, { dbName: env.MONGODB_DB, autoIndex: false, serverSelectionTimeoutMS: 10000, maxPoolSize: 10 })
            .then(async (instancia) => {
                // Los índices únicos sostienen reglas de negocio: deben existir antes de atender peticiones.
                // createIndexes() no guarda el error como init(): si falla, la siguiente petición reintenta
                try {
                    await Promise.all(Object.values(instancia.models).map((modelo) => modelo.createIndexes()));
                } catch (error) {
                    console.error('Error creando los índices en MongoDB:', error.message);
                    throw new ApiError(503, 'La base de datos no está lista: no se pudieron crear los índices');
                }
                return instancia;
            });
    }

    try {
        cache.conexion = await cache.promesa;
    } catch (error) {
        cache.promesa = null;
        if (error instanceof ApiError) throw error;
        console.error('Error conectando a MongoDB:', error.message);
        throw new ApiError(503, 'No fue posible conectar con la base de datos');
    }

    return cache.conexion;
}

export async function desconectarBD() {
    await mongoose.disconnect();
    cache.conexion = null;
    cache.promesa = null;
}

export function estadoBD() {
    const estados = ['desconectado', 'conectado', 'conectando', 'desconectando'];
    return estados[mongoose.connection.readyState] ?? 'desconocido';
}
