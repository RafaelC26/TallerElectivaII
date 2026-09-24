import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['admin', 'usuario'];
const SALT_ROUNDS = 10;

const usuarioSchema = new mongoose.Schema(
    {
        nombre: {
            type: String,
            required: [true, 'El nombre es obligatorio'],
            trim: true,
            minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
            maxlength: [60, 'El nombre no puede superar 60 caracteres']
        },
        email: {
            type: String,
            required: [true, 'El email es obligatorio'],
            unique: true,
            trim: true,
            lowercase: true,
            maxlength: [120, 'El email no puede superar 120 caracteres'],
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El email no tiene un formato válido']
        },
        password: {
            type: String,
            required: [true, 'La contraseña es obligatoria'],
            minlength: [8, 'La contraseña debe tener al menos 8 caracteres'],
            maxlength: [72, 'La contraseña no puede superar 72 caracteres'],
            validate: [
                {
                    validator: (valor) => /[A-Za-z]/.test(valor) && /\d/.test(valor),
                    message: 'La contraseña debe contener al menos una letra y un número'
                },
                {
                    // bcrypt ignora todo lo que pase de 72 bytes, y la ñ, las tildes o los emojis ocupan más de uno
                    validator: (valor) => Buffer.byteLength(valor, 'utf8') <= 72,
                    message: 'La contraseña es demasiado larga (máximo 72 bytes; la ñ y las tildes cuentan doble)'
                }
            ],
            select: false
        },
        rol: {
            type: String,
            enum: { values: ROLES, message: 'Rol no válido: {VALUE}' },
            default: 'usuario'
        }
    },
    {
        collection: 'usuarios',
        timestamps: true,
        versionKey: false,
        toJSON: {
            transform: (_doc, ret) => {
                delete ret.password;
                return ret;
            }
        }
    }
);

// Nunca se guarda la contraseña en texto plano
usuarioSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

usuarioSchema.methods.compararPassword = function (passwordPlano) {
    return bcrypt.compare(passwordPlano, this.password);
};

export const Usuario = mongoose.models.Usuario || mongoose.model('Usuario', usuarioSchema);
