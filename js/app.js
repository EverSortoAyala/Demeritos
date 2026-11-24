/*!
 * app.js - Sistema Escolar con Base de datos Excel (SheetJS)
 * Purpose: CRUD operations for school merits/demerits/logros/perdon using Excel files
 * Maintains SOLID principles with client-side storage
 */

 // -------------------------------------------------------------------------
 // CONFIGURACIÓN Y CONSTANTES
 // -------------------------------------------------------------------------

 const DATABASE_NAME = 'escuela.xlsx';
 const SHEET_NAMES = {
     USUARIOS: 'usuarios',
     ESTUDIANTES: 'estudiantes',
     DEMERITOS: 'demeritos',
     LOGROS: 'logros',
     PERDON: 'perdon'
 };

 const COLUMNS = {
     USUARIOS: ['id', 'username', 'password', 'rol', 'creado_en'],
     ESTUDIANTES: ['id', 'nombre', 'nie', 'grado'],
     DEMERITOS: ['id', 'fecha', 'nombre_alumno', 'nie', 'tipo_demerito', 'nivel', 'descripcion', 'mensaje_padre', 'profesor_encargado', 'creado_en'],
     LOGROS: ['id', 'alumno_nie', 'alumno_nombre', 'mes', 'mencionado_red_social'],
     PERDON: ['id', 'alumno_nie', 'alumno_nombre', 'tarea', 'fecha_asignacion', 'fecha_completado', 'profesor_verifica', 'estado']
 };

 // -------------------------------------------------------------------------
 // SINGLE RESPONSIBILITY: Database Operations with SheetJS
 // -------------------------------------------------------------------------

 class ExcelDatabase {
     constructor() {
         this.workbook = null;
         this.initialized = false;
     }

     // Load existing workbook or create new one
     async init() {
         return new Promise((resolve, reject) => {
             // Check if file exists
             // In browser, we'll use a default path or ask to create
             // For now, create sample data if no file
             this.workbook = XLSX.utils.book_new();
             
             // Initialize sheets if they don't exist
             this._ensureSheets();
             
             this.initialized = true;
             resolve();
         });
     }

     _ensureSheets() {
         const sheets = Object.values(SHEET_NAMES);
         sheets.forEach(sheetName => {
             const exists = this.workbook.SheetNames.includes(sheetName);
             if (!exists) {
                 const data = this._getInitialData(sheetName);
                 const worksheet = XLSX.utils.aoa_to_sheet(data);
                 XLSX.utils.book_append_sheet(this.workbook, worksheet, sheetName);
             }
         });
     }

     _getInitialData(sheetName) {
         switch (sheetName) {
             case SHEET_NAMES.USUARIOS:
                 return [['id', 'username', 'password', 'rol', 'creado_en']];
             case SHEET_NAMES.ESTUDIANTES:
                 return [['id', 'nombre', 'nie', 'grado']];
             case SHEET_NAMES.DEMERITOS:
                 return [['id', 'fecha', 'nombre_alumno', 'nie', 'tipo_demerito', 'nivel', 'descripcion', 'mensaje_padre', 'profesor_encargado', 'creado_en']];
             case SHEET_NAMES.LOGROS:
                 return [['id', 'alumno_nie', 'alumno_nombre', 'mes', 'mencionado_red_social']];
             case SHEET_NAMES.PERDON:
                 return [['id', 'alumno_nie', 'alumno_nombre', 'tarea', 'fecha_asignacion', 'fecha_completado', 'profesor_verifica', 'estado']];
             default:
                 return [];
         }
     }

     // Read all rows from a sheet
     _getSheetData(sheetName) {
         const worksheet = this.workbook.Sheets[sheetName];
         if (!worksheet) return [];
         const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
         // Return data without header
         return rows.slice(1);
     }

     // Get column indices for a sheet
     _getColumnIndex(sheetName, columnLetter) {
         const cellAddress = `${columnLetter}1`;
         const cell = this.workbook.Sheets[sheetName][cellAddress];
         return cell ? XLSX.utils.decode_cell(cellAddress).r : 1;
     }

     // Write data to sheet
     _writeSheet(sheetName, data) {
         const worksheet = XLSX.utils.aoa_to_sheet(data);
         XLSX.utils.book_append_sheet(this.workbook, worksheet, sheetName);
     }

     // Save to localStorage (as base64)
     async save() {
         const workbookBase64 = XLSX.write(this.workbook, { bookType: 'xlsx', type: 'base64' });
         localStorage.setItem(DATABASE_NAME, workbookBase64);
     }

     // Load from localStorage
     loadFromLocalStorage() {
         const base64 = localStorage.getItem(DATABASE_NAME);
         if (base64) {
             try {
                 this.workbook = XLSX.read(base64, { type: 'base64' });
                 this.initialized = true;
             } catch (e) {
                 console.error('Error loading database:', e);
                 this._resetDatabase();
             }
         } else {
             this._resetDatabase();
         }
     }

     _resetDatabase() {
         this.workbook = XLSX.utils.book_new();
         this._ensureSheets();
         this.save();
     }

     // CRUD methods - all return promises

     async read(sheetName) {
         if (!this.initialized) await this.init();
         return this._getSheetData(sheetName);
     }

     async create(sheetName, newRowData) {
         if (!this.initialized) await this.init();
         
         const currentData = this._getSheetData(sheetName);
         
         // Add ID if not present
         const idField = COLUMNS[sheetName][0];
         const newId = currentData.length > 0 ? Math.max(...currentData.map(row => row[0] || 0)) + 1 : 1;
         
         const row = [newId, ...Object.values(newRowData)];
         currentData.push(row);
         
         this._writeSheet(sheetName, currentData);
         await this.save();
         
         return newId;
     }

     async update(sheetName, id, updatedData) {
         if (!this.initialized) await this.init();
         
         const currentData = this._getSheetData(sheetName);
         const rowIndex = currentData.findIndex(row => row[0] === id);
         
         if (rowIndex === -1) throw new Error(`Registro con ID ${id} no encontrado`);
         
         // Update row maintaining ID at position 0
         const row = [...currentData[rowIndex]];
         const fieldNames = COLUMNS[sheetName];
         
         // Map the updated data to the correct columns
         // This is simplified - in production would map by column name
         for (let i = 1; i < fieldNames.length; i++) {
             if (updatedData[fieldNames[i]] !== undefined) {
                 row[i] = updatedData[fieldNames[i]];
             }
         }
         
         currentData[rowIndex] = row;
         
         this._writeSheet(sheetName, currentData);
         await this.save();
         
         return true;
     }

     async delete(sheetName, id) {
         if (!this.initialized) await this.init();
         
         const currentData = this._getSheetData(sheetName);
         const newData = currentData.filter(row => row[0] !== id);
         
         if (newData.length === currentData.length) {
             throw new Error(`Registro con ID ${id} no encontrado`);
         }
         
         this._writeSheet(sheetName, newData);
         await this.save();
         
         return true;
     }
 }

