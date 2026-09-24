// Carga datos de ejemplo en la base de datos configurada en MONGODB_URI
//   npm run seed            -> crea el admin y, si no hay equipos, los datos de ejemplo
//   npm run seed -- --reset -> borra equipos y jugadores y los vuelve a crear
import { conectarBD, desconectarBD } from '../src/config/db.js';
import { Usuario, Equipo, Jugador } from '../src/models/index.js';

const reset = process.argv.includes('--reset');

const equipos = [
    {
        nombre: 'Patriotas Boyacá',
        ciudad: 'Tunja',
        estadio: 'Estadio La Independencia',
        anioFundacion: 2003,
        entrenador: 'Andrés Mesa',
        jugadores: [
            ['Santiago', 'Rojas', 1, 'Portero', '1998-03-12'],
            ['Camilo', 'Suárez', 4, 'Defensa', '2000-07-25'],
            ['Julián', 'Pineda', 8, 'Centrocampista', '1999-11-02'],
            ['Mateo', 'Guerrero', 10, 'Centrocampista', '2002-01-18'],
            ['Daniel', 'Castañeda', 9, 'Delantero', '1997-09-30']
        ]
    },
    {
        nombre: 'Millonarios FC',
        ciudad: 'Bogotá',
        estadio: 'Estadio El Campín',
        anioFundacion: 1946,
        entrenador: 'Hernán Salcedo',
        jugadores: [
            ['Felipe', 'Moreno', 1, 'Portero', '1996-05-04'],
            ['Andrés', 'Cárdenas', 3, 'Defensa', '1999-02-14'],
            ['Nicolás', 'Vargas', 6, 'Centrocampista', '2001-06-09'],
            ['Sebastián', 'Ortiz', 11, 'Delantero', '2003-10-21']
        ]
    },
    {
        nombre: 'Atlético Nacional',
        ciudad: 'Medellín',
        estadio: 'Estadio Atanasio Girardot',
        anioFundacion: 1947,
        entrenador: 'Luis Fernando Arango',
        jugadores: [
            ['Esteban', 'Restrepo', 12, 'Portero', '1997-12-01'],
            ['Juan', 'Pérez', 5, 'Defensa', '2000-05-14'],
            ['Alejandro', 'Muñoz', 10, 'Centrocampista', '1998-08-08'],
            ['Kevin', 'Palacios', 7, 'Delantero', '2004-04-17']
        ]
    },
    {
        nombre: 'América de Cali',
        ciudad: 'Cali',
        estadio: 'Estadio Pascual Guerrero',
        anioFundacion: 1927,
        entrenador: 'Jorge Valencia',
        jugadores: [
            ['Óscar', 'Mosquera', 1, 'Portero', '1995-01-26'],
            ['Brayan', 'Angulo', 2, 'Defensa', '2001-03-03'],
            ['David', 'Caicedo', 9, 'Delantero', '2002-12-12']
        ]
    },
    {
        nombre: 'Boyacá Chicó',
        ciudad: 'Tunja',
        estadio: 'Estadio La Independencia',
        anioFundacion: 2002,
        entrenador: 'Ricardo Galeano',
        jugadores: []
    }
];

async function crearAdmin() {
    const { ADMIN_NOMBRE = 'Administrador', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.log('ℹ️  ADMIN_EMAIL / ADMIN_PASSWORD no definidos en .env: no se crea el administrador');
        return;
    }
    if (ADMIN_PASSWORD === 'cambie-esta-clave-123') {
        throw new Error('ADMIN_PASSWORD sigue con el valor de ejemplo de .env.example: cámbielo antes de crear el administrador');
    }

    const email = ADMIN_EMAIL.trim().toLowerCase();
    const existente = await Usuario.findOne({ email });
    if (existente) {
        // Nunca se asciende una cuenta existente: cualquiera pudo registrarse con ese email antes del seed
        if (existente.rol !== 'admin') {
            throw new Error(`Ya existe una cuenta NO administradora con ${email}; por seguridad no se asciende. Use otro ADMIN_EMAIL`);
        }
        console.log(`👤 Administrador ya existente: ${existente.email}`);
        return;
    }

    await Usuario.create({ nombre: ADMIN_NOMBRE, email, password: ADMIN_PASSWORD, rol: 'admin' });
    console.log(`👤 Administrador creado: ${email}`);
}

async function crearEquipos() {
    if (reset) {
        await Jugador.deleteMany({});
        await Equipo.deleteMany({});
        console.log('🧹 Equipos y jugadores eliminados');
    } else if (await Equipo.exists({})) {
        console.log('ℹ️  Ya hay equipos en la base de datos (use --reset para recrearlos)');
        return;
    }

    for (const { jugadores, ...datosEquipo } of equipos) {
        const equipo = await Equipo.create(datosEquipo);
        await Jugador.insertMany(
            jugadores.map(([nombre, apellido, numeroCamiseta, posicion, fechaNacimiento]) => ({
                nombre,
                apellido,
                numeroCamiseta,
                posicion,
                fechaNacimiento,
                equipo: equipo._id
            }))
        );
        console.log(`⚽ ${equipo.nombre}: ${jugadores.length} jugadores`);
    }
}

try {
    await conectarBD();
    await crearAdmin();
    await crearEquipos();
    console.log('✅ Seed completado');
} catch (error) {
    console.error('❌ Error en el seed:', error.message);
    process.exitCode = 1;
} finally {
    await desconectarBD();
}
