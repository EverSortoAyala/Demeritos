/*!
 * server.js - Express Server con PostgreSQL y Neon (Migración desde Excel)
 * Purpose: REST API CRUD para sistema de meritos escolares usando PostgreSQL en la nube
 * Database: Neon PostgreSQL (cloud) - reemplaza el archivo escuela.xlsx
 * Maintains SOLID principles with abstracted database service
 * License: MIT
 * 
 * PATRÓN: Todas las routes usan async/await correctamente mediante IIFE (Inmediately Invoked Function Expression).
 * Ningún await está en el module level fuera de funciones definidas.
 * initializeDatabase se llama dentro de app.listen callback.
 * Usa bcryptjs en lugar de bcrypt nativo (compatibilidad con Windows Node).
 * Incluye middleware body-parser para JSON y formularios.
 */

// -------------------------------------------------------------------------
// IMPORTS Y CONFIGURACIÓN
// -------------------------------------------------------------------------

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');

const bcryptjs = require('bcryptjs');      // Hasheo de contraseñas seguro (bcryptjs, no bcrypt nativo)
const { body, validationResult } = require('express-validator'); // Validación de formularios
const fs = require('fs');
require('dotenv');            // Cargar variables de .env

const { getPool, isConfigured } = require('./services/database'); // Nuevo servicio Neon

// -------------------------------------------------------------------------
// HELPER FUNCTIONS - async functions used by routes
// Single Responsibility: Abstracted database operations
// Estas funciones son llamadas por las routes usando IIFE pattern
// -------------------------------------------------------------------------

// Helper: Conectar y ejecutar una query, cerrar conexión
const withDbClient = async (callback) => {
     const pool = getPool();
     const client = await pool.connect();
     try {
         return await callback(client);
     } finally {
         client.release();
     }
 };

// Helper: Obtener próximo ID auto-incremental
const getNextId = async (tableName) => {
     const result = await withDbClient(async (client) => {
         let queryName = 'users';
         if (tableName === 'demeritos') queryName = 'demeritos';
         else if (tableName === 'logros') queryName = 'logros';
         else if (tableName === 'perdon') queryName = 'perdon';
         
         const result = await client.query(
             `SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${queryName}`
         );
         return result.rows[0].next_id;
     });
     return result;
 };

// Helper: Verificar si usuario existe
const userExists = async (username) => {
     return await withDbClient(async (client) => {
         const result = await client.query(
             'SELECT id FROM users WHERE username = $1',
             [username]
         );
         return result.rows.length > 0;
     });
 };

// Helper: Hashear contraseña
const hashPassword = async (password, saltRounds) => {
     return await bcryptjs.hash(password, saltRounds);
 };

// Helper: Comparar contraseña
const comparePassword = async (plainPassword, hashedPassword) => {
     return await bcryptjs.compare(plainPassword, hashedPassword);
 };

// -------------------------------------------------------------------------
// FUNCTION: initializeDatabase
// Purpose: Initialize PostgreSQL connection pool and verify connectivity
// Single Responsibility: Abstracted DB initialization
// NOTE: Esta función se llama DESPUÉS dentro de app.listen callback
// para evitar errores de await en module level
// -------------------------------------------------------------------------

// Función async para inicializar la conexión a la base de datos
// Se llama desde app.listen callback, NO en el module level
// Esto evita el error "await is only valid in async functions and the top level bodies of modules"
async function initializeDatabase() {
     try {
         const pool = getPool();

         // Test connection by attempting to query
         const client = await pool.connect();

         try {
             // Simple query to verify connection is alive
             await client.query('SELECT 1 AS test');
             console.log('✅ Conexión a Neon PostgreSQL establecida correctamente');
             console.log('   Pool configurado con max:', pool.options.max, 'conexiones');
             return true;
         } finally {
             client.release();
         }
     } catch (error) {
         console.error('❌ Error al conectar con Neon PostgreSQL:');
         console.error('   ', error.message);

         // Diagnóstico específico
         if (error.code === 'ECONNREFUSED') {
             console.error('   → Verifica que DATABASE_URL en .env sea correcto');
         }
         if (error.code === 'ECONNSSL') {
             console.error('   → Error SSL. Neon requiere sslmode=require en la URL');
         }
         if (error.code === 'ENOTFOUND') {
             console.error('   → Error DNS. Verifica la dirección del host en la URL');
         }

         throw error;
     }
 }