// -------------------------------------------------------------------------
 // SINGLE RESPONSIBILITY: Application Logic
 // -------------------------------------------------------------------------

 class AppLogic {
     constructor() {
         this.db = new ExcelDatabase();
         this.currentUser = null;
         this.currentView = 'login';
         this.init();
     }

     async init() {
         // Load database from localStorage first
         this.db.loadFromLocalStorage();
         
         // Then initialize with sample data if needed
         await this.db.init();
         
         // Set up event listeners
         this._setupEventListeners();
         
         // Check auth state
         this._checkAuthState();
     }

     _setupEventListeners() {
         // Login form
         const loginForm = document.getElementById('loginForm');
         if (loginForm) {
             loginForm.addEventListener('submit', (e) => this._handleLogin(e));
         }

         // Register form
         const registerForm = document.getElementById('registerForm');
         if (registerForm) {
             registerForm.addEventListener('submit', (e) => this._handleRegister(e));
         }
     }

     _checkAuthState() {
         const user = localStorage.getItem('currentUser');
         if (user) {
             this.currentUser = JSON.parse(user);
             this._showView('main-nav');
             this._loadInitialData();
         } else {
             this._showView('login');
         }
     }

     _handleLogin(e) {
         e.preventDefault();
         const username = document.getElementById('loginUsername').value.trim();
         const password = document.getElementById('loginPassword').value.trim();
         
         const users = this.db.read(SHEET_NAMES.USUARIOS);
         const user = users.find(u => u[1] === username && u[2] === password);
         
         if (user) {
             this.currentUser = {
                 id: u[0],
                 username: u[1],
                 rol: u[3]
             };
             localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
             this._showView('main-nav');
             this._loadInitialData();
         } else {
             alert('Usuario o contraseña incorrectos');
         }
     }

     _handleRegister(e) {
         e.preventDefault();
         const username = document.getElementById('regUsername').value.trim();
         const password = document.getElementById('regPassword').value.trim();
         const confirmPassword = document.getElementById('regPasswordConfirm').value.trim();
         
         if (password !== confirmPassword) {
             alert('Las contraseñas no coinciden');
             return;
         }
         
         const users = this.db.read(SHEET_NAMES.USUARIOS);
         if (users.some(u => u[1] === username)) {
             alert('El nombre de usuario ya existe');
             return;
         }
         
         // Add new user with role 'usuario' by default, 'admin' if first user
         const isFirstUser = users.length === 0;
         const role = isFirstUser ? 'admin' : 'usuario';
         
         await this.db.create(SHEET_NAMES.USUARIOS, {
             username: username,
             password: password,
             rol: role
         });
         
         // Auto-login after registration
         this.currentUser = {
             id: 1,
             username: username,
             rol: role
         };
         localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
         this._showView('main-nav');
         this._loadInitialData();
     }

     _loadInitialData() {
         // Load all data for the views
         // This will be called after auth
         // Individual views will fetch what they need
     }

     // Utility: Show view
     showView(viewName) {
         const views = ['login', 'register', 'demerito', 'logro', 'perdon', 'main-nav'];
         const viewElements = document.querySelectorAll('.view');
         
         viewElements.forEach(view => {
             view.classList.remove('active');
         });
         
         const targetView = document.getElementById(`${viewName}-view`);
         if (targetView) {
             targetView.classList.add('active');
         }
         
         this.currentView = viewName;
     }

     // Utility: Logout
     logout() {
         this.currentUser = null;
         localStorage.removeItem('currentUser');
         this._showView('login');
     }
 }

// -------------------------------------------------------------------------
 // INITIALIZATION
 // -------------------------------------------------------------------------

 // Wait for DOM content to load
 if (document.readyState === 'loading') {
     document.addEventListener('DOMContentLoaded', () => {
         window.app = new AppLogic();
     });
 } else {
     window.app = new AppLogic();
 }