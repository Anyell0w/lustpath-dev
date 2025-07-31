const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Configuración de middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Configuración de sesiones
app.use(session({
  secret: 'lustpath-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// Crear directorio de uploads si no existe
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Inicializar base de datos SQLite
const db = new sqlite3.Database('lustpath.db');

// Crear tablas adaptadas a SQLite
db.serialize(() => {
  // Tabla DistritoJudicial
  db.run(`CREATE TABLE IF NOT EXISTS DistritoJudicial (
    id_distrito INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_distrito VARCHAR(100) NOT NULL,
    codigo_distrito CHAR(3) NOT NULL UNIQUE
  )`);

  // Tabla OrganoJurisdiccional
  db.run(`CREATE TABLE IF NOT EXISTS OrganoJurisdiccional (
    id_organismo INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_organismo VARCHAR(100) NOT NULL,
    codigo_organismo CHAR(2) NOT NULL UNIQUE
  )`);

  // Tabla Usuario
  db.run(`CREATE TABLE IF NOT EXISTS Usuario (
    id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    rol_sistema VARCHAR(50) DEFAULT 'USUARIO',
    activo BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabla Expediente - Simplificada
  db.run(`CREATE TABLE IF NOT EXISTS Expediente (
    cod_expediente VARCHAR(20) PRIMARY KEY,
    año_expediente CHAR(4) NOT NULL,
    distrito_judicial_id INTEGER,
    estado_expediente VARCHAR(50) DEFAULT 'ACTIVO',
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_vencimiento DATE,
    sumilla TEXT,
    observaciones TEXT,
    monto_demanda DECIMAL(15,2),
    usuario_creador INTEGER,
    FOREIGN KEY (distrito_judicial_id) REFERENCES DistritoJudicial(id_distrito),
    FOREIGN KEY (usuario_creador) REFERENCES Usuario(id_usuario)
  )`);

  // Tabla DocumentoExpediente
  db.run(`CREATE TABLE IF NOT EXISTS DocumentoExpediente (
    id_documento INTEGER PRIMARY KEY AUTOINCREMENT,
    cod_expediente VARCHAR(20),
    nombre_documento VARCHAR(255) NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo VARCHAR(500) NOT NULL,
    tamaño_archivo INTEGER,
    fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario_subida INTEGER,
    FOREIGN KEY (cod_expediente) REFERENCES Expediente(cod_expediente) ON DELETE CASCADE,
    FOREIGN KEY (usuario_subida) REFERENCES Usuario(id_usuario)
  )`);

  // Tabla DerivacionExpediente
  db.run(`CREATE TABLE IF NOT EXISTS DerivacionExpediente (
    id_derivacion INTEGER PRIMARY KEY AUTOINCREMENT,
    cod_expediente VARCHAR(20),
    usuario_origen INTEGER,
    usuario_destino INTEGER,
    motivo TEXT,
    fecha_derivacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'PENDIENTE',
    fecha_aceptacion DATETIME,
    observaciones TEXT,
    FOREIGN KEY (cod_expediente) REFERENCES Expediente(cod_expediente) ON DELETE CASCADE,
    FOREIGN KEY (usuario_origen) REFERENCES Usuario(id_usuario),
    FOREIGN KEY (usuario_destino) REFERENCES Usuario(id_usuario)
  )`);

  // Insertar datos iniciales
  const distritos = [
    ['Lima', 'LIM'], ['Callao', 'CAL'], ['Arequipa', 'ARE'], ['Trujillo', 'TRU'],
    ['Cusco', 'CUS'], ['Piura', 'PIU'], ['Ica', 'ICA'], ['Lambayeque', 'LAM']
  ];

  const organismos = [
    ['Juzgado Civil', 'JC'], ['Juzgado Penal', 'JP'], ['Juzgado Laboral', 'JL'],
    ['Juzgado de Familia', 'JF'], ['Sala Civil', 'SC'], ['Sala Penal', 'SP']
  ];

  distritos.forEach(([nombre, codigo]) => {
    db.run('INSERT OR IGNORE INTO DistritoJudicial (nombre_distrito, codigo_distrito) VALUES (?, ?)', [nombre, codigo]);
  });

  organismos.forEach(([nombre, codigo]) => {
    db.run('INSERT OR IGNORE INTO OrganoJurisdiccional (nombre_organismo, codigo_organismo) VALUES (?, ?)', [nombre, codigo]);
  });

  // Crear usuario admin por defecto
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run('INSERT OR IGNORE INTO Usuario (email, password, nombre, rol_sistema) VALUES (?, ?, ?, ?)', 
    ['admin@lustpath.com', adminPassword, 'Administrador', 'ADMIN']);
});

// Middleware de autenticación
const requireAuth = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
};

const requireAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.rol_sistema === 'ADMIN') {
    next();
  } else {
    res.status(403).send('Acceso denegado');
  }
};

// Rutas de autenticación
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  db.get('SELECT * FROM Usuario WHERE email = ? AND activo = 1', [email], (err, user) => {
    if (err || !user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    req.session.user = user;
    db.run('UPDATE Usuario SET last_login = CURRENT_TIMESTAMP WHERE id_usuario = ?', [user.id_usuario]);
    res.json({ success: true, redirect: '/' });
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Ruta principal
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes para expedientes
app.get('/api/expedientes', requireAuth, (req, res) => {
  const query = `
    SELECT e.*, dj.nombre_distrito, u.nombre as usuario_creador
    FROM Expediente e
    LEFT JOIN DistritoJudicial dj ON e.distrito_judicial_id = dj.id_distrito
    LEFT JOIN Usuario u ON e.usuario_creador = u.id_usuario
    ORDER BY e.fecha_registro DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// API Routes para dashboard
app.get('/api/dashboard/stats', requireAuth, (req, res) => {
  const queries = {
    totalExpedientes: 'SELECT COUNT(*) as count FROM Expediente',
    expedientesActivos: 'SELECT COUNT(*) as count FROM Expediente WHERE estado_expediente = "ACTIVO"',
    expedientesVencidos: `SELECT COUNT(*) as count FROM Expediente WHERE fecha_vencimiento < date('now') AND estado_expediente = 'ACTIVO'`,
    expedientesPorVencer: `SELECT COUNT(*) as count FROM Expediente WHERE fecha_vencimiento BETWEEN date('now') AND date('now', '+7 days') AND estado_expediente = 'ACTIVO'`,
    documentosSubidos: 'SELECT COUNT(*) as count FROM DocumentoExpediente',
    expedientesPorDistrito: `
      SELECT dj.nombre_distrito, COUNT(e.cod_expediente) as count
      FROM DistritoJudicial dj
      LEFT JOIN Expediente e ON dj.id_distrito = e.distrito_judicial_id
      GROUP BY dj.id_distrito, dj.nombre_distrito
      ORDER BY count DESC
      LIMIT 5
    `,
    expedientesPorMes: `
      SELECT 
        strftime('%Y-%m', fecha_registro) as mes,
        COUNT(*) as count
      FROM Expediente 
      WHERE fecha_registro >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', fecha_registro)
      ORDER BY mes
    `,
    expedientesRecientes: `
      SELECT e.cod_expediente, e.sumilla, e.fecha_registro, dj.nombre_distrito
      FROM Expediente e
      LEFT JOIN DistritoJudicial dj ON e.distrito_judicial_id = dj.id_distrito
      ORDER BY e.fecha_registro DESC
      LIMIT 5
    `
  };

  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error(`Error in ${key}:`, err);
        results[key] = key.includes('Por') ? [] : { count: 0 };
      } else {
        results[key] = key.includes('Por') || key === 'expedientesRecientes' ? rows : rows[0];
      }
      
      completed++;
      if (completed === total) {
        res.json(results);
      }
    });
  });
});


// Función para generar código completo del expediente

app.get('/api/expedientes/:cod', requireAuth, (req, res) => {
  const query = `
    SELECT e.*, dj.nombre_distrito, dj.codigo_distrito, u.nombre as usuario_creador
    FROM Expediente e
    LEFT JOIN DistritoJudicial dj ON e.distrito_judicial_id = dj.id_distrito
    LEFT JOIN Usuario u ON e.usuario_creador = u.id_usuario
    WHERE e.cod_expediente = ?
  `;
  
  db.get(query, [req.params.cod], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    res.json(row);
  });
});

