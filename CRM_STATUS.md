# CRM en el backend de Reforma — estado y pendientes

Última actualización: **2026-10-19**. Lo nuevo de ese día está en el §10 (tick por HTTP y
corrección del hallazgo 1, **desplegado y verificado en producción**, sin commit). El resto del documento
describe el estado al **2026-09-29**, salvo donde se indica otra fecha.

**Para retomar (2026-10-20):** la lista ordenada de pendientes está en
`e-commetrics-dashboard/crm_validacion_2026-10-19.md`, sección "Para retomar mañana". Lo primero:
`GET /health` (`uptimeSeconds` de horas = el cron funcionó toda la noche), Last sync y Last error.

Documentos relacionados:

- `CRM_USUARIOS.md` — cómo crear, cambiar y quitar usuarios del CRM (login, contraseñas, SQL).
- `e-commetrics-dashboard/BACKLOG.md` — backlog del dashboard (frontend del CRM, migración a
  Vercel, seguridad de `dashboard.js`).

## 1. Estado actual (resumen)

| Pieza | Estado |
|---|---|
| Backend de Reforma con el CRM (`/crm`) | **En producción y sano** (verificado con `curl`, ver §3) |
| Tablas `crm_*` y seed | **Hechos** (6 etapas, 5 reglas, 6 plantillas) |
| Usuarios del CRM | `users: 1` en `/health`. Falta confirmar el segundo (ver §6) |
| Sincronización de leads de Facebook | Funcionando: 20 leads importados |
| Automatización de tareas | Bug de reglas corregido y desplegado. Comprobado el 2026-10-19: "Call within 1 hour" se crea sola con el lead; "Follow up again" **se recrea cada 5 min al completarla** (corregido, desplegado y verificado el 2026-10-19, ver §10) |
| Tick por HTTP (`POST /crm/cron/tick`) | **Desplegado y verificado el 2026-10-19.** Ver §10 |
| Efectos de creación de un lead a prueba de reinicios (`effects_fired_at`) | **Columna aplicada en producción el 2026-10-21; código desplegado según el usuario** (no verificable desde `/health`). Sin probar con un lead nuevo real. Ver §11 |
| Envío de correos desde el CRM | Validado el 2026-10-16 con Gmail (entrada) y plantilla desde un lead; SPF, DKIM y DMARC válidos. **Outlook/Hotmail sin probar** (ver §5) |
| WhatsApp | Con el **número de pruebas** de Meta; el real no está puesto (ver §5b) |
| SMS (Twilio) | **No configurado**: faltan credenciales, paquete `twilio` y registro A2P (ver §5b) |
| Frontend del CRM en el dashboard | Desplegado y en uso (2026-10-16); **sin commitear** |
| Backend del dashboard (`dashboard.js`) | Desde el 2026-10-16 `GET /api/users/:id/apps` incluye `"CRM"` en `allComponents` (aplicado en producción y en MySQL). Sin probar con un cliente real |
| Git | **Nada commiteado** (ver §8) |

Decisión de acceso (2026-09-29): **doble login**. El CRM mantiene su login propio
(`crm_users`), independiente del dashboard. Acceso solo para admins y un usuario concreto.
Razones y disparadores para reconsiderarlo: `CRM_USUARIOS.md` §8.

## 2. Qué se hizo el 2026-09-29

1. **Revisión de este archivo y de `dashboard.js`.** Se encontró que el documento contradecía
   su propio estado ("terminado" y a la vez "faltan tablas") y se levantaron los hallazgos de
   seguridad del backend del dashboard (§7).
2. **Verificación de `/health` en producción.** Sucesión observada:
   - Tablas `crm_*` ya creadas, pero sin seed y sin usuarios (`status: fail`).
   - Se aplicó el seed: `seeded.ok: true`.
   - Se creó un usuario: `status: ok`, `users: 1`.
3. **Decisión de login:** se evaluó login único (token firmado ES256 intercambiado entre el
   backend del dashboard y el CRM) frente a doble login, y se eligió doble login (§1).
4. **Usuarios del CRM.** Se generaron los `INSERT` de dos usuarios con contraseñas aleatorias de
   16 caracteres (las contraseñas no están en el repo). Guía completa en `CRM_USUARIOS.md`.
5. **Smoke test del calendario tras pasar a Node 22:** `GET /api/appointments` y
   `GET /fechas-bloqueadas` responden 200. `/crm/me` 200 y `/crm/leads` 401 sin sesión, como
   debe ser.
6. **Bug de automatizaciones (corregido).**
   - Síntoma: 0 tareas creadas aunque las reglas estaban activas y los leads entraron después
     del seed.
   - Causa: `crm/services/repo/rules.js` leía `row.triggerType`, pero la capa de base de datos
     ya convierte `trigger_type` en `trigger` (`db/connection.js`, `COLUMN_MAP`). Toda regla
     salía con `trigger: undefined` y ninguna coincidía con `new_lead`, `stage_change` ni
     `stale_contacted`.
   - Arreglo: `trigger: row.trigger`. Probado con una fila de ejemplo, regenerado
     `out/server.js` y **subido a producción** (arranque 2026-09-30 00:08 UTC).
   - Efecto colateral de la corrección: la pantalla de reglas del CRM ahora debe mostrar el
     disparador de cada regla.
7. **Leads importados y migración.** El cron importó los leads desde Facebook antes de decidir
   qué hacer con el `db.json` del CRM viejo. Conclusiones:
   - Hay **20 leads**, todos de Facebook, todos importados en un solo ciclo (22:45 UTC).
   - La copia local del CRM viejo (17-sep) tiene 18 leads (2 de prueba). Todos venían de
     Facebook, así que están entre los 20.
   - **Se decidió no migrar el `db.json`.** El script `migrate-db-json.js` deduplica solo por
     `id` y fallaría por `fb_leadgen_id` duplicado. Lo perdido era poco.
