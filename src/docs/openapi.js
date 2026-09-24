import { POSICIONES, EDAD_MINIMA, MAX_JUGADORES_POR_EQUIPO } from '../models/index.js';

// ---------- Utilidades para no repetir bloques en cada endpoint ----------
const ref = (nombre) => ({ $ref: `#/components/schemas/${nombre}` });
const json = (schema, example) => ({ 'application/json': { schema, ...(example && { example }) } });
const respuesta = (description, schema, example) => ({ description, content: json(schema, example) });
const error = (codigo) => ({ $ref: `#/components/responses/Error${codigo}` });
const conToken = [{ bearerAuth: [] }];

const parametroId = (recurso) => ({
    name: 'id',
    in: 'path',
    required: true,
    description: `ID (ObjectId de MongoDB) del ${recurso}`,
    schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$', example: '66f1a2b3c4d5e6f7a8b9c0d1' }
});

const parametrosPaginacion = [
    { name: 'pagina', in: 'query', description: 'Número de página (desde 1)', schema: { type: 'integer', minimum: 1, default: 1 } },
    { name: 'limite', in: 'query', description: 'Resultados por página (máx. 100)', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } }
];

// ---------- Ejemplos ----------
const ejemploEquipo = {
    _id: '66f1a2b3c4d5e6f7a8b9c0d1',
    nombre: 'Patriotas Boyacá',
    ciudad: 'Tunja',
    estadio: 'Estadio La Independencia',
    anioFundacion: 2003,
    entrenador: 'Andrés Mesa',
    totalJugadores: 2,
    createdAt: '2026-09-10T15:30:00.000Z',
    updatedAt: '2026-09-10T15:30:00.000Z'
};

const ejemploJugador = {
    _id: '66f1a2b3c4d5e6f7a8b9c0e5',
    nombre: 'Juan',
    apellido: 'Pérez',
    numeroCamiseta: 10,
    posicion: 'Centrocampista',
    fechaNacimiento: '2000-05-14T00:00:00.000Z',
    nacionalidad: 'Colombia',
    equipo: { _id: '66f1a2b3c4d5e6f7a8b9c0d1', nombre: 'Patriotas Boyacá', ciudad: 'Tunja' },
    edad: 26,
    createdAt: '2026-09-10T15:35:00.000Z',
    updatedAt: '2026-09-10T15:35:00.000Z'
};

const ejemploUsuario = {
    _id: '66f1a2b3c4d5e6f7a8b9c0a1',
    nombre: 'Rafael Cristancho',
    email: 'rafael@correo.com',
    rol: 'usuario',
    createdAt: '2026-09-10T15:00:00.000Z',
    updatedAt: '2026-09-10T15:00:00.000Z'
};

const { totalJugadores: _omitido, ...ejemploEquipoNuevo } = ejemploEquipo;
const ejemploPaginacion = { total: 1, pagina: 1, limite: 10, paginas: 1 };

