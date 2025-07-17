CREATE DATABASE IF NOT EXISTS lustpath_db;
USE lustpath_db;

CREATE TABLE DistritoJudicial (
    id_distrito INT PRIMARY KEY AUTO_INCREMENT,
    nombre_distrito VARCHAR(100) NOT NULL,
    codigo_distrito CHAR(3) NOT NULL UNIQUE
);

-- Tabla OrganoJurisdiccional
CREATE TABLE OrganoJurisdiccional (
    id_organismo INT PRIMARY KEY AUTO_INCREMENT,
    nombre_organismo VARCHAR(100) NOT NULL,
    codigo_organismo CHAR(2) NOT NULL UNIQUE
);

-- Tabla Persona
CREATE TABLE Persona (
    id_persona INT PRIMARY KEY AUTO_INCREMENT,
    dni CHAR(8) UNIQUE,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    telefono VARCHAR(15),
    correo_electronico VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla Usuario
CREATE TABLE Usuario (
    id_usuario INT PRIMARY KEY AUTO_INCREMENT,
    id_persona INT,
    nombre_usuario VARCHAR(50) UNIQUE NOT NULL,
    contraseña_hash VARCHAR(255) NOT NULL,
    rol_sistema VARCHAR(50) DEFAULT 'USUARIO',
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_persona) REFERENCES Persona(id_persona)
);

-- Tabla Expediente
CREATE TABLE Expediente (
    cod_expediente VARCHAR(20) PRIMARY KEY,
    año_inicio CHAR(4) NOT NULL,
    mes_inicio CHAR(2) NOT NULL,
    distrito_judicial_id INT,
    numero_secuencial CHAR(3) NOT NULL,
    organo_jurisdiccional_id INT,
    clase_procedimiento CHAR(1),
    estado_expediente VARCHAR(50) DEFAULT 'ACTIVO',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sumilla TEXT,
    observaciones TEXT,
    FOREIGN KEY (distrito_judicial_id) REFERENCES DistritoJudicial(id_distrito),
    FOREIGN KEY (organo_jurisdiccional_id) REFERENCES OrganoJurisdiccional(id_organismo)
);

-- Tabla ParticipanteExpediente
CREATE TABLE ParticipanteExpediente (
    id_participante INT PRIMARY KEY AUTO_INCREMENT,
    id_persona INT,
    cod_expediente VARCHAR(20),
    rol VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_persona) REFERENCES Persona(id_persona),
    FOREIGN KEY (cod_expediente) REFERENCES Expediente(cod_expediente) ON DELETE CASCADE
);

-- Tabla MovimientoExpediente  
CREATE TABLE MovimientoExpediente (
    id_movimiento INT PRIMARY KEY AUTO_INCREMENT,
    cod_expediente VARCHAR(20),
    descripcion TEXT NOT NULL,
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_registro INT,
    FOREIGN KEY (cod_expediente) REFERENCES Expediente(cod_expediente) ON DELETE CASCADE,
    FOREIGN KEY (usuario_registro) REFERENCES Usuario(id_usuario)
);

-- Insertar datos iniciales para Distritos Judiciales
INSERT INTO DistritoJudicial (nombre_distrito, codigo_distrito) VALUES
('Lima', 'LIM'),
('Callao', 'CAL'),
('Arequipa', 'ARE'),
('Trujillo', 'TRU'),
('Cusco', 'CUS'),
('Piura', 'PIU'),
('Ica', 'ICA'),
('Lambayeque', 'LAM');

-- Insertar datos iniciales para Órganos Jurisdiccionales
INSERT INTO OrganoJurisdiccional (nombre_organismo, codigo_organismo) VALUES
('Juzgado Civil', 'JC'),
('Juzgado Penal', 'JP'),
('Juzgado Laboral', 'JL'),
('Juzgado de Familia', 'JF'),
('Juzgado Comercial', 'JM'),
('Sala Civil', 'SC'),
('Sala Penal', 'SP'),
('Sala Laboral', 'SL');

-- Insertar usuario administrador por defecto
INSERT INTO Persona (dni, nombres, apellidos, correo_electronico, telefono) VALUES
('12345678', 'Administrador', 'Sistema', 'admin@lustpath.com', '999999999'),
('87654321', 'María', 'González López', 'maria.gonzalez@lustpath.com', '987654321');