8. **Etapas restauradas a mano por SQL** (sin disparar CAPI ni reglas):
   - Narda Newkirk → `scheduled`.
   - Micheal Hagstrom → `scheduled`, con su nota ("Confirmed he wants the $60 deep cleaning
     promo. Prefers afternoon appointments.").
   - Más una actividad de sistema de "Etapa restaurada desde el CRM anterior" en ambos.
9. **Leads de prueba detectados:** `Kevin Okhuysen` y `<test lead: dummy data for full_name>`
   (`test@meta.com`), ambos del formulario "Qualifying form-copy". Aún no se han borrado (§6).
10. **Documentación:** `CRM_USUARIOS.md`, `BACKLOG.md` del dashboard y este archivo.
11. **Diagnóstico del modo estático del dashboard.** Se documentó en el backlog la migración a
    Vercel (frontend en Vercel; backend y bases de datos en cPanel).

## 3. Verificado en producción (2026-09-29, con `curl`)

| Endpoint | Resultado |
|---|---|
| `GET /health` | 200, `status: ok` |
| `GET /api/appointments` | 200 |
| `GET /fechas-bloqueadas` | 200 |
| `GET /crm/me` | 200 (`user: null` sin sesión) |
| `GET /crm/leads`, `GET /crm/rules` | 401 sin sesión |

`/health` reporta: base de datos `clinicareforma_contacts` (MariaDB 11.4), calendario OK, tablas
CRM OK, `jwtSecret` OK, cron activo, seed OK, integraciones configuradas (Facebook sync, CAPI,
email, WhatsApp), CAPI en modo real, SMS no configurado.

**Node de cPanel: 22.** El bundle no arranca en Node 14 (`??=`, sin `fetch` global, `node-cron`
4 pide Node 20+).

**Advertencia:** que una integración figure como configurada en `/health` solo significa que
sus variables están definidas, no que funcione.

## 4. Cómo está armado el backend

```
server/
├── server.src.js      ← FUENTE PRINCIPAL: el server original + montaje de /crm + /health + flags
├── crm/               ← módulo del CRM (rutas, servicios, repos, cron, auth). Solo fuente, NO se sube
├── schema.sql         ← tablas del calendario + 8 tablas crm_* (idempotente)
├── crm-seed.sql       ← seed para phpMyAdmin (6 etapas, 5 reglas, 6 plantillas). NO se sube
├── crm-user-sql.js    ← genera el INSERT de un usuario (se corre en tu máquina). NO se sube
├── package.json       ← "build": genera out/server.js
├── .env.example       ← variables, con placeholders
├── out/server.js      ← GENERADO (ignorado por git). ESTE es el que se sube
└── dashboard.js       ← backend de e-commetrics.com, solo de referencia (ver §7)
```

- **Se edita** `server.src.js` y/o `crm/`. **Nunca** `out/server.js`.
- **Se genera** con `cd server && bun run build`.
- **Se sube a cPanel** solo `out/server.js`, con el nombre **`server.js`**. `crm/` no se sube.
- Cambios respecto al server original: detección de flags `--crm-*`; `PATCH` en el CORS;
  ruta `GET /health`; montaje `app.use("/crm", ...)` al final; `app.listen` envuelto en
  `if (!crmCliMode)`. Las 14 rutas del calendario quedaron intactas.
- Auth del CRM: scrypt + JWT (7 días), cookie `httpOnly` y token también en el cuerpo del login
  (Bearer), comprobación de `Origin` en cada escritura. CORS: `e-commetrics.com` y
  `www.e-commetrics.com`.
- Variables de entorno: ver `.env.example`. **No** definir `CRM_SMTP_FROM` (salvo decisión
  explícita, ver §5) ni `CRM_FB_CAPI_TEST_EVENT_CODE` en producción.

## 5. Pendiente principal: validar el envío de correos y cómo llegan

**Estado real:** el CRM nunca ha enviado un correo. Las actividades de los leads solo muestran
`Lead created via facebook` y `CAPI event "New" sent`. Además, hoy nadie puede enviar desde la
pantalla porque el frontend no está subido.

### Cómo funciona el envío (leído del código, no probado)

- Usa el transporte del calendario (`server.src.js:69`): host `EMAIL_HOST`, puerto 465 seguro,
  usuario `EMAIL_USER`, contraseña `EMAIL_PASS`.
- **Remitente:** `CRM_SMTP_FROM` si existiera; si no, `EMAIL_USER`. La dirección real está en
  cPanel (no se puede ver desde el repo). El respaldo del código, si faltara la variable, es
  `mydentist@reformadental.com`.
- **Formato:** texto plano (`text`), sin HTML ni firma. Sin nombre visible en el remitente
  (el calendario sí manda `"Reforma Dental" <EMAIL_USER>`). Sin copia (`cc`).
- **Asunto:** el de la plantilla, o `Reforma Dental` si no lo tiene. **Variables:** solo
  `{{name}}` (si el lead no tiene nombre, usa `there`).
- **Registro:** cada envío deja una actividad en el lead: `message_sent`
  (`Sent "<plantilla>" via email`) o `message_failed` (con el error).
- Si el lead no tiene correo, devuelve `Lead has no email address` y lo registra como fallo.
- Las reglas automáticas de mensaje están **deshabilitadas** (`enabled = 0`): nada se envía solo.

### Qué falta comprobar

- [x] **Prueba interna hecha (2026-09-29):** con "Send a test message" (canal email) hacia
      `mydentist@reformadental.com` el correo **llegó** a esa bandeja, con el texto
      `This is a test message from the Reforma Dental CRM.` (asunto
      `Reforma Dental CRM - test message`). Confirma que el SMTP y las credenciales funcionan y
      que el remitente se ve como `mydentist@reformadental.com`, sin nombre visible. **Límite:**
      es una entrega dentro del mismo dominio y no prueba la entrega a proveedores externos.
      Esta herramienta no deja actividad en ningún lead.
- [ ] **Anotar dónde llegó** esa prueba (entrada o spam) y confirmar que el remitente real es
      `EMAIL_USER` (cPanel → Setup Node.js App → variables, o el registro de arranque
      `✓ Email configurado con host=... user=...`).
- [ ] **Prueba externa (la que falta):** repetir "Send a test message" hacia una cuenta de Gmail y
      otra de Outlook/Hotmail. Anotar si llegó a entrada o a spam.
- [ ] **Envío de plantilla a un lead** desde el CRM: elegir un lead con
      correo propio, enviar una plantilla de correo y comprobar que **(a)** la pantalla no
      muestre error, **(b)** exista la actividad `message_sent` en el lead, **(c)** el correo
      llegue.
- [ ] **Bandeja de entrada o spam.** Probar al menos con Gmail y con Outlook/Hotmail. Anotar en
      cuál llegó y en cuál cayó en spam.
- [ ] **Autenticación del dominio (SPF, DKIM y DMARC)** de `reformadental.com`. En cPanel:
      *Email Deliverability*; debe mostrar SPF y DKIM válidos. Sin ellos, el correo tiende a caer
      en spam o a ser rechazado. Revisar además los encabezados del correo recibido
      (`Authentication-Results`: `spf=pass`, `dkim=pass`, `dmarc=pass`).
- [ ] **Cómo se ve el remitente**: al recibirlo se verá solo la dirección, sin "Reforma Dental".
      Decidir si se define `CRM_SMTP_FROM="Reforma Dental <misma-direccion>"` (misma dirección y
      dominio que `EMAIL_USER`, o el relay puede rechazarlo). Es una variable nueva en cPanel, sin
      cambiar código.
- [ ] **Contenido:** revisar el texto de las 6 plantillas (`crm-seed.sql`, en inglés y español
      según el caso) antes de usarlas con pacientes reales; son texto plano.
- [ ] **Registro de lo enviado:** el envío por SMTP **no guarda copia en la carpeta "Enviados"**
      del buzón, y el CRM no manda copia a nadie. La única constancia es la actividad del lead. Si
      se quiere una copia, hay que añadir un `bcc` (cambio de código).
- [ ] **Respuestas de pacientes:** irán al buzón de `EMAIL_USER`. Confirmar que alguien lo revise.
- [ ] Tras validar el correo, decidir si se habilita `new_lead_confirmation_message` (hoy
      `enabled = 0`). Ojo: una vez activa, cada lead nuevo recibe un correo automático.

## 5b. WhatsApp y SMS (Twilio): pendientes de configurar

Ninguno de los dos está listo para pacientes reales.

### WhatsApp — con el número de pruebas de Meta (declarado 2026-09-29)

- `/health` marca `whatsapp: true`, pero solo significa que `CRM_WHATSAPP_ACCESS_TOKEN` y
  `CRM_WHATSAPP_PHONE_NUMBER_ID` están definidas. Hoy apuntan al **número de pruebas** de la API de
  WhatsApp Cloud. **El WhatsApp real de la clínica todavía no se ha puesto.**
- No hay evidencia de que un envío funcione: no se ha probado desde el CRM.
- Un número de pruebas de Meta suele estar limitado a un puñado de destinatarios previamente
  registrados y no sirve para escribir a pacientes. (Confirmar el límite exacto en el panel de Meta.)
- Para pasar a producción hace falta:
  - [ ] Registrar y verificar el **número real** de la clínica en WhatsApp Business (Meta).
  - [ ] Cambiar `CRM_WHATSAPP_PHONE_NUMBER_ID` al del número real.
  - [ ] Un **token permanente** (usuario del sistema), no uno temporal de 24 horas, y cambiar
        `CRM_WHATSAPP_ACCESS_TOKEN`.
  - [ ] **Plantillas aprobadas por Meta** para el primer contacto. Fuera de la ventana de 24 horas
        después del último mensaje del paciente, un texto libre **no llega**. El CRM usa la
        plantilla aprobada solo si la plantilla del CRM tiene `whatsapp_template_name`; la de
        `appointment-reminder` (WhatsApp) lo tiene vacío (`NULL`) en el seed, por lo que hoy
        iría como texto libre. Crear las plantillas en Meta, esperar la aprobación y anotar
        nombre e idioma en la plantilla del CRM (pantalla de plantillas de Settings).
  - [ ] Reiniciar la app tras cambiar las variables.
  - [ ] Probar con "Send a test message" (canal `whatsapp`) hacia un número propio.
  - [ ] Comprobar el registro de errores: los fallos aparecen como actividad `message_failed`.

### SMS con Twilio — no configurado

- `/health` marca `sms: false`. Faltan tres cosas:
  - [ ] Variables `CRM_TWILIO_ACCOUNT_SID`, `CRM_TWILIO_AUTH_TOKEN` y
        `CRM_TWILIO_FROM_SMS_NUMBER`: dependen de que el dueño de la cuenta de Twilio entregue
        las credenciales.
  - [ ] **Paquete `twilio`:** no está en `package.json`. Añadirlo y ejecutar "Run NPM Install" en
        cPanel (no hay terminal). Sin él, el SMS queda desactivado aunque estén las variables.
  - [ ] **Registro A2P 10DLC** de Twilio, si se va a enviar SMS a números de EE. UU. Para números
        mexicanos aplican otras reglas: confirmarlo con Twilio.
- [ ] Probar con "Send a test message" (canal `sms`) hacia un número propio.

### Reglas relacionadas

- `scheduled_reminder_message` (SMS, al pasar a `scheduled`) y `new_lead_confirmation_message`
  (email) están **deshabilitadas**. No activarlas hasta validar su canal.
- Con la regla de recordatorio en SMS, si Twilio no está configurado el envío fallaría y quedaría
  registrado como `message_failed`.

## 6. Otros pendientes

1. **Segundo usuario del CRM.** `users: 1` en `/health`. Confirmar cuál de los dos usuarios
   (`admin@dashboard.com`, `mydentist@reformadental.com`) se pegó y crear el otro (`CRM_USUARIOS.md`).
2. **Leads de prueba.** Borrar `Kevin Okhuysen` (`id 96a434b8-d4c9-42df-8a2c-ef0abdd519ae`,
   Facebook `1609732670809992`) y decidir sobre `test@meta.com` (`1565768038471995`). Regla:
   Facebook sigue devolviendo los leads, así que hay que **borrarlos primero en Facebook** y
   luego del CRM; si no, reaparecen en el siguiente ciclo (5 min). Alternativa: pasarlos a
   `lost`. **No borrar el de Kevin antes de la prueba de correo** si su correo es tuyo (§5).
   Comprobar después con `SELECT COUNT(*) FROM crm_leads;` (debe bajar de 20).
3. **Automatizaciones, prueba real.** *(Actualizado 2026-10-19.)* "Call within 1 hour" se creó sola
   un segundo después de entrar un lead de Facebook. "Follow up again" se creó a las 48 h, pero al
   completarla **reapareció en el siguiente tick**: la regla mide `updated_at`, que solo cambiaba con
   la etapa o las notas. Corregido en local (§10). Faltan por reportar el disparador y el estado de
   tres de las cinco reglas. Los 20 leads de la importación inicial **no** tienen tareas (llegaron
   antes de la corrección y no se crean retroactivamente).
4. **Cuenta de leads.** El CRM viejo muestra 17 y el nuevo tiene 20. Se esperaba 18 tras quitar
   los dos de prueba. Falta identificar el desfase (consulta con `NOT IN` de los ids del `db.json`).
5. **Paginación de Facebook.** `facebook/sync.js` no sigue la paginación de la API: solo la
   primera página de cada formulario (~25). Con más leads que eso, los antiguos no se importarían.
   Comprobar el total contra Facebook.
6. **Eventos CAPI.** Los 20 leads importados enviaron un evento `New` a Meta (modo real, no de
   prueba), incluidos los de prueba. Revisar en Events Manager que no distorsione la atribución.
7. **Frontend del dashboard.** Build y subida de `out/` a `public_html`, con `GET /health` en 200.
   Probar de punta a punta (dashboard → CRM → login → pipeline → crear y editar un lead → enviar
   plantilla → "Sync now") y revisar errores de CORS en la consola.
8. **`"CRM"` en `allComponents`** de `GET /api/users/:id/apps` (backend del dashboard), solo si
   un usuario **no admin** debe ver el CRM. Los admin ven todo en el sidebar sin ese cambio.
   Confirmar antes que el `dashboard.js` local coincide con el de producción.
9. **Retirar el CRM viejo de Next.js**, al final, cuando el nuevo esté verificado. Mientras siga
   activo sincroniza Facebook en paralelo. Antes de apagarlo, comprobar si hubo cambios de etapa o
   notas después del 17-sep (la copia local más reciente): la base viva del CRM viejo no está ubicada.
10. **Migración del frontend a Vercel:** siguiente feature tras el CRM (`e-commetrics-dashboard/BACKLOG.md`).

## 7. Hallazgos sobre `dashboard.js` (backend de e-commetrics.com)

Este archivo es solo de referencia aquí; el servidor de Reforma no lo carga. Lo siguiente sale de
leer el código y **no se probó contra el servidor**: confirmarlo antes de actuar.

- **El permiso `"CRM"` no llega a usuarios no admin:** `GET /api/users/:id/apps` devuelve una lista
  fija (`QR, Vcard, blogs, calendar, Reforma, Monge, PromoPalmas, CalendarioPalmas`) sin `CRM`.
- **`JWT_SECRET` escrito en el código** (`"mi-clave-super-secreta"`): quien lo conozca puede
  fabricar un token con `role: "admin"`.
- **`PUT /api/users/:id` sin autenticación y acepta `password`:** cualquiera puede cambiar la
  contraseña de cualquier usuario, admin incluido. Es el más grave.
- **`GET /api/users` sin auth y con `SELECT *`:** expone los hashes de contraseña.
- **`POST /api/register`, `DELETE /api/users/:id`, `POST /api/users/:id/apps` y
  `PUT /api/update-profile` sin auth.** `PUT /api/change-password` toma el `id` del cuerpo.
  Solo `/api/profile` verifica el token.
- Contraseña SMTP de facturación escrita en el código.
- `/api/register` envía la contraseña en texto plano por correo.
- `process.exit(1)` si la base falla al arrancar.
- Orden de arreglo propuesto: secreto a variable de entorno → middleware de auth en listado y
  escritura → `"CRM"` en la lista.

Con el doble login, estos fallos **no** dan acceso a los leads del CRM, pero siguen afectando al
dashboard y a sus clientes. Conviene resolverlos pronto (punto 3 del backlog del dashboard).

## 8. Git — estado y cuidados

Rama `feature/crm-module`, sin commitear:

- modificados: `crm/*` (incluye el arreglo de `repo/rules.js`), `schema.sql`, `package.json`,
  `.env.example`, `.gitignore`
- renombrado: `server.js` → `server.src.js`
- nuevos: `crm/cli.js`, `crm/health.js`, `crm-seed.sql`, `crm-user-sql.js`, `CRM_STATUS.md`,
  `CRM_USUARIOS.md`
- eliminado: `crm/db/schema.sql`

**No usar `git add .`:**

- `server/dashboard.js` está sin trackear y **sin ignorar**, y contiene el secreto fijo y una
  contraseña SMTP. Sacarlo del repo o agregarlo a `.gitignore` antes de commitear.
- `server/backup.js` también está sin trackear y no lo creó este trabajo: revisar qué es.
- `CRM_USUARIOS.md` lleva los hashes de los dos usuarios iniciales. Aceptable en un repo
  **privado**; borrar su sección 4 si el repo fuese público.

Dashboard (`e-commetrics-dashboard`, rama `main`), sin commitear: `access-app/page.tsx`,
`app-sidebar.tsx`, `webapp/crm/` y `BACKLOG.md`.

## 9. Verificar después de cada deploy

```
curl -i https://reformadental.com/health
curl -i https://reformadental.com/api/appointments
curl -i https://reformadental.com/fechas-bloqueadas
```

Un 503 en `/health` trae la causa exacta en `failures`. Los `warnings` (Facebook o email sin
configurar, modo prueba de CAPI) no hacen fallar el health.

## 10. Tick por HTTP y Cron Jobs de cPanel (2026-10-19)

**Estado: desplegado y verificado el 2026-10-19, sin commit.** Detalle del análisis y las alternativas en
`e-commetrics-dashboard/crm_validacion_2026-10-19.md`.

### Por qué

El sync de Facebook y las reglas corren con `node-cron` **dentro del proceso** de la app. Al revisar
Settings el 2026-10-19, **Last sync** se había quedado en las 7:00 y **Last token check** marcaba las
10:05, hora de un arranque del proceso: la app no estaba corriendo entre medias. La causa no está
confirmada (inactividad, límite de recursos, reinicio o syncs fallando); **Last error** en Settings
ayuda a distinguirla. Mientras tanto, los leads de Facebook y las reglas por tiempo solo avanzan si
alguien despierta la app.

### Qué se agregó

| Archivo | Cambio |
|---|---|
| `crm/services/tick.js` (nuevo) | `runTick()`: sync de Facebook y luego reglas. Candado en memoria (no corren dos a la vez; libera solo tras 10 min; omite un tick a menos de 1 min del anterior). `getLastTick()` para `/health` |
| `crm/routes/cron.js` (nuevo) | `POST /crm/cron/tick`, protegido con `X-Cron-Token`. Montado antes de `requireAuth` |
| `crm/scheduler.js` | El cron interno llama a `runTick()` y comparte el candado |
| `crm/index.js` | Monta la ruta nueva |
| `crm/health.js` | Muestra `crm.cronEndpoint` y `crm.lastTick`; avisa si no hay ticks en 15 min |
| `crm/services/repo/leads.js` | `touchLead()`: actualiza `updated_at` |
| `crm/services/repo/tasks.js` | `completeTask` toca el lead la primera vez que se completa |
| `crm/services/messaging/index.js` | Un envío exitoso toca el lead |
| `.env.example` | Documenta `CRM_CRON_TOKEN` |

Sin cambios de SQL, de frontend ni de dependencias.

### Variable `CRM_CRON_TOKEN`

- Opcional. Sin ella, o con menos de 32 caracteres, la ruta queda apagada (503).
- Se genera en la PC con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
  **Nunca** en el repo ni en el chat. Ya está cargada en cPanel (2026-10-19).
- Para revocarla: cambiar la variable, actualizar la línea de cron y reiniciar la app.
- Solo permite disparar el sync y las reglas; no lee ni modifica leads.

### Respuestas de la ruta

| Código | Significado |
|---|---|
| 200 | El tick corrió; el cuerpo trae el resumen (puede traer `ok: false` si falló el sync) |
| 202 | Ya había un tick en curso, hubo uno hace menos de 1 min, o tarda más de 45 s (sigue en segundo plano) |
| 401 | Token ausente o incorrecto |
| 503 | Ruta apagada (falta `CRM_CRON_TOKEN`) |

Un fallo de Facebook no devuelve error HTTP, a propósito: así el cron de cPanel no manda un correo
cada 5 minutos mientras dure. El fallo se ve en Settings (**Last error**).

### Despliegue

1. `cd server && bun run build` (hecho el 2026-10-19).
2. Subir `out/server.js` como `server.js` y reiniciar la app.
3. `GET /health`: debe decir `crm.cronEndpoint: true`.
4. Probar desde la PC con `POST /crm/cron/tick` y la cabecera `X-Cron-Token`. La primera llamada
   debe traer el resumen y mover **Last sync**; repetida en menos de 1 min, `skipped`.
5. En cPanel → Cron Jobs, cada 5 minutos (`*/5 * * * *`):

   ```
   curl -fsS --max-time 90 --retry 2 -X POST -H "X-Cron-Token: <token>" https://reformadental.com/crm/cron/tick >/dev/null
   ```

6. Dejar 20 minutos sin usar el CRM y comprobar que **Last sync** avanza solo.

### Reversión

Borrar la línea de Cron Jobs y quitar `CRM_CRON_TOKEN`. El CRM vuelve a funcionar como antes.

### Hallazgos 1 y 2 (corregidos y desplegados)

Completar una tarea y enviar un mensaje ahora actualizan `updated_at` del lead. Eso corrige el
hallazgo 1 (la tarea se recreaba) y el 2 ("sin actividad" no contaba mensajes ni tareas) del
documento `crm_validacion_2026-10-16.md`. El hallazgo 3 (un `send_message` programado se repetiría
cada tick) queda mitigado solo para envíos exitosos. "Follow up again"
volverá a aparecer tras 48 h sin actividad real, no cada 5 minutos. Efecto visible: `updatedAt`
(también en el CSV exportado) refleja tareas y mensajes, no solo etapa y notas. No retroalimenta a
los leads existentes.

### Verificado en producción (2026-10-19)

- `POST /crm/cron/tick` desde la PC: `ok`, 1.2 s, 20 leads traídos y 0 duplicados.
- `/health` muestra `cronEndpoint: true` y `lastTick`.
- Cron Jobs de cPanel cada 5 minutos con `curl`: llega al endpoint (`202 skipped` cuando el cron
  interno acaba de correr). El hosting usa **Passenger** (cabecera `x-powered-by`).
- Con el cron llamando, la app estuvo 22.6 minutos sin detenerse (antes moría en pocos minutos).
- Hallazgo 1: completar "Follow up again" ya no la recrea en el siguiente tick.
- **No poner `%` sin escapar en el comando de Cron Jobs**: en crontab corta el comando, y la primera
  versión no se ejecutó por eso.
- **Sin probar:** `touchLead` al enviar un mensaje desde un lead, y qué pasa con la regla dentro de 48 h.

### Sigue sin resolver

Paginación del sync de Facebook, límite de envíos, roles, revocación de tokens, `trust proxy` y la
seguridad de las rutas sin autenticación del calendario y del backend del dashboard (hallazgos 4 al
8 del documento del 2026-10-16).

## 11. Efectos de creación a prueba de reinicios (2026-10-21)

### Por qué
Namecheap confirmó (tickets NC-OHM-0983 y NC-HDA-9950) que Apache en Shared termina la app por
diseño y no se puede evitar. `createLead` insertaba el lead y **después** disparaba CAPI y la tarea
"Call within 1 hour" (y el correo `new-lead-confirmation` solo si su regla está habilitada; en el seed no
lo está). Si el proceso moría en ese intervalo, el
siguiente sync veía el lead como existente y esos efectos **se perdían para siempre**.

### Qué se hizo
- **MySQL de producción (hecho a mano en phpMyAdmin, 2026-10-21):**
  `ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS effects_fired_at DATETIME(3) NULL AFTER updated_at;`
  y `UPDATE crm_leads SET effects_fired_at = created_at WHERE effects_fired_at IS NULL;`.
  Verificado: la columna existe, **21 leads** y **0 pendientes**. El `UPDATE` es obligatorio: sin él
  los leads existentes se reprocesarían (CAPI real incluido).
- **Código (`server/`):** `crm/services/repo/leads.js` (`markEffectsFired`, `listLeadsPendingEffects`),
  `crm/services/leads.js` (`createLead` marca al terminar; `recoverPendingLeadEffects` reprocesa **una
  sola vez** a los leads sin marca con más de 2 min, y marca aunque falle), `crm/services/tick.js`
  (llama la recuperación en cada tick; un fallo aparece en `automation.error`) y `schema.sql`.
- **Estado del despliegue:** `out/server.js` se construyó el 2026-10-21 ~13:07 (hora local) y contiene
  el código nuevo; el usuario indica que se subió y reinició. `/health` no expone versión, así que no se
  puede confirmar desde fuera. Tras el arranque de las 20:07:56 UTC, el tick corrió solo a las 20:10:02
  UTC (`ok`, 2.8 s).

### Límites
- Solo cubre los efectos de **creación**; los de un cambio de etapa no se recuperan.
- El reintento es de **una** vez por lead: si falla, queda marcado y no se repite.
- **No probado contra MySQL real con un lead nuevo.** Verificado solo con dobles y la carga de módulos.
- `server/crm/services/tick.js` aparece sin trackear en git, y hay más cambios previos sin commit en la
  rama (ver §8): commitear por archivo, sin `git add .`.
- No cubre el calendario de citas (comparte el proceso) ni peticiones HTTP cortadas a medias.

### Reversión
Revertir el código a la versión anterior y reiniciar. La columna puede quedarse (acepta NULL y el código
viejo la ignora); para quitarla: `ALTER TABLE crm_leads DROP COLUMN effects_fired_at;`.

### Cómo comprobarlo
En un lead **nuevo real**, la actividad debe mostrar "Lead created", el evento CAPI y el correo, y la
columna `effects_fired_at` debe quedar con fecha pocos segundos después de `created_at`. Si aparece
"Creation effects re-run after an interrupted run", un reinicio cortó la creación y la recuperación
funcionó.

## 12. Aviso de lead nuevo por correo (2026-10-28)

### Por qué
La tarea "Call within 1 hour" solo se ve si alguien abre el CRM. El aviso manda un correo al equipo en
cuanto entra un lead, para que la llamada ocurra dentro de la hora.

### Qué se hizo
- **MySQL de producción (hecho a mano en phpMyAdmin, 2026-10-28):**
  `ALTER TABLE crm_sync_state ADD COLUMN IF NOT EXISTS notify_emails TEXT NULL AFTER token_check_error;`
  Los correos viven en la fila única de `crm_sync_state`, separados por coma. NULL = sin aviso.
- **Código (`server/`):**
  - `crm/services/automation.js`: `notifyNewLead()`, llamado desde `fireStageChangeSideEffects` en la
    creación (`oldStage === null`). Manda nombre, teléfono, correo, campaña y formulario con el
    `sendEmail()` existente. **Solo para `source === "facebook"`**: los manuales y de CSV no avisan
    (un CSV de 100 filas serían 100 correos). Un fallo queda en el log y no frena la creación del lead.
  - `crm/routes/settings.js`: `PATCH /crm/settings/notify` (detrás de `requireAuth`). Valida el formato
    de cada correo, máximo 10, y guarda la lista normalizada; vacío = NULL.
  - `crm/services/repo/syncState.js` y `crm/types.js`: leen y escriben `notifyEmails`.
  - `crm/db/connection.js`: `notify_emails` agregado a `COLUMN_MAP`. **Sin esta línea la lectura
    devuelve siempre `null`** (la escritura sí funciona). Fue el bug del primer despliegue.
  - `schema.sql`: la columna, para bases nuevas.
- **Frontend (`e-commetrics-dashboard`, rama `compliance`):** sección "New lead notifications" en
  `webapp/crm/screens/SettingsScreen.tsx`: lista de correos con Add y Remove, cada cambio se guarda al
  momento. Más `apiSaveNotifyEmails` en `lib/api.ts` y `notifyEmails` en `lib/types.ts`.
- **Estado del despliegue:** `out/server.js` construido el 2026-10-28 11:34 (hora local), subido como
  `server.js` y reiniciado. Verificado en producción: `GET /crm/settings` devuelve
  `notifyEmails = "kevin@e-commetrics.com"` y Settings muestra la lista.

### Límites
- **Falta ver llegar el aviso con un lead real de Meta.** Probado solo con dobles (base y SMTP simulados)
  y la lectura en producción.
- Si el proceso muere después de mandar el aviso y antes de `markEffectsFired`, la recuperación de §11
  lo manda otra vez (el mismo riesgo que CAPI).
- Un correo por lead, sin agrupar. Texto en inglés, como el resto del CRM.

### Reversión
Revertir el código y reiniciar. La columna puede quedarse (el código viejo la ignora); para quitarla:
`ALTER TABLE crm_sync_state DROP COLUMN notify_emails;`. Para solo apagar el aviso: quitar todos los
correos en Settings.

### Cómo comprobarlo
Con un lead **nuevo real** de Facebook debe llegar "New lead: <nombre>" a los correos de Settings en
hasta 5 min (lo que tarda el sync). Si no llega: spam, y luego el log de la app en cPanel buscando
`[crm/automation] aviso de lead`.

## 13. Citas del sitio en el CRM y CAPI solo para Facebook (2026-10-28)

### Por qué
El calendario de reformadental.com es público y es la otra entrada de pacientes, aparte de Meta. De 4
citas (2026-10-28), solo 1 coincidía con un lead del CRM. Además, los leads manuales y de CSV mandaban
"New" a Meta sin venir de un anuncio, lo que ensucia la optimización de campañas.

### Qué se hizo
- **Sin cambios en la base.** El CRM solo lee `citas`; el calendario sigue siendo el único que escribe.
- **Código (`server/crm/`):**
  - `services/repo/appointments.js`: lee `citas` con fecha y hora formateadas en SQL
    (`DATE_FORMAT`/`TIME_FORMAT`) para que no se corran de día por la zona horaria.
  - `services/appointments.js`: cruza cada cita con los leads **en JS** (`citas` es `utf8mb4_general_ci`
    y `crm_leads` es `utf8mb4_unicode_ci`: un `JOIN` falla con "Illegal mix of collations"). Coincide
    por los últimos 10 dígitos del teléfono y, si no hay, por correo sin mayúsculas ni espacios.
    `addAppointmentToCrm` vuelve a buscar antes de crear (un doble clic no duplica) y crea el lead con
    `source: "manual"`, `formName: "Website booking"` y los datos de la cita en `fieldDataRaw`.
  - `routes/appointments.js`: `GET /crm/appointments` y `POST /crm/appointments/:id/lead` (201 si lo
    creó, 200 si ya existía, 404 o 400). Montadas en `index.js` detrás de `requireAuth`.
  - `services/automation.js`: `fireStageChangeSideEffects` solo llama `sendCapiEvent` si
    `lead.source === "facebook"`. Las reglas siguen corriendo para todos los orígenes. La prueba de CAPI
    de Settings (`routes/tools.js`) no cambia: manda el evento con cualquier lead porque se pide a mano.
- **Frontend (`e-commetrics-dashboard`, rama `compliance`):** pestañas **CRM** y **Web** en
  `webapp/crm/screens/PipelineScreen.tsx` (el tablero pasó a llamarse `LeadBoard`), la tabla en
  `components/WebBookings.tsx`, más `lib/api.ts` y `lib/types.ts`.
- **Estado del despliegue:** el `out/server.js` de las 12:50 (pestaña Web) se subió y la pestaña se ve en
  producción. **El de las 13:03 (filtro de CAPI) falta subirlo.**

### Límites
- Probado con dobles (cruce, duplicados, rutas) y con conteos en phpMyAdmin; la consulta de
  `repo/appointments.js` no se probó en local contra MySQL real, solo a través del despliegue.
- El cruce carga todos los leads en memoria: bien con cientos, con miles conviene una columna de teléfono
  normalizado con índice.
- La pestaña no avisa de citas nuevas y no mueve leads a Scheduled solos.
- **`GET /api/appointments`, `PUT` y `DELETE /api/appointments/:id` del calendario siguen sin
  autenticación** (leído en `server.src.js`). No se tocaron.

### Reversión
Revertir el código y reiniciar; no hay columnas que quitar. Para devolver CAPI a todos los orígenes,
quitar el `if (lead.source === "facebook")` de `fireStageChangeSideEffects`.

### Cómo comprobarlo
- Pipeline → Web debe mostrar las citas con "In CRM" o "Add to CRM".
- Tras "Add to CRM", la actividad del lead nuevo debe tener "Lead created" y la tarea, y **no** "CAPI event
  New sent".
- Un lead de Facebook nuevo sigue mandando su evento CAPI.

## 14. Archivar y restaurar leads (2026-10-28)

### Por qué
No había forma de quitar un lead. Borrar la fila no sirve para los de Facebook: el sync los vuelve a crear
y manda otro "New" real a Meta. Con la pestaña Web (§13), una cita falsa agregada con "Add to CRM" tampoco
tenía salida. Además había 3 leads de prueba ensuciando el Dashboard.

### Qué se hizo
- **MySQL de producción (hecho a mano en phpMyAdmin, 2026-10-28):**
  `ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS archived_at DATETIME(3) NULL AFTER effects_fired_at;`
  NULL = activo.
- **Código (`server/`):**
  - `crm/services/repo/leads.js`: `archived_at` en `COLUMNS` (lo leen **todas** las consultas de leads),
    `archivedAt` en el lead, `listLeads({ includeArchived })` que **por defecto omite los archivados** y
    `setLeadArchived(id, archived)`. `listLeads` cambió de firma: `(options, tx)` en vez de `(tx)`.
  - `crm/routes/leads.js`: `POST /crm/leads/:id/archive` y `/restore` (registran actividad `system`;
    repetir la acción no escribe nada) y `GET /crm/leads?includeArchived=1`.
  - `crm/services/repo/tasks.js`: la lista general (`listTasks()` sin lead: panel y dashboard) hace
    `JOIN crm_leads` y omite las tareas de leads archivados. Por lead, todas.
  - `crm/services/appointments.js`: el cruce con citas usa `includeArchived: true` y devuelve
    `leadArchived`, para que "Add to CRM" no duplique.
  - `crm/db/connection.js`: `archived_at` en `COLUMN_MAP`. `crm/types.js` y `schema.sql`: documentado.
  - Sin cambios, quedan cubiertos por `listLeads`: `routes/dashboard.js` (totales), el CSV de
    `routes/leads.js` y el tick de `stale_contacted` en `services/automation.js`.
  - **El sync no se tocó:** `getLeadByFbLeadgenId` encuentra los archivados, así que no los recrea.
- **Frontend (`e-commetrics-dashboard`, rama `compliance`):** Archive / Restore en
  `webapp/crm/screens/LeadDetailScreen.tsx`, "Show archived" en `screens/PipelineScreen.tsx`, estilo
  atenuado en `components/LeadCard.tsx`, "In CRM (archived)" en `components/WebBookings.tsx`, más
  `lib/api.ts` y `lib/types.ts`.
- **Estado del despliegue:** `out/server.js` construido el 2026-10-28 16:12, subido y reiniciado, y frontend
  subido. **Verificado en producción:** los 3 leads de prueba se archivaron y siguieron archivados tras
  "Sync now".

### Límites
- **Orden de despliegue obligatorio:** el `ALTER` antes del backend. Sin la columna, todas las lecturas de
  leads fallan y se cae el CRM entero.
- La actividad registra cuándo, no quién (hoy hay un solo usuario).
- El CSV siempre omite los archivados.
- Cambiar la etapa de un lead archivado no está bloqueado (y sí dispara CAPI si es de Facebook); la
  interfaz solo lo permite desde la ficha.
- Probado con dobles (SQL capturado, rutas, idempotencia) y en producción con los leads de prueba.

### Reversión
Revertir el código y reiniciar. La columna puede quedarse (el código viejo la ignora y vuelve a mostrar a
los archivados); para quitarla: `ALTER TABLE crm_leads DROP COLUMN archived_at;`. Para restaurar a mano:
`UPDATE crm_leads SET archived_at = NULL WHERE id = '<id>';`.

### Cómo comprobarlo
Archivar un lead: desaparece del Pipeline y sus tareas del panel; con "Show archived" aparece una sola vez,
atenuado. Tras "Sync now", un lead de Facebook archivado no se duplica:
`SELECT COUNT(*) FROM crm_leads WHERE fb_leadgen_id = '<id de Facebook>';` debe dar 1.

## 15. Tareas manuales (2026-10-28)

### Por qué
Las tareas solo las creaban las reglas automáticas; no había `POST /tasks`. El equipo no tenía dónde
agendar sus propios pendientes con fecha.

### Qué se hizo
- **Sin cambios en la base.** `crm_tasks` ya tenía todo.
- **Código (`server/crm/routes/dashboard.js`):** `POST /crm/tasks` con `{ leadId, description, dueAt }`,
  montada detrás de `requireAuth` y `sameOrigin` como el resto del router. Valida `leadId`, descripción no
  vacía (recortada) y de máximo 500 caracteres, y `dueAt` como fecha (`Date.parse`); 404 si el lead no
  existe. Reutiliza `createTask()` de `services/repo/tasks.js` (el mismo de las reglas), registra
  `system` "Task added: …" y llama `touchLead`. Responde 201 con la tarea. Se quitó el comentario que decía
  que el endpoint no existía a propósito.
- **Frontend (`e-commetrics-dashboard`, rama `compliance`):** `AddTaskForm` en
  `webapp/crm/screens/LeadDetailScreen.tsx` (descripción + `datetime-local`, mañana a las 10 por defecto;
  la hora local se manda en ISO/UTC) y `apiCreateTask` en `lib/api.ts`.
- **Estado del despliegue:** `out/server.js` construido el 2026-10-28 16:56, subido y reiniciado, y frontend
  subido. **Probado en producción** con un lead de prueba restaurado temporalmente.

### Límites
- Solo crear: no hay editar ni borrar tareas.
- `touchLead` reinicia el contador de 48 h de `stale_contacted`.
- No registra quién creó la tarea (hoy hay un solo usuario).
- No valida que la fecha sea futura: se puede crear una tarea ya vencida (a veces es útil para anotar algo
  atrasado).
- Probado con dobles (validaciones, que no cree nada con datos inválidos, actividad y `touchLead`) y en
  producción.

### Reversión
Revertir el código y reiniciar. Las tareas manuales ya creadas se quedan en `crm_tasks` y se ven igual que
las automáticas.

### Cómo comprobarlo
En la ficha de un lead, "Add task" debe agregarla a la lista con la hora elegida, al panel de tareas y a la
actividad ("Task added: …"); al vencer, se marca en rojo como Overdue.