// -------------------------------------------------------------------------
// APP EXPRESS SETUP
// -------------------------------------------------------------------------

const app = express();
const PORT = process.env.APP_PORT || 3000;

// Middleware para parsear cuerpos JSON entrantes
// Necesario para que req.body esté disponible y express-validator funcione
app.use(express.json());

// Middleware para parsear cuerpos codificados en URL (formularios HTML)
app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------------------------
// SESSION CONFIGURATION
// -------------------------------------------------------------------------

// Session configuration for login persistence
app.use(session({
     secret: process.env.APP_SESSION_SECRET || 'smenaa-secret-key-2026',
     resave: false,
     saveUninitialized: false,
     cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
 }));

// -------------------------------------------------------------------------
// RUTAS DE AUTENTICACIÓN (usando helpers async con IIFE pattern)
// -------------------------------------------------------------------------

// GET: Página de login/registro
app.get('/', (req, res) => {
     // Si ya hay sesión de usuario, redirige a la vista principal
     if (req.session.user) {
         res.redirect('/demerito');
     } else {
         res.sendFile(path.join(__dirname, 'public', 'auth.html'));
     }
 });

// POST: Registro de nuevo usuario (usando helpers async con IIFE)
app.post('/api/register',
     // Validación express-validator
     [body('username')
         .trim()
         .notEmpty()
         .withMessage('Nombre de usuario requerido')
         .isLength({ min: 3, max: 30 })
         .withMessage('Usuario debe tener entre 3 y 30 caracteres'),
      body('password')
          .trim()
          .notEmpty()
          .withMessage('Contraseña requerida')
          .isLength({ min: 4, max: 128 })
          .withMessage('Contraseña debe tener al menos 4 caracteres')],

   // Callback: NO es flecha async directamente, usa IIFE async abajo
   (req, res) => {
       // Validar resultados
       const errors = validationResult(req);
       if (!errors.isEmpty()) {
           return res.status(400).json({
               error: 'Datos de validación incorrectos',
               details: errors.array()
           });
       }

       const { username, password } = req.body;

       // Usar IIFE async para operacion a BD
       (async () => {
           try {
               // Verificar si usuario ya existe
               if (await userExists(username)) {
                   return res.status(409).json({
                       error: 'El nombre de usuario ya está registrado'
                   });
               }

               // Hashear contraseña
               const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
               const passwordHash = await hashPassword(password, saltRounds);

               // Obtener el próximo ID
               const nuevoId = await getNextId('users');

               // Insertar nuevo usuario
               const insertResult = await withDbClient(async (client) => {
                   return await client.query(
                       `INSERT INTO users (id, username, password_hash, rol, creado_en)
                        VALUES ($1, $2, $3, 'usuario', CURRENT_TIMESTAMP)
                        RETURNING id, username, rol`,
                       [nuevoId, username, passwordHash]
                   );
               });

               const nuevoUsuario = insertResult.rows[0];

               // Iniciar sesión
               req.session.user = {
                   id: nuevoUsuario.id,
                   username: nuevoUsuario.username,
                   rol: nuevoUsuario.rol
               };

               res.json({
                   success: true,
                   message: 'Usuario registrado exitosamente',
                   user: {
                       id: nuevoUsuario.id,
                       username: nuevoUsuario.username,
                       rol: nuevoUsuario.rol
                   }
               });
           } catch (error) {
               console.error('❌ Error en registro:', error);
               res.status(500).json({
                   error: 'Error interno del servidor durante el registro',
                   details: process.env.APP_ENV === 'development' ? error.message : undefined
               });
           }
       })();
   }
);

