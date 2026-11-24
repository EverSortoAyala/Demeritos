/*!
 * test-connection.js - Prueba de conexión a Neon PostgreSQL
 * Purpose: Verificar que Node.js puede conectarse a la base de datos Neon
 * Runtime: Node.js v20+
 * WARNING: Este archivo realiza una conexión real a Neon. Asegúrate de que
 *           las credenciales en .env sean correctas antes de ejecutar.
 *          Cierra este archivo después de la prueba.
 * 
 * NOTA: Se requiere dotenv para cargar las variables del archivo .env
 *       en process.env. El modulo 'pg' las leerá automáticamente.
 */

 // Importar pool desde el servicio de base de datos
 require('dotenv').config();
 const { pool } = require('./services/database');

// -------------------------------------------------------------------------
// Single Responsibility: Probar conexión y reportar resultados
// -------------------------------------------------------------------------

 // Ejecutar query simple para probar conexión
 const testConnection = async () => {
     try {
         // Verificar que la URL de Neon está configurada
         if (!process.env.NEON_DATABASE_URL) {
             console.error('❌ Error: NEON_DATABASE_URL no definido');
             console.error('   → Copia el archivo .env y configura la variable');
             process.exit(1);
         }

         console.log('🔗 Intentando conectar a Neon...');
         console.log('   URL (parcial):', process.env.NEON_DATABASE_URL.substring(0, 30) + '...');

         // Realizar una query simple para probar la conexión
         const client = await pool.connect();
         
         try {
             // Query mínima: verificar que la conexión responde
             const result = await client.query('SELECT NOW() AS current_time, 1 AS test_value');
             
             console.log('✅ Conexión exitosa a Neon PostgreSQL!');
             console.log('📅 Servidor fecha/hora:', result.rows[0].current_time);
             console.log('🧪 Valor de test:', result.rows[0].test_value);
             
             // Obtener información de la base de datos
             const dbInfo = await client.query(`
                 SELECT 
                     current_database() AS database_name,
                     current_user AS user_name,
                     version() AS postgres_version
             `);
             
             console.log('🗄️  Base de datos:', dbInfo.rows[0].database_name);
             console.log('👤 Usuario:', dbInfo.rows[0].user_name);
             console.log('📦 Versión PostgreSQL:', dbInfo.rows[0].postgres_version.substring(0, 30) + '...');
             
         } finally {
             // Always release the client back to the pool
             client.release();
         }
         
     } catch (error) {
         console.error('❌ Error de conexión a Neon:');
         console.error('   ', error.message);
         
         // Diagnóstico específico de errores comunes
         if (error.code === 'EPROTO') {
             console.error('   → Problema de red o timeout. Verifica tu conexión internet.');
         }
         if (error.code === 'ECONNREFUSED') {
             console.error('   → Conexión rechazada. Verifica la URL y que Neon esté activo.');
         }
         if (error.code === 'ECONNSSL') {
             console.error('   → Error SSL. Neon requiere sslmode=require en la URL.');
         }
         
         console.error('   → Verifica tu archivo .env y la consola de Neon');
         process.exit(1);
     }
 };

 // Ejecutar prueba
 testConnection();

// -------------------------------------------------------------------------
// Salir del proceso después de la prueba
// -------------------------------------------------------------------------

 // Timeout para auto-cerrar si no hay errores
 setTimeout(() => {
     console.log('\n👋 Prueba completada. Cerrando aplicación.');
     process.exit(0);
 }, 5000);