-- Insertar usuarios del sistema (contraseña: admin123 y user123 respectivamente)
INSERT INTO Usuario (id_persona, nombre_usuario, contraseña_hash, rol_sistema) VALUES
(1, 'admin', '$2a$10$X7gn2ZqCvZ5Ps8MOgMvwEOJxGV.6OpWjU8zMzKJ5yJzq0Zp1Q0xMy', 'ADMINISTRADOR'),
(2, 'maria', '$2a$10$4O8VfhqpzKK5yGzjIvWvdOGdKzJzQJ8xGn2K5QvWjIrJzMzKJ5yJz', 'USUARIO');

-- Crear índices para mejorar rendimiento
CREATE INDEX idx_expediente_estado ON Expediente(estado_expediente);
CREATE INDEX idx_expediente_fecha ON Expediente(fecha_registro);
CREATE INDEX idx_participante_rol ON ParticipanteExpediente(rol);
CREATE INDEX idx_movimiento_fecha ON MovimientoExpediente(fecha_movimiento);
CREATE INDEX idx_persona_dni ON Persona(dni);

-- Vistas útiles
CREATE VIEW vista_expedientes_completos AS
SELECT 
    e.cod_expediente,
    e.año_inicio,
    e.mes_inicio,
    e.estado_expediente,
    e.fecha_registro,
    e.sumilla,
    dj.nombre_distrito,
    oj.nombre_organismo,
    GROUP_CONCAT(
        CASE WHEN pe.rol = 'DEMANDANTE' 
        THEN CONCAT(p.nombres, ' ', p.apellidos) 
        END SEPARATOR '; '
    ) as demandantes,
    GROUP_CONCAT(
        CASE WHEN pe.rol = 'DEMANDADO' 
        THEN CONCAT(p.nombres, ' ', p.apellidos) 
        END SEPARATOR '; '
    ) as demandados
FROM Expediente e
LEFT JOIN DistritoJudicial dj ON e.distrito_judicial_id = dj.id_distrito
LEFT JOIN OrganoJurisdiccional oj ON e.organo_jurisdiccional_id = oj.id_organismo
LEFT JOIN ParticipanteExpediente pe ON e.cod_expediente = pe.cod_expediente
LEFT JOIN Persona p ON pe.id_persona = p.id_persona
GROUP BY e.cod_expediente;

CREATE TRIGGER tr_validar_formato_expediente
BEFORE INSERT ON Expediente
FOR EACH ROW
BEGIN
    -- Verificar formato básico: AAAA-MM-DDD-NNN
    SELECT CASE
        WHEN NEW.cod_expediente NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[A-Z][A-Z][A-Z]-[0-9][0-9][0-9]' THEN
            RAISE(ABORT, 'Formato de código de expediente inválido. Debe ser: AAAA-MM-DDD-NNN')
        
        -- Verificar que el distrito judicial existe
        WHEN NOT EXISTS (SELECT 1 FROM DistritoJudicial WHERE id_distrito = NEW.distrito_judicial_id) THEN
            RAISE(ABORT, 'El distrito judicial especificado no existe')
            
        -- Verificar que el órgano jurisdiccional existe
        WHEN NOT EXISTS (SELECT 1 FROM OrganoJurisdiccional WHERE id_organismo = NEW.organo_jurisdiccional_id) THEN
            RAISE(ABORT, 'El órgano jurisdiccional especificado no existe')
            
        -- Verificar que el año y mes coincidan con el código
        WHEN (NEW.año_inicio || '-' || NEW.mes_inicio) != substr(NEW.cod_expediente, 1, 7) THEN
            RAISE(ABORT, 'El año y mes no coinciden con el código de expediente')
    END;
END;

CREATE TRIGGER tr_procesar_acciones
AFTER INSERT ON acciones_expedientes
FOR EACH ROW
WHEN NEW.procesado = 0 AND NEW.tipo_accion = 'REGISTRAR_MOVIMIENTO'
BEGIN
    -- Registrar el movimiento principal
    INSERT INTO MovimientoExpediente (cod_expediente, descripcion, usuario_registro)
    VALUES (NEW.cod_expediente, NEW.descripcion, NEW.usuario_id);
    
    -- Actualizar estado si es necesario
    UPDATE Expediente 
    SET estado_expediente = NEW.nuevo_estado 
    WHERE cod_expediente = NEW.cod_expediente AND NEW.nuevo_estado IS NOT NULL;
    
    -- Registrar movimiento de cambio de estado si aplica
    INSERT INTO MovimientoExpediente (cod_expediente, descripcion, usuario_registro)
    SELECT NEW.cod_expediente, 'Estado del expediente cambiado a: ' || NEW.nuevo_estado, NEW.usuario_id
    WHERE NEW.nuevo_estado IS NOT NULL;
    
    -- Marcar como procesado
    UPDATE acciones_expedientes SET procesado = 1 WHERE id = NEW.id;
END;