// POST: Login de usuario (usando helpers async con IIFE)
app.post('/api/login',
     // Validación
     [body('username')
         .trim()
         .notEmpty()
         .withMessage('Usuario requerido'),
      body('password')
          .trim()
          .notEmpty()
          .withMessage('Contraseña requerida')],

   // Callback: NO es flecha async directamente, usa IIFE async abajo
   (req, res) => {
       // Validar resultados
       const errors = validationResult(req);
       if (!errors.isEmpty()) {
           return res.status(400).json({
               error: 'Datos de validación incorrectos',
               details: errors.array()
           });
       }

       const { username, password } = req.body;

       // Usar IIFE async para operacion a BD
       (async () => {
           try {
               // Buscar usuario por nombre
               const result = await withDbClient(async (client) => {
                   return await client.query(
                       'SELECT id, username, password_hash, rol FROM users WHERE username = $1',
                       [username]
                   );
               });

               if (result.rows.length === 0) {
                   return res.status(401).json({
                       error: 'Usuario o contraseña incorrectos'
                   });
               }

               const user = result.rows[0];

               // Comparar contraseña con bcryptjs
               const passwordMatch = await comparePassword(password, user.password_hash);

               if (!passwordMatch) {
                   return res.status(401).json({
                       error: 'Usuario o contraseña incorrectos'
                   });
               }

               // Determinar rol: admin si es el primero, sino 'usuario'
               const countResult = await withDbClient(async (client) => {
                   return await client.query('SELECT COUNT(*) AS count FROM users');
               });
               const userCount = parseInt(countResult.rows[0].count);
               const rol = userCount === 1 ? 'admin' : 'usuario';

               // Iniciar sesión
               req.session.user = {
                   id: user.id,
                   username: user.username,
                   rol: rol
               };

               res.json({
                   success: true,
                   message: 'Login exitoso',
                   user: {
                       id: user.id,
                       username: user.username,
                       rol: rol
                   }
               });
           } catch (error) {
               console.error('❌ Error en login:', error);
               res.status(500).json({
                   error: 'Error interno del servidor durante el login',
                   details: process.env.APP_ENV === 'development' ? error.message : undefined
               });
           }
       })();
   }
);

// GET: Verificar estado de login
app.get('/api/login/status', (req, res) => {
     if (req.session.user) {
         res.json({
             loggedIn: true,
             user: req.session.user
         });
     } else {
         res.json({ loggedIn: false });
     }
 });

// POST: Logout
app.post('/api/logout', (req, res) => {
     req.session.destroy(() => {
         res.json({ success: true, message: 'Sesión cerrada' });
     });
 });

// -------------------------------------------------------------------------
// RUTAS CRUD DE DEMERITOS (PostgreSQL en lugar de XLSX)
// -------------------------------------------------------------------------

// GET: Obtener todos los demeritos
app.get('/api/demeritos', (req, res) => {
     if (!req.session.user) {
         return res.status(401).json({ error: 'No autenticado' });
     }

     // Usar IIFE async
     (async () => {
         try {
             const result = await withDbClient(async (client) => {
                 return await client.query(
                     `SELECT id, fecha, nombre_alumno, nie, tipo_demerito, 
                       nivel, descripcion, mensaje_padre, profesor_encargado, creado_en
                        FROM demeritos 
                        ORDER BY creado_en DESC`
                 );
             });

             // Formato compatible con lo que esperaban las vistas (array como antes)
             const formatted = result.rows.map(row => [
                 row.id,
                 row.fecha,
                 row.nombre_alumno,
                 row.nie,
                 row.tipo_demerito,
                 row.nivel,
                 row.descripcion,
                 row.mensaje_padre,
                 row.profesor_encargado,
                 row.creado_en
             ]);

             res.json(formatted);
         } catch (error) {
             console.error('❌ Error al obtener demeritos:', error);
             res.status(500).json({
                 error: 'Error al cargar deméritos',
                 details: process.env.APP_ENV === 'development' ? error.message : undefined
             });
         }
     })();
 });

