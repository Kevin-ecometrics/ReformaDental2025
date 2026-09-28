USE clinicareforma_contacts;

-- ─── Citas de ejemplo ────────────────────────────────────────────────

INSERT INTO citas (nombre_paciente, correo, telefono, fecha, hora, primera_visita, servicio, seguro, origen) VALUES
('María García',     'maria@example.com',     '6641234567', '2026-06-02', '09:00:00', 1, 'Limpieza dental', 'Sin seguro', 'web'),
('Juan López',       'juan@example.com',      '6642345678', '2026-06-02', '10:00:00', 0, 'Visita sucesiva', 'Seguro Popular', 'web'),
('Ana Martínez',     'ana@example.com',       '6643456789', '2026-06-03', '11:00:00', 0, 'Visita sucesiva', 'Sin seguro', 'web'),
('Carlos Hernández', 'carlos@example.com',    '6644567890', '2026-06-03', '14:00:00', 1, 'Blanqueamiento', 'Dental Care', 'dashboard'),
('Sofía Ramírez',    'sofia@example.com',     '6645678901', '2026-06-04', '09:00:00', 0, 'Visita sucesiva', 'Sin seguro', 'web'),
('Pedro Torres',     'pedro@example.com',     '6646789012', '2026-06-04', '15:00:00', 1, 'Ortodoncia', 'Sin seguro', 'telefono'),
('Laura Flores',     'laura@example.com',     '6647890123', '2026-06-05', '10:00:00', 0, 'Visita sucesiva', 'IMSS', 'web'),
('Miguel Ángel Ruiz','miguel@example.com',    '6648901234', '2026-06-05', '12:00:00', 1, 'Extracción', 'Sin seguro', 'dashboard'),
('Diana Castro',     'diana@example.com',     '6649012345', '2026-06-08', '13:00:00', 0, 'Visita sucesiva', 'Seguro Popular', 'web'),
('Roberto Mendoza',  'roberto@example.com',   '6640123456', '2026-06-08', '16:00:00', 1, 'Implante dental', 'Dental Care', 'dashboard');

-- ─── Fechas bloqueadas (ej: días festivos) ───────────────────────────

INSERT INTO fechas_bloqueadas (fecha, hora) VALUES
('2026-06-07', '00:00'),  -- Domingo (todo el día)
('2026-06-14', '00:00'),  -- Domingo
('2026-06-21', '00:00'),  -- Domingo
('2026-06-28', '00:00'),  -- Domingo
('2026-09-16', '00:00'),  -- Día de la Independencia (México)
('2026-12-25', '00:00'),  -- Navidad
('2026-01-01', '00:00'),  -- Año Nuevo
('2026-05-01', '00:00'),  -- Día del Trabajo
('2026-11-02', '00:00');  -- Día de Muertos
