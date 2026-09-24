import mongoose from 'mongoose';

const anioActual = () => new Date().getFullYear();

const equipoSchema = new mongoose.Schema(
    {
        nombre: {
            type: String,
            required: [true, 'El nombre del equipo es obligatorio'],
            trim: true,
            minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
            maxlength: [80, 'El nombre no puede superar 80 caracteres']
        },
        ciudad: {
            type: String,
            required: [true, 'La ciudad es obligatoria'],
            trim: true,
            minlength: [2, 'La ciudad debe tener al menos 2 caracteres'],
            maxlength: [60, 'La ciudad no puede superar 60 caracteres']
        },
        estadio: {
            type: String,
            trim: true,
            maxlength: [100, 'El estadio no puede superar 100 caracteres']
        },
        anioFundacion: {
            type: Number,
            min: [1850, 'El año de fundación no puede ser anterior a 1850'],
            // Es opcional: null lo borra, así que los validadores lo dejan pasar
            validate: [
                { validator: (valor) => valor == null || Number.isInteger(valor), message: 'El año de fundación debe ser un número entero' },
                { validator: (valor) => valor == null || valor <= anioActual(), message: 'El año de fundación no puede estar en el futuro' }
            ]
        },
        entrenador: {
            type: String,
            trim: true,
            maxlength: [80, 'El nombre del entrenador no puede superar 80 caracteres']
        }
    },
    {
        collection: 'equipos',
        timestamps: true,
        versionKey: false,
        id: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Regla de negocio: no pueden existir dos equipos con el mismo nombre (sin importar mayúsculas)
equipoSchema.index({ nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });

// Lado "uno" de la relación 1:N — los jugadores se obtienen por populate virtual
equipoSchema.virtual('jugadores', {
    ref: 'Jugador',
    localField: '_id',
    foreignField: 'equipo',
    options: { sort: { numeroCamiseta: 1 } }
});

equipoSchema.virtual('totalJugadores', {
    ref: 'Jugador',
    localField: '_id',
    foreignField: 'equipo',
    count: true
});

export const Equipo = mongoose.models.Equipo || mongoose.model('Equipo', equipoSchema);