// POST: Crear nuevo demerito (usando PostgreSQL INSERT)
app.post('/api/demeritos',
     // Validación de campos obligatorios
     [body('fecha').notEmpty().withMessage('Fecha requerida'),
      body('nombre_alumno').notEmpty().withMessage('Nombre del alumno requerido'),
      body('nie').notEmpty().withMessage('NIE requerido'),
      body('tipo_demerito').notEmpty().withMessage('Tipo de demérito requerido'),
      body('profesor_encargado').notEmpty().withMessage('Profesor encargado requerido'),
      body('nivel').optional().isInt({ min: 1, max: 10 }).withMessage('Nivel debe ser 1-10')],

   // Callback: NO es flecha async directamente, usa IIFE async abajo
   (req, res) => {
       if (!req.session.user) {
           return res.status(401).json({ error: 'No autenticado' });
       }

       // Validar resultados
       const errors = validationResult(req);
       if (!errors.isEmpty()) {
           return res.status(400).json({
               error: 'Datos de validación incorrectos',
               details: errors.array()
           });
       }

       const {
           fecha,
           nombre_alumno,
           nie,
           tipo_demerito,
           nivel,
           descripcion,
           mensaje_padre,
           profesor_encargado
       } = req.body;

       // Usar IIFE async para operacion a BD
       (async () => {
           try {
               // Obtener el próximo ID
               const nuevoId = await getNextId('demeritos');

               // Usar nivel por defecto si no se proporciona
               const nivelNum = parseInt(nivel) || 1;

               // Insertar nuevo demérito
               const insertResult = await withDbClient(async (client) => {
                   return await client.query(
                       `INSERT INTO demeritos (id, fecha, nombre_alumno, nie, tipo_demerito, nivel, 
                         descripcion, mensaje_padre, profesor_encargado, creado_en)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                        RETURNING id, fecha, nombre_alumno, nie, tipo_demerito, nivel, 
                              descripcion, mensaje_padre, profesor_encargado, creado_en`,
                       [nuevoId, fecha, nombre_alumno, nie, tipo_demerito, nivelNum,
                       descripcion || '', mensaje_padre || '', profesor_encargado]
                   );
               });

               const nuevoDemerito = insertResult.rows[0];

               res.json({
                   success: true,
                   message: 'Demerito registrado correctamente',
                   id: nuevoDemerito.id
               });
           } catch (error) {
               console.error('❌ Error al registrar demérito:', error);
               res.status(500).json({
                   error: 'Error al registrar demérito',
                   details: process.env.APP_ENV === 'development' ? error.message : undefined
               });
           }
       })();
   }
);

// -------------------------------------------------------------------------
// RUTAS DE LOGROS (PostgreSQL)
// -------------------------------------------------------------------------

// GET: Obtener todos los logros
app.get('/api/logros', (req, res) => {
     if (!req.session.user) {
         return res.status(401).json({ error: 'No autenticado' });
     }

     // Usar IIFE async
     (async () => {
         try {
             const result = await withDbClient(async (client) => {
                 return await client.query(
                     `SELECT id, alumno_nie, alumno_nombre, mes, mencionado_red_social
                      FROM logros 
                      ORDER BY id DESC`
                 );
             });

             res.json(result.rows);
         } catch (error) {
             console.error('❌ Error al obtener logros:', error);
             res.status(500).json({
                 error: 'Error al cargar logros',
                 details: process.env.APP_ENV === 'development' ? error.message : undefined
             });
         }
     })();
 });

