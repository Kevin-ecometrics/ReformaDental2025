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

-- ══════════════════════════════════════════════════════════════════════════════
-- CRM (prefijo crm_) -- 8 tablas en la MISMA base que el calendario.
--
-- Requiere MySQL 5.7+ / MariaDB 10.2+ (columnas JSON y CHECK). Comprobar antes
-- con: SELECT VERSION();
--
-- En cPanel el usuario no tiene permiso para CREATE DATABASE ni USE: desde el
-- editor SQL, seleccionar la base y ejecutar SOLO desde aqui hacia abajo (las
-- tablas del calendario de arriba ya existen). Es idempotente: se puede correr
-- de nuevo sin romper nada ni duplicar datos.
--
-- Prefijo crm_ para no colisionar con tablas del calendario. Nada del CRM debe
-- hacer DROP ni TRUNCATE de tablas que no sean crm_*.
-- Despues de aplicar: node server.js --crm-seed
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Etapas del pipeline (New, Contacted, Scheduled, etc.) ────────────────────
CREATE TABLE IF NOT EXISTS crm_stages (
  id     VARCHAR(64) PRIMARY KEY,
  name   VARCHAR(100) NOT NULL,
  `order` INT NOT NULL DEFAULT 0,
  color  VARCHAR(20) NOT NULL DEFAULT '#545758'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Leads (contactos captados via Facebook Lead Ads u otra fuente) ──────────
CREATE TABLE IF NOT EXISTS crm_leads (
  id              VARCHAR(64) PRIMARY KEY,
  fb_leadgen_id   VARCHAR(64) NULL,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NULL,
  phone           VARCHAR(50) NULL,
  source          VARCHAR(50) NOT NULL DEFAULT 'facebook',
  campaign_name   VARCHAR(255) NULL,
  ad_name         VARCHAR(255) NULL,
  form_name       VARCHAR(255) NULL,
  field_data_raw  JSON NULL,          -- respuestas crudas del formulario de Facebook
  stage           VARCHAR(64) NOT NULL DEFAULT 'new',
  notes           TEXT NULL,
  created_at      DATETIME(3) NOT NULL,
  updated_at      DATETIME(3) NOT NULL,
  -- Hora en que terminaron los efectos de creacion (CAPI + reglas new_lead). NULL = pendiente:
  -- el tick los reprocesa. En una base existente: ALTER TABLE crm_leads ADD COLUMN effects_fired_at
  -- DATETIME(3) NULL AFTER updated_at; y luego UPDATE crm_leads SET effects_fired_at = created_at;
  effects_fired_at DATETIME(3) NULL,
  -- Archivado (no borrado: el sync de Facebook recrearia la fila). NULL = activo.
  -- En una base existente: ALTER TABLE crm_leads ADD COLUMN archived_at DATETIME(3) NULL AFTER effects_fired_at;
  archived_at     DATETIME(3) NULL,
  CONSTRAINT fk_crm_leads_stage FOREIGN KEY (stage) REFERENCES crm_stages(id),
  UNIQUE KEY uq_crm_leads_fb_leadgen_id (fb_leadgen_id),
  INDEX idx_crm_leads_stage (stage),
  INDEX idx_crm_leads_created_at (created_at),
  -- No son unique: la deteccion automatica de duplicados esta pendiente y
  -- mientras tanto MySQL no debe impedir crear el lead repetido.
  INDEX idx_crm_leads_email (email),
  INDEX idx_crm_leads_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Actividades / log por lead ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_activities (
  id         VARCHAR(64) PRIMARY KEY,
  lead_id    VARCHAR(64) NOT NULL,
  type       VARCHAR(50) NOT NULL,   -- system | note | stage_change | capi_sent | capi_failed | message_sent | message_failed
  content    TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_crm_activities_lead FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
  INDEX idx_crm_activities_lead_id (lead_id),
  INDEX idx_crm_activities_type (type),
  INDEX idx_crm_activities_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tareas asociadas a un lead (manuales o por reglas de automatizacion) ────
CREATE TABLE IF NOT EXISTS crm_tasks (
  id          VARCHAR(64) PRIMARY KEY,
  lead_id     VARCHAR(64) NOT NULL,
  description VARCHAR(500) NOT NULL,
  due_at      DATETIME(3) NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  DATETIME(3) NOT NULL,
  CONSTRAINT fk_crm_tasks_lead FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
  INDEX idx_crm_tasks_lead_id (lead_id),
  INDEX idx_crm_tasks_due_at (due_at),
  INDEX idx_crm_tasks_done (done)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Reglas de automatizacion (trigger -> action) ────────────────────────────
-- PK en `key` y no en un id autogenerado: los seeds (--crm-seed) se escriben
-- con UPSERT y necesitan una clave natural estable. El id nanoid que usaba la
-- version lowdb cambiaria en cada seed y duplicaria reglas.
CREATE TABLE IF NOT EXISTS crm_automation_rules (
  `key`        VARCHAR(100) PRIMARY KEY,
  label        VARCHAR(255) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL,  -- new_lead | stage_change | stale_contacted
  action       VARCHAR(50) NOT NULL,  -- create_task | send_message
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  config       JSON NOT NULL         -- delayHours, taskDescription, stage, staleHours, channel, templateKey
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Plantillas de mensajes por canal (email | sms | whatsapp) ───────────────
CREATE TABLE IF NOT EXISTS crm_templates (
  `key`                      VARCHAR(100) NOT NULL,
  channel                    VARCHAR(20)  NOT NULL,   -- email | sms | whatsapp
  label                      VARCHAR(255) NOT NULL,
  subject                    VARCHAR(255) NULL,      -- solo aplica a email
  body                       TEXT NOT NULL,
  -- Cuando estan puestas, sendMessageToLead() envia via la API de plantillas
  -- de Meta (funciona fuera de la ventana de 24h) en vez de texto libre.
  -- Deben coincidir exactamente con una plantilla Approved en Meta.
  whatsapp_template_name     VARCHAR(255) NULL,
  whatsapp_template_language VARCHAR(10)  NULL,
  PRIMARY KEY (`key`, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Estado global de sincronizacion (singleton, siempre 1 fila con id=1) ────
CREATE TABLE IF NOT EXISTS crm_sync_state (
  id                 TINYINT PRIMARY KEY DEFAULT 1,
  last_sync_at       DATETIME(3) NULL,
  last_error         TEXT NULL,
  last_capi_at       DATETIME(3) NULL,
  last_capi_error    TEXT NULL,
  token_valid        BOOLEAN NULL,
  token_checked_at   DATETIME(3) NULL,
  token_check_error  TEXT NULL,
  -- Correos (separados por coma) que reciben el aviso de lead nuevo de Facebook.
  -- En una base existente: ALTER TABLE crm_sync_state ADD COLUMN notify_emails TEXT NULL
  notify_emails      TEXT NULL,
  CONSTRAINT chk_crm_sync_state_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO crm_sync_state (id) VALUES (1);

-- ─── Usuarios del CRM (auth propia; el calendario no tiene) ──────────────────
-- password_hash con formato scrypt$N$r$p$<salt_b64>$<hash_b64> (ver crm/auth.js).
-- NO se usa bcrypt: es un modulo nativo que hay que compilar, y compilar en el
-- cPanel compartido es un riesgo que no vale la pena para este caso.
CREATE TABLE IF NOT EXISTS crm_users (
  id            VARCHAR(64) PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'admin',
  created_at    DATETIME(3) NOT NULL,
  last_login_at DATETIME(3) NULL,
  UNIQUE KEY uq_crm_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CHANGE LOG (CRM)
-- 2026-09-28: tablas crm_* incorporadas a este archivo (antes en crm/db/schema.sql).
--   Diferencias con el schema del repo CRM Next.js, todas deliberadas:
--   1) sin CREATE DATABASE / USE (cPanel no los permite desde el editor SQL)
--   2) prefijo crm_ en las 8 tablas (base compartida con el calendario)
--   3) crm_automation_rules con PK en `key` en vez de un id autogenerado
--   4) + whatsapp_template_name / whatsapp_template_language en crm_templates
--   5) + crm_users, para la auth que el CRM no tenia
