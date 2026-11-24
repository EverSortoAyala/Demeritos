/*!
 * database.js - Servicio de Conexión PostgreSQL para Neon
 * Purpose: Manejar todas las conexiones y queries a la base de datos PostgreSQL en la nube
 * Maintains SOLID principles with abstracted database operations
 * License: MIT
 */

 // -------------------------------------------------------------------------
 // IMPORTS Y CONFIGURACIÓN
 // -------------------------------------------------------------------------

 const { Pool } = require('pg');  // Driver oficial PostgreSQL para Node.js
 require('dotenv').config();        // Cargar variables de entorno (.env)

// -------------------------------------------------------------------------
// Single Responsibility: Configuración y creación del pool de conexiones
// Un pool mantiene conexiones abiertas para reutilización, mejorando performance
// -------------------------------------------------------------------------

 // Crear instancia del pool de conexiones usando la URL de Neon
 // Neon requiere SSL (sslmode=require) para conexiones seguras
 const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     ssl: {
         rejectUnauthorized: false  // Neon requiere esto para desarrollo
     },
     // Configuración de pool para optimizar performance
     max: 20,           // Máximo de conexiones en el pool
     min: 2,           // Mínimo de conexiones siempre disponibles
     idleTimeoutMillis: 30000, // Cerrar conexiones inactivas después de 30s
     connectionTimeoutMillis: 2000 // Timeout de 2s para establecer conexión
 });

// -------------------------------------------------------------------------
// Interface Segregation: Funciones exposadas solo las necesarias
// server.js dependerá de este objeto, no de la conexión pg directamente
// -------------------------------------------------------------------------

 // Exportar configuración y utilidades del pool
 module.exports = {
     // Pool principal de conexiones
     pool,

     // Función para obtener el pool de conexiones (inyección de dependencia)
     getPool: () => pool,

     // Verificar si la conexión está configurada correctamente
     isConfigured: () => !!process.env.DATABASE_URL,

     // Obtener el estado actual del pool (para debugging)
     getPoolStatus: () => ({
         activeConnections: pool._totalCount,
         acquired: pool._acquireCount,
         released: pool._releaseCount
     })
 };

 // -------------------------------------------------------------------------
 // Código de prueba al cargar el módulo (solo en desarrollo)
// -------------------------------------------------------------------------

 // Log de confirmación cuando el módulo se carga exitosamente
 if (require.main === module) {
     console.log('✅ Servicio database.js cargado correctamente');
     console.log('📡 Configuración Neon:', process.env.DATABASE_URL ? '✅ Configurada' : '❌ Faltando DATABASE_URL');
     console.log('🔒 SSL configurado: true (necesario para Neon)');
 }