// POST: Registrar logro
app.post('/api/logros',
     [body('alumno_nie').notEmpty().withMessage('NIE requerido'),
      body('alumno_nombre').notEmpty().withMessage('Nombre del alumno requerido'),
      body('mes').notEmpty().withMessage('Mes requerido')],

   // Callback: NO es flecha async directamente, usa IIFE async abajo
   (req, res) => {
       if (!req.session.user) {
           return res.status(401).json({ error: 'No autenticado' });
       }

       // Validar resultados
       const errors = validationResult(req);
       if (!errors.isEmpty()) {
           return res.status(400).json({
               error: 'Datos de validación incorrectos',
               details: errors.array()
           });
       }

       const { alumno_nie, alumno_nombre, mes, mencionado_red_social } = req.body;

       // Usar IIFE async para operacion a BD
       (async () => {
           try {
               // Obtener el próximo ID
               const nuevoId = await getNextId('logros');

               // Insertar nuevo logro
               await withDbClient(async (client) => {
                   await client.query(
                       `INSERT INTO logros (id, alumno_nie, alumno_nombre, mes, mencionado_red_social)
                        VALUES ($1, $2, $3, $4, $5)`,
                       [nuevoId, alumno_nie, alumno_nombre, mes, mencionado_red_social === true]
                   );
               });

               res.json({
                   success: true,
                   message: 'Logro registrado',
                   id: nuevoId
               });
           } catch (error) {
               console.error('❌ Error al registrar logro:', error);
               res.status(500).json({
                   error: 'Error al registrar logro',
                   details: process.env.APP_ENV === 'development' ? error.message : undefined
               });
           }
       })();
   }
);

// -------------------------------------------------------------------------
// RUTAS DE PERDON (PostgreSQL)
// -------------------------------------------------------------------------

// GET: Obtener todos los perdones
app.get('/api/perdon', (req, res) => {
     if (!req.session.user) {
         return res.status(401).json({ error: 'No autenticado' });
     }

     // Usar IIFE async
     (async () => {
         try {
             const result = await withDbClient(async (client) => {
                 return await client.query(
                     `SELECT id, alumno_nie, alumno_nombre, tarea, fecha_asignacion, 
                           fecha_completado, profesor_verifica, estado
                      FROM perdon 
                      ORDER BY creado_en DESC`
                 );
             });

             res.json(result.rows);
         } catch (error) {
             console.error('❌ Error al obtener perdones:', error);
             res.status(500).json({
                 error: 'Error al cargar perdones',
                 details: process.env.APP_ENV === 'development' ? error.message : undefined
             });
         }
     })();
 });