app.post('/api/expedientes', requireAuth, (req, res) => {
  const {
    cod_expediente, año_expediente, distrito_judicial_id,
    fecha_vencimiento, sumilla, observaciones, monto_demanda
  } = req.body;

  // Validar los datos básicos
  // Verificar que el distrito existe y obtener su código
  db.get('SELECT id_distrito, codigo_distrito FROM DistritoJudicial WHERE id_distrito = ?', [distrito_judicial_id], (err, distrito) => {
    if (err || !distrito) {
      return res.status(400).json({ error: 'Distrito judicial no válido' });
    }
    
    // Generar el código completo del expediente
    
    // Verificar que no existe el código completo
    db.get('SELECT cod_expediente FROM Expediente WHERE cod_expediente = ?', [codigoCompleto], (err, existing) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (existing) {
        return res.status(400).json({ error: 'Ya existe un expediente con este código completo' });
      }
      
      // Insertar expediente
      const query = `
        INSERT INTO Expediente (
          cod_expediente, año_expediente, distrito_judicial_id,
          fecha_vencimiento, sumilla, observaciones, monto_demanda, usuario_creador
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(query, [
        codigoCompleto, año_expediente, distrito_judicial_id,
        fecha_vencimiento, sumilla, observaciones, monto_demanda, req.session.user.id_usuario
      ], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, cod_expediente: codigoCompleto });
      });
    });
  });
});

// API para validar código de expediente en tiempo real

app.put('/api/expedientes/:cod', requireAuth, (req, res) => {
  const {
    año_expediente, distrito_judicial_id, estado_expediente,
    fecha_vencimiento, sumilla, observaciones, monto_demanda
  } = req.body;

  const query = `
    UPDATE Expediente SET
      año_expediente = ?, distrito_judicial_id = ?, estado_expediente = ?,
      fecha_vencimiento = ?, sumilla = ?, observaciones = ?, monto_demanda = ?
    WHERE cod_expediente = ?
  `;

  db.run(query, [
    año_expediente, distrito_judicial_id, estado_expediente,
    fecha_vencimiento, sumilla, observaciones, monto_demanda, req.params.cod
  ], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.delete('/api/expedientes/:cod', requireAdmin, (req, res) => {
  db.run('DELETE FROM Expediente WHERE cod_expediente = ?', [req.params.cod], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// API Routes para documentos
app.get('/api/expedientes/:cod/documentos', requireAuth, (req, res) => {
  const query = `
    SELECT d.*, u.nombre as usuario_subida
    FROM DocumentoExpediente d
    LEFT JOIN Usuario u ON d.usuario_subida = u.id_usuario
    WHERE d.cod_expediente = ?
    ORDER BY d.fecha_subida DESC
  `;
  
  db.all(query, [req.params.cod], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/expedientes/:cod/documentos', requireAuth, upload.single('documento'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  const { nombre_documento } = req.body;
  const query = `
    INSERT INTO DocumentoExpediente (
      cod_expediente, nombre_documento, nombre_archivo, ruta_archivo,
      tamaño_archivo, usuario_subida
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [
    req.params.cod, nombre_documento, req.file.originalname,
    req.file.path, req.file.size, req.session.user.id_usuario
  ], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, id_documento: this.lastID });
  });
});