// ---------- Especificación ----------
export const openapi = {
    openapi: '3.0.3',
    info: {
        title: 'API Equipos y Jugadores',
        version: '1.0.0',
        description: [
            'API RESTful para gestionar **equipos de fútbol** y sus **jugadores** (relación **uno a muchos**: un equipo tiene muchos jugadores, cada jugador pertenece a un solo equipo).',
            '',
            'Construida con **Node.js + Express 5 + Mongoose**, persistida en **MongoDB Atlas** y protegida con **JSON Web Tokens (JWT)**.',
            '',
            '### ¿Cómo probarla?',
            '1. Cree un usuario en `POST /api/auth/registro` o inicie sesión en `POST /api/auth/login`.',
            '2. Copie el `token` de la respuesta.',
            '3. Pulse el botón **Authorize** 🔒 y pegue el token (sin la palabra *Bearer*).',
            '4. Ya puede usar los endpoints de equipos y jugadores.',
            '',
            '### Reglas de negocio',
            '- No pueden existir dos equipos con el mismo nombre (sin distinguir mayúsculas).',
            '- Un jugador siempre pertenece a un equipo existente.',
            '- El número de camiseta (1-99) es único dentro de cada equipo.',
            `- Un equipo admite como máximo **${MAX_JUGADORES_POR_EQUIPO} jugadores**.`,
            `- Un jugador debe tener al menos **${EDAD_MINIMA} años**.`,
            '- Un equipo con jugadores no se puede eliminar, salvo en cascada (`?cascada=true`).',
            '- Solo el rol **admin** puede eliminar equipos y jugadores.',
            '',
            '> Si la base de datos no está disponible, cualquier ruta de `/api` responde **503**.'
        ].join('\n'),
        contact: { name: 'Rafael Cristancho — Electiva II (Desarrollo Web)' },
        license: { name: 'ISC' }
    },
    servers: [{ url: '/', description: 'Servidor actual' }],
    tags: [
        { name: 'Autenticación', description: 'Registro, inicio de sesión y perfil (JWT)' },
        { name: 'Equipos', description: 'Gestión de equipos (lado "uno" de la relación)' },
        { name: 'Jugadores', description: 'Gestión de jugadores (lado "muchos" de la relación)' },
        { name: 'Sistema', description: 'Estado del servicio' }
    ],
    paths: {
        '/api': {
            get: {
                tags: ['Sistema'],
                summary: 'Información general de la API',
                security: [],
                responses: {
                    200: respuesta('Nombre, versión y recursos disponibles', ref('InfoApi'), {
                        nombre: 'API Equipos y Jugadores',
                        version: '1.0.0',
                        documentacion: '/api-docs',
                        recursos: ['/api/auth', '/api/equipos', '/api/jugadores', '/api/health']
                    })
                }
            }
        },
        '/api/health': {
            get: {
                tags: ['Sistema'],
                summary: 'Estado del servicio y de la base de datos',
                security: [],
                responses: {
                    200: respuesta('Servicio operativo', ref('Salud'), { estado: 'ok', baseDatos: 'conectado', fecha: '2026-09-23T20:00:00.000Z' }),
                    503: respuesta('Servicio degradado (sin base de datos o sin configuración)', ref('Salud'), {
                        estado: 'degradado',
                        baseDatos: 'error: No fue posible conectar con la base de datos',
                        fecha: '2026-09-23T20:00:00.000Z'
                    })
                }
            }
        },
        '/api/auth/registro': {
            post: {
                tags: ['Autenticación'],
                summary: 'Registrar un nuevo usuario',
                description: 'Crea un usuario con rol `usuario` y devuelve un token JWT. El rol no se puede elegir desde esta ruta.',
                security: [],
                requestBody: {
                    required: true,
                    content: json(ref('RegistroInput'), { nombre: 'Rafael Cristancho', email: 'rafael@correo.com', password: 'Clave2026' })
                },
                responses: {
                    201: respuesta('Usuario registrado', ref('AuthRespuesta')),
                    400: error(400),
                    409: respuesta('El email ya está registrado', ref('Error'), { error: 'Ya existe un usuario registrado con ese email' }),
                    429: error(429)
                }
            }
        },
        '/api/auth/login': {
            post: {
                tags: ['Autenticación'],
                summary: 'Iniciar sesión y obtener un token JWT',
                security: [],
                requestBody: {
                    required: true,
                    content: json(ref('LoginInput'), { email: 'rafael@correo.com', password: 'Clave2026' })
                },
                responses: {
                    200: respuesta('Inicio de sesión exitoso', ref('AuthRespuesta')),
                    400: error(400),
                    401: respuesta('Credenciales inválidas', ref('Error'), { error: 'Credenciales inválidas' }),
                    429: error(429)
                }
            }
        },
        '/api/auth/perfil': {
            get: {
                tags: ['Autenticación'],
                summary: 'Consultar el usuario autenticado',
                security: conToken,
                responses: {
                    200: respuesta('Datos del usuario del token', { type: 'object', properties: { datos: ref('Usuario') } }, { datos: ejemploUsuario }),
                    401: error(401)
                }
            }
        },
        '/api/equipos': {
            get: {
                tags: ['Equipos'],
                summary: 'Listar equipos (con filtros y paginación)',
                security: conToken,
                parameters: [
                    { name: 'nombre', in: 'query', description: 'Búsqueda parcial por nombre', schema: { type: 'string' }, example: 'patriotas' },
                    { name: 'ciudad', in: 'query', description: 'Búsqueda parcial por ciudad', schema: { type: 'string' } },
                    ...parametrosPaginacion
                ],
                responses: {
                    200: respuesta('Lista paginada de equipos', ref('ListaEquipos'), { datos: [ejemploEquipo], paginacion: ejemploPaginacion }),
                    401: error(401)
                }
            },
            post: {
                tags: ['Equipos'],
                summary: 'Crear un equipo',
                security: conToken,
                requestBody: {
                    required: true,
                    content: json(ref('EquipoInput'), {
                        nombre: 'Patriotas Boyacá',
                        ciudad: 'Tunja',
                        estadio: 'Estadio La Independencia',
                        anioFundacion: 2003,
                        entrenador: 'Andrés Mesa'
                    })
                },
                responses: {
                    201: respuesta('Equipo creado', ref('EquipoRespuesta'), { mensaje: 'Equipo creado correctamente', datos: ejemploEquipoNuevo }),
                    400: error(400),
                    401: error(401),
                    409: respuesta('Nombre de equipo repetido', ref('Error'), { error: 'Ya existe un equipo con ese nombre' })
                }
            }
        },
        '/api/equipos/{id}': {
            parameters: [parametroId('equipo')],
            get: {
                tags: ['Equipos'],
                summary: 'Obtener un equipo con sus jugadores',
                security: conToken,
                responses: {
                    200: respuesta('Equipo encontrado (incluye el arreglo de jugadores)', {
                        type: 'object',
                        properties: { datos: ref('EquipoDetalle') }
                    }, { datos: { ...ejemploEquipo, jugadores: [{ ...ejemploJugador, equipo: ejemploEquipo._id }] } }),
                    400: error(400),
                    401: error(401),
                    404: error(404)
                }
            },
            put: {
                tags: ['Equipos'],
                summary: 'Actualizar un equipo',
                description: 'Actualiza solo los campos enviados; los demás conservan su valor.',
                security: conToken,
                requestBody: { required: true, content: json(ref('EquipoUpdate'), { entrenador: 'Carlos Ruiz', estadio: 'Estadio La Independencia' }) },
                responses: {
                    200: respuesta('Equipo actualizado', ref('EquipoRespuesta')),
                    400: error(400),
                    401: error(401),
                    404: error(404),
                    409: respuesta('Nombre de equipo repetido', ref('Error'), { error: 'Ya existe un equipo con ese nombre' })
                }
            },
            delete: {
                tags: ['Equipos'],
                summary: 'Eliminar un equipo (solo admin)',
                description: 'Si el equipo tiene jugadores responde **409**, a menos que se envíe `?cascada=true`, en cuyo caso también elimina sus jugadores.',
                security: conToken,
                parameters: [
                    { name: 'cascada', in: 'query', description: 'Eliminar también los jugadores del equipo', schema: { type: 'boolean', default: false } }
                ],
                responses: {
                    200: respuesta('Equipo eliminado', {
                        type: 'object',
                        properties: {
                            mensaje: { type: 'string' },
                            datos: ref('Equipo'),
                            jugadoresEliminados: { type: 'integer', example: 0 }
                        }
                    }),
                    400: error(400),
                    401: error(401),
                    403: error(403),
                    404: error(404),
                    409: respuesta('El equipo tiene jugadores', ref('Error'), {
                        error: 'El equipo "Patriotas Boyacá" tiene 2 jugador(es). Reasígnelos o elimínelos, o use ?cascada=true',
                        detalles: { totalJugadores: 2 }
                    })
                }
            }
        },
        '/api/equipos/{id}/jugadores': {
            parameters: [parametroId('equipo')],
            get: {
                tags: ['Equipos'],
                summary: 'Listar los jugadores de un equipo (relación 1:N)',
                security: conToken,
                responses: {
                    200: respuesta('Jugadores del equipo, ordenados por número de camiseta', ref('JugadoresDeEquipo'), {
                        equipo: { _id: ejemploEquipo._id, nombre: ejemploEquipo.nombre },
                        total: 1,
                        datos: [{ ...ejemploJugador, equipo: ejemploEquipo._id }]
                    }),
                    400: error(400),
                    401: error(401),
                    404: error(404)
                }
            }
        },
        '/api/jugadores': {
            get: {
                tags: ['Jugadores'],
                summary: 'Listar jugadores (con filtros y paginación)',
                security: conToken,
                parameters: [
                    { name: 'equipo', in: 'query', description: 'ID del equipo', schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } },
                    { name: 'posicion', in: 'query', description: 'Posición exacta', schema: { type: 'string', enum: POSICIONES } },
                    { name: 'nombre', in: 'query', description: 'Búsqueda parcial por nombre o apellido', schema: { type: 'string' } },
                    ...parametrosPaginacion
                ],
                responses: {
                    200: respuesta('Lista paginada de jugadores', ref('ListaJugadores'), { datos: [ejemploJugador], paginacion: ejemploPaginacion }),
                    400: error(400),
                    401: error(401)
                }
            },
            post: {
                tags: ['Jugadores'],
                summary: 'Crear un jugador en un equipo',
                security: conToken,
                requestBody: {
                    required: true,
                    content: json(ref('JugadorInput'), {
                        nombre: 'Juan',
                        apellido: 'Pérez',
                        numeroCamiseta: 10,
                        posicion: 'Centrocampista',
                        fechaNacimiento: '2000-05-14',
                        nacionalidad: 'Colombia',
                        equipo: '66f1a2b3c4d5e6f7a8b9c0d1'
                    })
                },
                responses: {
                    201: respuesta('Jugador creado', ref('JugadorRespuesta'), { mensaje: 'Jugador creado correctamente', datos: ejemploJugador }),
                    400: error(400),
                    401: error(401),
                    409: respuesta('Número de camiseta ocupado o equipo lleno', ref('Error'), {
                        error: 'El número 10 ya lo usa Juan Pérez en Patriotas Boyacá'
                    }),
                    422: error(422)
                }
            }
        },
        '/api/jugadores/{id}': {
            parameters: [parametroId('jugador')],
            get: {
                tags: ['Jugadores'],
                summary: 'Obtener un jugador (con los datos de su equipo)',
                security: conToken,
                responses: {
                    200: respuesta('Jugador encontrado', { type: 'object', properties: { datos: ref('Jugador') } }, { datos: ejemploJugador }),
                    400: error(400),
                    401: error(401),
                    404: error(404)
                }
            },
            put: {
                tags: ['Jugadores'],
                summary: 'Actualizar o transferir un jugador',
                description: 'Actualiza solo los campos enviados. Cambiar `equipo` transfiere al jugador y vuelve a validar el cupo del equipo y el número de camiseta.',
                security: conToken,
                requestBody: { required: true, content: json(ref('JugadorUpdate'), { numeroCamiseta: 7, posicion: 'Delantero' }) },
                responses: {
                    200: respuesta('Jugador actualizado', ref('JugadorRespuesta')),
                    400: error(400),
                    401: error(401),
                    404: error(404),
                    409: respuesta('Número de camiseta ocupado o equipo lleno', ref('Error'), {
                        error: `El equipo "Patriotas Boyacá" ya tiene el máximo de ${MAX_JUGADORES_POR_EQUIPO} jugadores`
                    }),
                    422: error(422)
                }
            },
            delete: {
                tags: ['Jugadores'],
                summary: 'Eliminar un jugador (solo admin)',
                security: conToken,
                responses: {
                    200: respuesta('Jugador eliminado', ref('JugadorRespuesta')),
                    400: error(400),
                    401: error(401),
                    403: error(403),
                    404: error(404)
                }
            }
        }
    },
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Token obtenido en /api/auth/login o /api/auth/registro. Vence según JWT_EXPIRES_IN (por defecto 2 horas).'
            }
        },
        schemas: {
            Error: {
                type: 'object',
                required: ['error'],
                properties: {
                    error: { type: 'string', description: 'Mensaje legible del error' },
                    detalles: {
                        description: 'Información adicional (por ejemplo, errores por campo)',
                        oneOf: [
                            { type: 'array', items: { type: 'object', properties: { campo: { type: 'string' }, mensaje: { type: 'string' } } } },
                            { type: 'object', additionalProperties: true }
                        ]
                    }
                }
            },
            InfoApi: {
                type: 'object',
                properties: {
                    nombre: { type: 'string' },
                    version: { type: 'string' },
                    documentacion: { type: 'string' },
                    recursos: { type: 'array', items: { type: 'string' } }
                }
            },
            Salud: {
                type: 'object',
                properties: {
                    estado: { type: 'string', enum: ['ok', 'degradado'] },
                    baseDatos: { type: 'string', example: 'conectado' },
                    variablesFaltantes: { type: 'array', items: { type: 'string' } },
                    fecha: { type: 'string', format: 'date-time' }
                }
            },
            Paginacion: {
                type: 'object',
                properties: {
                    total: { type: 'integer', description: 'Total de registros que cumplen el filtro' },
                    pagina: { type: 'integer' },
                    limite: { type: 'integer' },
                    paginas: { type: 'integer' }
                },
                example: ejemploPaginacion
            },
            Usuario: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    nombre: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    rol: { type: 'string', enum: ['admin', 'usuario'] },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                },
                example: ejemploUsuario
            },
            RegistroInput: {
                type: 'object',
                required: ['nombre', 'email', 'password'],
                properties: {
                    nombre: { type: 'string', minLength: 2, maxLength: 60 },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', format: 'password', minLength: 8, maxLength: 72, description: 'Mínimo 8 caracteres, con al menos una letra y un número (máximo 72 bytes: la ñ y las tildes cuentan doble)' }
                }
            },
            LoginInput: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', format: 'password' }
                }
            },
            AuthRespuesta: {
                type: 'object',
                properties: {
                    mensaje: { type: 'string' },
                    token: { type: 'string', description: 'JWT firmado con HS256' },
                    tipo: { type: 'string', example: 'Bearer' },
                    expiraEn: { type: 'string', example: '2h' },
                    usuario: ref('Usuario')
                },
                example: {
                    mensaje: 'Inicio de sesión exitoso',
                    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2wiOiJ1c3VhcmlvIn0.firma',
                    tipo: 'Bearer',
                    expiraEn: '2h',
                    usuario: ejemploUsuario
                }
            },
            EquipoInput: {
                type: 'object',
                required: ['nombre', 'ciudad'],
                properties: {
                    nombre: { type: 'string', minLength: 2, maxLength: 80, description: 'Único (sin distinguir mayúsculas)' },
                    ciudad: { type: 'string', minLength: 2, maxLength: 60 },
                    estadio: { type: 'string', maxLength: 100 },
                    anioFundacion: { type: 'integer', minimum: 1850, description: 'No puede estar en el futuro' },
                    entrenador: { type: 'string', maxLength: 80 }
                }
            },
            EquipoUpdate: {
                type: 'object',
                minProperties: 1,
                description: 'Mismos campos que EquipoInput, todos opcionales. Los opcionales se borran enviando null',
                properties: {
                    nombre: { type: 'string', minLength: 2, maxLength: 80 },
                    ciudad: { type: 'string', minLength: 2, maxLength: 60 },
                    estadio: { type: 'string', maxLength: 100, nullable: true },
                    anioFundacion: { type: 'integer', minimum: 1850, nullable: true },
                    entrenador: { type: 'string', maxLength: 80, nullable: true }
                }
            },
            Equipo: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    nombre: { type: 'string' },
                    ciudad: { type: 'string' },
                    estadio: { type: 'string' },
                    anioFundacion: { type: 'integer' },
                    entrenador: { type: 'string' },
                    totalJugadores: { type: 'integer', description: 'Cantidad de jugadores del equipo' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                },
                example: ejemploEquipo
            },
            EquipoDetalle: {
                allOf: [
                    ref('Equipo'),
                    {
                        type: 'object',
                        properties: { jugadores: { type: 'array', items: ref('JugadorSinEquipo') } }
                    }
                ]
            },
            EquipoRespuesta: {
                type: 'object',
                properties: { mensaje: { type: 'string' }, datos: ref('Equipo') }
            },
            ListaEquipos: {
                type: 'object',
                properties: { datos: { type: 'array', items: ref('Equipo') }, paginacion: ref('Paginacion') }
            },
            JugadorInput: {
                type: 'object',
                required: ['nombre', 'apellido', 'numeroCamiseta', 'posicion', 'fechaNacimiento', 'equipo'],
                properties: {
                    nombre: { type: 'string', minLength: 2, maxLength: 60 },
                    apellido: { type: 'string', minLength: 2, maxLength: 60 },
                    numeroCamiseta: { type: 'integer', minimum: 1, maximum: 99, description: 'Único dentro del equipo' },
                    posicion: { type: 'string', enum: POSICIONES },
                    fechaNacimiento: { type: 'string', format: 'date', example: '2000-05-14', description: `Formato AAAA-MM-DD (fecha real). El jugador debe tener al menos ${EDAD_MINIMA} años` },
                    nacionalidad: { type: 'string', maxLength: 60, default: 'Colombia' },
                    equipo: { type: 'string', pattern: '^[a-fA-F0-9]{24}$', description: 'ID del equipo al que pertenece' }
                }
            },
            JugadorUpdate: {
                type: 'object',
                minProperties: 1,
                description: 'Mismos campos que JugadorInput, todos opcionales',
                properties: {
                    nombre: { type: 'string', minLength: 2, maxLength: 60 },
                    apellido: { type: 'string', minLength: 2, maxLength: 60 },
                    numeroCamiseta: { type: 'integer', minimum: 1, maximum: 99 },
                    posicion: { type: 'string', enum: POSICIONES },
                    fechaNacimiento: { type: 'string', format: 'date' },
                    nacionalidad: { type: 'string', maxLength: 60 },
                    equipo: { type: 'string', pattern: '^[a-fA-F0-9]{24}$', description: 'Nuevo equipo (transferencia)' }
                }
            },
            JugadorBase: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    nombre: { type: 'string' },
                    apellido: { type: 'string' },
                    numeroCamiseta: { type: 'integer' },
                    posicion: { type: 'string', enum: POSICIONES },
                    fechaNacimiento: { type: 'string', format: 'date-time' },
                    nacionalidad: { type: 'string' },
                    edad: { type: 'integer', description: 'Calculada a partir de la fecha de nacimiento' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                }
            },
            JugadorSinEquipo: {
                description: 'Jugador dentro de la lista de su equipo: "equipo" es solo el id',
                allOf: [ref('JugadorBase'), { type: 'object', properties: { equipo: { type: 'string', description: 'ID del equipo' } } }]
            },
            Jugador: {
                description: 'Jugador con los datos de su equipo (populate)',
                allOf: [
                    ref('JugadorBase'),
                    {
                        type: 'object',
                        properties: {
                            equipo: {
                                type: 'object',
                                description: 'Equipo al que pertenece',
                                properties: { _id: { type: 'string' }, nombre: { type: 'string' }, ciudad: { type: 'string' }, estadio: { type: 'string' } }
                            }
                        }
                    }
                ],
                example: ejemploJugador
            },
            JugadorRespuesta: {
                type: 'object',
                properties: { mensaje: { type: 'string' }, datos: ref('Jugador') }
            },
            ListaJugadores: {
                type: 'object',
                properties: { datos: { type: 'array', items: ref('Jugador') }, paginacion: ref('Paginacion') }
            },
            JugadoresDeEquipo: {
                type: 'object',
                properties: {
                    equipo: { type: 'object', properties: { _id: { type: 'string' }, nombre: { type: 'string' } } },
                    total: { type: 'integer' },
                    datos: { type: 'array', items: ref('JugadorSinEquipo') }
                }
            }
        },
        responses: {
            Error400: respuesta('Datos inválidos o id mal formado', ref('Error'), {
                error: 'Datos inválidos',
                detalles: [{ campo: 'numeroCamiseta', mensaje: 'El número de camiseta debe estar entre 1 y 99' }]
            }),
            Error401: respuesta('Falta el token, es inválido o expiró', ref('Error'), {
                error: 'Token no proporcionado. Use el header Authorization: Bearer <token>'
            }),
            Error403: respuesta('El rol del usuario no tiene permiso', ref('Error'), { error: 'Acción permitida solo para el rol: admin' }),
            Error404: respuesta('Recurso no encontrado', ref('Error'), { error: 'No existe un equipo con id 66f1a2b3c4d5e6f7a8b9c0d1' }),
            Error422: respuesta('El equipo indicado no existe', ref('Error'), { error: 'El equipo con id 66f1a2b3c4d5e6f7a8b9c0d1 no existe' }),
            Error429: respuesta('Demasiadas peticiones', ref('Error'), { error: 'Demasiados intentos, intente de nuevo en 15 minutos' })
        }
    }
};