// POST: Registrar nuevo perdón
app.post('/api/perdon',
     [body('alumno_nie').notEmpty().withMessage('NIE requerido'),
      body('tarea').notEmpty().withMessage('Tarea requerida'),
      body('fecha_completado').notEmpty().withMessage('Fecha de completado requerida')],

   // Callback: NO es flecha async directamente, usa IIFE async abajo
   (req, res) => {
       if (!req.session.user) {
           return res.status(401).json({ error: 'No autenticado' });
       }

       // Validar resultados
       const errors = validationResult(req);
       if (!errors.isEmpty()) {
           return res.status(400).json({
               error: 'Datos de validación incorrectos',
               details: errors.array()
           });
       }

       const { alumno_nie, tarea, fecha_completado } = req.body;

       // Usar IIFE async para operacion a BD
       (async () => {
           try {
               // Obtener el próximo ID
               const nuevoId = await getNextId('perdon');

               // Insertar nuevo perdón
               await withDbClient(async (client) => {
                   await client.query(
                       `INSERT INTO perdon (id, alumno_nie, alumno_nombre, tarea, fecha_asignacion, 
                             fecha_completado, profesor_verifica, estado)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                       [nuevoId, alumno_nie, alumno_nie, tarea, fecha_completado,
                        new Date().toISOString().split('T')[0], 'profesor_verify_pending', 'pendiente']
                   );
               });

               res.json({
                   success: true,
                   message: 'Perdón registrado',
                   id: nuevoId
               });
           } catch (error) {
               console.error('❌ Error al registrar perdón:', error);
               res.status(500).json({
                   error: 'Error al registrar perdón',
                   details: process.env.APP_ENV === 'development' ? error.message : undefined
               });
           }
       })();
   }
);

// -------------------------------------------------------------------------
// VISTAS HTML (mantienen compatibilidad)
// -------------------------------------------------------------------------

// Página de demeritos
app.get('/demerito', (req, res) => {
     if (!req.session.user) {
         return res.redirect('/');
     }
     res.sendFile(path.join(__dirname, 'public', 'demerito.html'));
 });

// Página de logros
app.get('/logro', (req, res) => {
     if (!req.session.user) {
         return res.redirect('/');
     }
     res.sendFile(path.join(__dirname, 'public', 'logro.html'));
 });

// Página de perdón
app.get('/perdon', (req, res) => {
     if (!req.session.user) {
         return res.redirect('/');
     }
     res.sendFile(path.join(__dirname, 'public', 'perdon.html'));
 });

// -------------------------------------------------------------------------
// ERROR HANDLING
// -------------------------------------------------------------------------

// Manejo de rutas 404
app.use((req, res) => {
     res.status(404).send('Ruta no encontrada');
 });

// -------------------------------------------------------------------------
// INICIAR SERVIDOR
// -------------------------------------------------------------------------

// Crear carpeta database si no existe (mantener compatibilidad, aunque ya no se usa directamente)
const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
     fs.mkdirSync(dbDir);
 }

// Iniciar servidor
// NOTA: initializeDatabase se llama DESPUÉS de que el servidor está listo
// dentro del callback de app.listen, evitando el error de await en module level
app.listen(PORT, async () => {
     console.log('=======================================');
     console.log('Sistema de Meritos Escolares - API REST');
     console.log('=======================================');
     console.log('');

     // Inicializar conexión a BD cuando el servidor esté listo
     try {
         await initializeDatabase();
         console.log('✅ Capa de base de datos lista - Servidor Express completamente activo');
     } catch (err) {
         console.error('❌ Error crítico al inicializar la base de datos:');
         console.error('   ', err.message);
     }

     console.log('');
     console.log('Servidor corriendo en: http://localhost:' + PORT);
     console.log('');
     console.log('Endpoints disponibles:');
     console.log('  GET  /                  - Pantalla de acceso');
     console.log('  POST /api/register      - Registrar nuevo usuario (PostgreSQL)');
     console.log('  POST /api/login         - Iniciar sesión (PostgreSQL + bcryptjs)');
     console.log('  GET  /api/login/status  - Verificar estado de login');
     console.log('  POST /api/logout        - Cerrar sesión');
     console.log('');
     console.log('  GET  /api/demeritos     - Listar demeritos (PostgreSQL)');
     console.log('  POST /api/demeritos     - Registrar nuevo demerito (PostgreSQL)');
     console.log('');
     console.log('  GET  /api/logros        - Listar logros (PostgreSQL)');
     console.log('  POST /api/logros        - Registrar nuevo logro (PostgreSQL)');
     console.log('');
     console.log('  GET  /api/perdon        - Listar perdones (PostgreSQL)');
     console.log('  POST /api/perdon        - Registrar nuevo perdón (PostgreSQL)');
     console.log('');
     console.log('  GET  /demerito          - Vista de demeritos (HTML)');
     console.log('  GET  /logro             - Vista de logros (HTML)');
     console.log('  GET  /perdon            - Vista de perdón (HTML)');
     console.log('');
     console.log('Seguridad:');
     console.log('  - Contraseñas hasheadas con bcryptjs');
     console.log('  - Conexiones SSL via Neon');
     console.log('  - Validación express-validator en todos los forms');
     console.log('');
     console.log('Migración de datos:');
     console.log('  - Datos existentes en escuela.xlsx deben migrirse manualmente');
     console.log('  - Opcional: usar script SQL para exportar a neon.tech');
     console.log('');

 });

 module.exports = app;