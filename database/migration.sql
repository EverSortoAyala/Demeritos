-- ============================================================
-- Migration Script: Sistema de Meritos Escolares - PostgreSQL
-- Purpose: Create all tables needed for the school merits system
-- Database: Neon PostgreSQL
-- ============================================================

-- ============================================================
-- Table: users
-- Purpose: Almacenar usuarios del sistema (autenticación)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(30) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario')),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comment: La primera posición registrada se vuelve admin automáticamente
-- en la aplicación Express (lógica en server.js)

-- ============================================================
-- Table: demeritos
-- Purpose: Registrar deméritos o puntos negativos de alumnos
-- ============================================================
CREATE TABLE IF NOT EXISTS demeritos (
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
);

-- ============================================================
-- Table: logros
-- Purpose: Registrar logros o logros escolares de alumnos
-- ============================================================
CREATE TABLE IF NOT EXISTS logros (
    id SERIAL PRIMARY KEY,
    alumno_nie VARCHAR(20) NOT NULL,
    alumno_nombre VARCHAR(100) NOT NULL,
    mes VARCHAR(50) NOT NULL,
    mencionado_red_social BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table: perdon
-- Purpose: Registrar perdones o excusas de tareas asignadas
-- ============================================================
CREATE TABLE IF NOT EXISTS perdon (
    id SERIAL PRIMARY KEY,
    alumno_nie VARCHAR(20) NOT NULL,
    alumno_nombre VARCHAR(100) NOT NULL,
    tarea VARCHAR(100) NOT NULL,
    fecha_asignacion DATE DEFAULT CURRENT_DATE,
    fecha_completado DATE,
    profesor_verifica VARCHAR(100) DEFAULT 'por verificar',
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completado', 'rechazado')),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Indexes for performance
-- ============================================================

-- Index on users table for faster lookups by username
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Index on demeritos for faster queries by alumno and date
CREATE INDEX IF NOT EXISTS idx_demeritos_alumno_fecha ON demeritos(nombre_alumno, fecha);

-- Index on logros for faster queries by alumno
CREATE INDEX IF NOT EXISTS idx_logros_alumno ON logros(alumno_nie);

-- Index on perdon for faster queries by alumno and state
CREATE INDEX IF NOT EXISTS idx_perdon_alumno_estado ON perdon(alumno_nie, estado);

-- ============================================================
-- Summary
-- ============================================================
-- Tablas creadas:
--   - users:  autenticación y roles (admin/usuario)
--   - demeritos: registro de deméritos escolares
--   - logros: registro de logros escolares
--   - perdon: registro de excusas/tareas perdonadas
--
-- Primera usuario registrado → rol 'admin' (lógica en server.js)
-- ============================================================