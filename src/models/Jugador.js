import mongoose from 'mongoose';

export const POSICIONES = ['Portero', 'Defensa', 'Centrocampista', 'Delantero'];
export const EDAD_MINIMA = 15;
export const MAX_JUGADORES_POR_EQUIPO = 25;

// Se usan getters UTC: "2000-05-14" se guarda como medianoche UTC y en hora local
// (Colombia, UTC-5) sería el 13 de mayo, lo que corre la edad un día
function calcularEdad(fechaNacimiento, hoy = new Date()) {
    let edad = hoy.getUTCFullYear() - fechaNacimiento.getUTCFullYear();
    const mes = hoy.getUTCMonth() - fechaNacimiento.getUTCMonth();
    if (mes < 0 || (mes === 0 && hoy.getUTCDate() < fechaNacimiento.getUTCDate())) edad--;
    return edad;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/;

// new Date() acepta "2000-02-30" (lo corre a marzo) y textos como "5" o "hola 2000":
// solo se admite una fecha ISO real; lo demás se convierte en fecha inválida y responde 400
function fechaEstricta(valor) {
    if (typeof valor === 'number') return new Date(Number.NaN);
    if (typeof valor !== 'string') return valor;
    const fecha = new Date(valor);
    const valida = FECHA_ISO.test(valor) && !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor.slice(0, 10);
    return valida ? fecha : new Date(Number.NaN);
}

const jugadorSchema = new mongoose.Schema(
    {
        nombre: {
            type: String,
            required: [true, 'El nombre es obligatorio'],
            trim: true,
            minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
            maxlength: [60, 'El nombre no puede superar 60 caracteres']
        },
        apellido: {
            type: String,
            required: [true, 'El apellido es obligatorio'],
            trim: true,
            minlength: [2, 'El apellido debe tener al menos 2 caracteres'],
            maxlength: [60, 'El apellido no puede superar 60 caracteres']
        },
        numeroCamiseta: {
            type: Number,
            required: [true, 'El número de camiseta es obligatorio'],
            min: [1, 'El número de camiseta debe estar entre 1 y 99'],
            max: [99, 'El número de camiseta debe estar entre 1 y 99'],
            validate: { validator: Number.isInteger, message: 'El número de camiseta debe ser un número entero' }
        },
        posicion: {
            type: String,
            required: [true, 'La posición es obligatoria'],
            enum: { values: POSICIONES, message: `Posición no válida: {VALUE}. Use: ${POSICIONES.join(', ')}` }
        },
        fechaNacimiento: {
            type: Date,
            set: fechaEstricta,
            required: [true, 'La fecha de nacimiento es obligatoria'],
            validate: {
                validator: (fecha) => calcularEdad(fecha) >= EDAD_MINIMA,
                message: `El jugador debe tener al menos ${EDAD_MINIMA} años`
            }
        },
        nacionalidad: {
            type: String,
            trim: true,
            default: 'Colombia',
            maxlength: [60, 'La nacionalidad no puede superar 60 caracteres']
        },
        // Lado "muchos" de la relación 1:N: cada jugador pertenece a un equipo
        equipo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Equipo',
            required: [true, 'El equipo es obligatorio'],
            index: true
        }
    },
    {
        collection: 'jugadores',
        timestamps: true,
        versionKey: false,
        id: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Regla de negocio: el número de camiseta es único dentro de cada equipo
jugadorSchema.index({ equipo: 1, numeroCamiseta: 1 }, { unique: true });

jugadorSchema.virtual('edad').get(function () {
    return this.fechaNacimiento ? calcularEdad(this.fechaNacimiento) : undefined;
});

export const Jugador = mongoose.models.Jugador || mongoose.model('Jugador', jugadorSchema);
