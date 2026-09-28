CREATE DATABASE IF NOT EXISTS clinicareforma_contacts
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE clinicareforma_contacts;

CREATE TABLE IF NOT EXISTS citas (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  nombre_paciente VARCHAR(255)  NOT NULL,
  correo          VARCHAR(255)  DEFAULT NULL,
  telefono        VARCHAR(20)   NOT NULL,
  fecha           DATE          NOT NULL,
  hora            TIME          NOT NULL,
  primera_visita  TINYINT(1)    DEFAULT 0,
  servicio        VARCHAR(255)  DEFAULT '',
  seguro          VARCHAR(255)  DEFAULT 'Sin seguro',
  origen          VARCHAR(50)   DEFAULT 'web',
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fecha_hora (fecha, hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fechas_bloqueadas (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  fecha      DATE         NOT NULL,
  hora       VARCHAR(5)   NOT NULL DEFAULT '00:00',
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fecha_hora (fecha, hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
