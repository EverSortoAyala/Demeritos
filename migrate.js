#!/usr/bin/env node
// Migration script: Create database tables for Sistema de Meritos Escolares
// Uses the DATABASE_URL from .env to connect to Neon PostgreSQL

const { Pool } = require('pg');
require('dotenv').config();

// Configuración de conexión usando DATABASE_URL del .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Neon requiere esto para desarrollo
  }
});

const tables = [
  // Tabla users
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(30) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario')),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Tabla demeritos
  `CREATE TABLE IF NOT EXISTS demeritos (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    nombre_alumno VARCHAR(100) NOT NULL,
    nie VARCHAR(20) NOT NULL,
    tipo_demerito VARCHAR(50) NOT NULL,
    nivel INTEGER DEFAULT 1 CHECK (nivel >= 1 AND nivel <= 10),
    descripcion TEXT,
    mensaje_padre TEXT,
    profesor_encargado VARCHAR(100),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Tabla logros
  `CREATE TABLE IF NOT EXISTS logros (
    id SERIAL PRIMARY KEY,
    alumno_nie VARCHAR(20) NOT NULL,
    alumno_nombre VARCHAR(100) NOT NULL,
    mes VARCHAR(50) NOT NULL,
    mencionado_red_social BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Tabla perdon
  `CREATE TABLE IF NOT EXISTS perdon (
    id SERIAL PRIMARY KEY,
    alumno_nie VARCHAR(20) NOT NULL,
    alumno_nombre VARCHAR(100) NOT NULL,
    tarea VARCHAR(100) NOT NULL,
    fecha_asignacion DATE DEFAULT CURRENT_DATE,
    fecha_completado DATE,
    profesor_verifica VARCHAR(100) DEFAULT 'por verificar',
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completado', 'rechazado')),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
];

let completed = 0;
const total = tables.length;

console.log('🚀 Iniciando migración de base de datos...');
console.log('📡 Conectando a Neon PostgreSQL...\n');

pool.on('connect', () => {
  console.log('✅ Conexión establecida con Neon PostgreSQL\n');
});

pool.connect()
  .then((client) => {
    console.log('🔧 Ejecutando migración de tablas...\n');

    tables.forEach((tableSql, index) => {
      console.log(`   Ejecutando tabla ${index + 1}/${total}...`);
      
      client.query(tableSql)
        .then(() => {
          completed++;
          console.log(`   ✅ Tabla ${index + 1} creada exitosamente`);
          
          if (completed === total) {
            console.log('\n🎉 ¡Migración completada exitosamente!');
            console.log('   Todas las tablas han sido creadas en Neon PostgreSQL');
            pool.end();
            process.exit(0);
          }
        })
        .catch((err) => {
          // Tabla ya existe o error
          console.log(`   ⚠️ Tabla ${index + 1}: ${err.message.split('\\n')[0]}`);
          completed++;
          
          if (completed === total) {
            console.log('\n🎉 ¡Migración completada!');
            console.log('   (Algunas tablas podían ya existir)');
            pool.end();
            process.exit(0);
          }
        });
    });
  })
  .catch((err) => {
    console.error('❌ Error al conectar con la base de datos:');
    console.error('   ', err.message);
    console.error('');
    console.error('   Verifica que DATABASE_URL en .env sea correcto');
    pool.end();
    process.exit(1);
  });

// Manejo de tiempo de espera
setTimeout(() => {
  console.log('⏰ Tiempo de espera agotado. La migración tardó demasiado.');
  pool.end();
  process.exit(1);
}, 30000);