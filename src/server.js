// Arranque local (npm run dev / npm start). En Vercel se usa directamente src/app.js
import app from './app.js';
import { env, variablesFaltantes } from './config/env.js';
import { conectarBD } from './config/db.js';

const faltantes = variablesFaltantes();
if (faltantes.length) {
    console.warn(`⚠️  Faltan variables de entorno: ${faltantes.join(', ')} (revise el archivo .env)`);
}

try {
    await conectarBD();
    console.log('✅ Conectado a MongoDB');
} catch (error) {
    console.error(`❌ ${error.message}`);
}

app.listen(env.PORT, () => {
    console.log(`Servidor corriendo en: http://localhost:${env.PORT}`);
    console.log(`Documentación Swagger: http://localhost:${env.PORT}/api-docs`);
});