app.get('/api/documentos/:id/download', requireAuth, (req, res) => {
  db.get('SELECT * FROM DocumentoExpediente WHERE id_documento = ?', [req.params.id], (err, doc) => {
    if (err || !doc) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    res.download(doc.ruta_archivo, doc.nombre_archivo);
  });
});

app.delete('/api/documentos/:id', requireAuth, (req, res) => {
  db.get('SELECT * FROM DocumentoExpediente WHERE id_documento = ?', [req.params.id], (err, doc) => {
    if (err || !doc) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    // Eliminar archivo físico
    fs.unlink(doc.ruta_archivo, (unlinkErr) => {
      if (unlinkErr) console.error('Error eliminando archivo:', unlinkErr);
    });

    // Eliminar registro de la base de datos
    db.run('DELETE FROM DocumentoExpediente WHERE id_documento = ?', [req.params.id], function(deleteErr) {
      if (deleteErr) {
        return res.status(500).json({ error: deleteErr.message });
      }
      res.json({ success: true });
    });
  });
});

// API Routes para datos de referencia
app.get('/api/distritos', requireAuth, (req, res) => {
  db.all('SELECT * FROM DistritoJudicial ORDER BY nombre_distrito', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/organismos', requireAuth, (req, res) => {
  db.all('SELECT * FROM OrganoJurisdiccional ORDER BY nombre_organismo', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Ruta para obtener información del usuario actual
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    id_usuario: req.session.user.id_usuario,
    nombre: req.session.user.nombre,
    email: req.session.user.email,
    rol_sistema: req.session.user.rol_sistema
  });
});

// API Routes para gestión de usuarios (solo admin)
app.get('/api/usuarios', requireAdmin, (req, res) => {
  db.all('SELECT id_usuario, email, nombre, rol_sistema, activo, created_at FROM Usuario ORDER BY nombre', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/usuarios', requireAdmin, (req, res) => {
  const { email, password, nombre, rol_sistema } = req.body;
  
  // Verificar si el email ya existe
  db.get('SELECT id_usuario FROM Usuario WHERE email = ?', [email], (err, existingUser) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (existingUser) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run('INSERT INTO Usuario (email, password, nombre, rol_sistema) VALUES (?, ?, ?, ?)', 
      [email, hashedPassword, nombre, rol_sistema], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, id_usuario: this.lastID });
    });
  });
});

app.put('/api/usuarios/:id', requireAdmin, (req, res) => {
  const { nombre, rol_sistema, activo } = req.body;
  
  db.run('UPDATE Usuario SET nombre = ?, rol_sistema = ?, activo = ? WHERE id_usuario = ?', 
    [nombre, rol_sistema, activo, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.delete('/api/usuarios/:id', requireAdmin, (req, res) => {
  // No permitir eliminar el propio usuario
  if (parseInt(req.params.id) === req.session.user.id_usuario) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  }
  
  db.run('DELETE FROM Usuario WHERE id_usuario = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// API Routes para derivaciones
app.get('/api/derivaciones', requireAuth, (req, res) => {
  const query = `
    SELECT d.*, e.sumilla, e.cod_expediente,
           uo.nombre as usuario_origen_nombre, ud.nombre as usuario_destino_nombre
    FROM DerivacionExpediente d
    LEFT JOIN Expediente e ON d.cod_expediente = e.cod_expediente
    LEFT JOIN Usuario uo ON d.usuario_origen = uo.id_usuario
    LEFT JOIN Usuario ud ON d.usuario_destino = ud.id_usuario
    WHERE d.usuario_destino = ? OR d.usuario_origen = ?
    ORDER BY d.fecha_derivacion DESC
  `;
  
  db.all(query, [req.session.user.id_usuario, req.session.user.id_usuario], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/derivaciones', requireAdmin, (req, res) => {
  const { cod_expediente, usuario_destino, motivo } = req.body;
  
  const query = `
    INSERT INTO DerivacionExpediente (cod_expediente, usuario_origen, usuario_destino, motivo)
    VALUES (?, ?, ?, ?)
  `;
  
  db.run(query, [cod_expediente, req.session.user.id_usuario, usuario_destino, motivo], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, id_derivacion: this.lastID });
  });
});

app.put('/api/derivaciones/:id/aceptar', requireAuth, (req, res) => {
  const { observaciones } = req.body;
  
  db.run(`UPDATE DerivacionExpediente SET estado = 'ACEPTADA', fecha_aceptacion = CURRENT_TIMESTAMP, observaciones = ?
          WHERE id_derivacion = ? AND usuario_destino = ?`, 
    [observaciones, req.params.id, req.session.user.id_usuario], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.put('/api/derivaciones/:id/rechazar', requireAuth, (req, res) => {
  const { observaciones } = req.body;
  
  db.run(`UPDATE DerivacionExpediente SET estado = 'RECHAZADA', observaciones = ?
          WHERE id_derivacion = ? AND usuario_destino = ?`, 
    [observaciones, req.params.id, req.session.user.id_usuario], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
