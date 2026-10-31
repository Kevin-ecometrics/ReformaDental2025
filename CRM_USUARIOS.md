# CRM — guía de usuarios y accesos

Última actualización: **2026-09-29**. **Desde el 2026-10-30 los usuarios se crean y administran en Settings › Team del CRM; lo de SQL queda como respaldo** (ver `CRM_STATUS.md` §16).

El CRM tiene **login propio**, independiente del login del dashboard (decisión de
2026-09-29, ver "Por qué doble login"). Los usuarios viven en la tabla `crm_users` de la
base `clinicareforma_contacts`.

## 1. Quién tiene acceso

Solo los admin y un usuario concreto del dashboard. Hay dos capas:

| Capa | Qué controla | Dónde se gestiona |
|---|---|---|
| Permiso `CRM` del dashboard (`users_apps`) | Quién **ve la entrada** del CRM en el sidebar | Panel de permisos del dashboard. Admin ve todo. |
| Fila en `crm_users` | Quién **puede iniciar sesión** en el CRM | phpMyAdmin (esta guía) |

La segunda es la barrera real. Ocultar la entrada del sidebar es comodidad, no seguridad:
sin fila en `crm_users` nadie entra al CRM, aunque conozca la URL.

Para que un usuario no admin vea la entrada hay que agregar `"CRM"` a `allComponents` en
`GET /api/users/:id/apps` del backend del dashboard y marcarle el permiso.

## 2. Cómo funciona la contraseña

- En la base **no se guarda la contraseña**, sino un hash (`scrypt$16384$8$1$sal$hash`).
  Es de una sola vía: de él no se puede sacar la contraseña, y por eso es seguro tenerlo en
  la base.
- Al iniciar sesión, el CRM calcula el hash de lo que se escribe y lo compara.
- Contraseña: **12 caracteres o más**. Recomendado: aleatoria, guardada en un gestor de
  contraseñas.
- Las contraseñas **nunca** se escriben en este archivo, ni en el repo, ni en el chat.

## 3. Crear un usuario

1. En tu máquina, desde `server/`, genera una contraseña aleatoria:

   ```
   node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"
   ```

   Guárdala en el gestor de contraseñas.
2. Genera el `INSERT` (la contraseña no sale de tu máquina):

   ```
   node crm-user-sql.js <correo> "<nombre>" "<contraseña>"
   ```
3. Pega el `INSERT` que imprime en phpMyAdmin: base `clinicareforma_contacts`, pestaña SQL.
4. Comprueba `https://reformadental.com/health`: `crm.users` debe subir en 1.

No hay que modificar código ni hacer deploy: es solo una fila en la base.
Todos los usuarios se crean con `role: admin`; el script no admite otro rol.

### Los mismos pasos en PowerShell (Windows)

Desde la raíz del proyecto (`ReformaDental2025`):

```powershell
# 1. Contraseña aleatoria de 16 caracteres (cópiala al gestor de contraseñas)
node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"

# 2. Generar el INSERT (sustituye correo, nombre y contraseña)
cd server
node crm-user-sql.js "correo@ejemplo.com" "Nombre" "contraseña-de-12-o-mas"
cd ..
```

Copia la línea `INSERT INTO crm_users ...` que imprime y pégala en phpMyAdmin.
Si la contraseña lleva `$`, `` ` `` o `"`, PowerShell la interpreta: enciérrala entre comillas
simples (`'...'`). Con la generada por el comando del paso 1 no hay problema.

### Leer las contraseñas de los usuarios iniciales (2026-09-29)

Las contraseñas de los dos usuarios iniciales se generaron en un archivo temporal, no en el
repo. Para verlas:

```powershell
Get-Content "C:\Users\kevin\AppData\Local\Temp\claude\C--Users-kevin-e-commetrics-ReformaDental2025\ef910c37-d97d-4961-86da-ea93287cb2d9\scratchpad\crm-passwords.txt"
```

Cada línea trae el correo y su contraseña. Cópialas al gestor de contraseñas y borra el
archivo:

```powershell
Remove-Item "C:\Users\kevin\AppData\Local\Temp\claude\C--Users-kevin-e-commetrics-ReformaDental2025\ef910c37-d97d-4961-86da-ea93287cb2d9\scratchpad\crm-passwords.txt"
```

Es una carpeta temporal: si ya no existe el archivo, no hay forma de recuperarlas; genera
contraseñas nuevas (§5).

Un `INSERT` repetido falla por `email` duplicado. Es lo esperado y no rompe nada.

## 4. Usuarios iniciales (2026-09-29)

Los `INSERT` de los dos usuarios iniciales. Llevan el **hash**, no la contraseña. Las
contraseñas se generaron aleatorias y están en el gestor de contraseñas, no en el repo.

```sql
INSERT INTO crm_users (id, email, name, password_hash, role, created_at, last_login_at) VALUES ('80f840cb-1346-48c3-b6b2-395adee6910e', 'admin@dashboard.com', 'Admin', 'scrypt$16384$8$1$82e6188891c4dbc59cf23a3e7a1e3b3f$babd217215485cdf3dd374e36daebaa45cdb9e9466872f16dfba149767ad857ec7c64ca598578472871a87a931cb57e7b25ef4565d076eeca291bc120224484d', 'admin', UTC_TIMESTAMP(3), NULL);
INSERT INTO crm_users (id, email, name, password_hash, role, created_at, last_login_at) VALUES ('531457be-28b8-47e1-baa4-42814419b499', 'mydentist@reformadental.com', 'Reforma Dental', 'scrypt$16384$8$1$650b8bfc40c7224e9124f8c6dc523ff4$4354ab195043fbb7c75dee5b07dfbafa91fdd6ff20fc14e927f7c4cf2f8ddf4f42821fd39ad9de6db013c294065da69f6d2f58fe10d072a0e3b122a7e7a9d7ed', 'admin', UTC_TIMESTAMP(3), NULL);
```

Para saber cuáles existen ya en la base:

```sql
SELECT email, name, role, created_at, last_login_at FROM crm_users;
```

## 5. Cambiar o recuperar una contraseña

No se puede recuperar; se reemplaza.

1. Genera el hash nuevo:

   ```
   node crm-user-sql.js <correo> "<nombre>" "<contraseña nueva>"
   ```
2. Del `INSERT` que imprime, copia solo el valor `scrypt$...` y ejecuta:

   ```sql
   UPDATE crm_users SET password_hash = 'scrypt$...' WHERE email = '<correo>';
   ```

Sin deploy. Las sesiones ya abiertas siguen válidas hasta que caducan (ver §6).

## 6. Quitar un acceso

```sql
DELETE FROM crm_users WHERE email = '<correo>';
```

Quitar el permiso `CRM` en el dashboard oculta la entrada, pero **no** cierra el acceso:
hay que borrar también la fila. Si alguien deja el equipo, se hacen las dos cosas.

La sesión dura **7 días** y sigue válida aunque se borre la fila. Para cortar sesiones
antes, cambia `CRM_JWT_SECRET` en cPanel y reinicia la app: cierra las sesiones de todos.

Freno a fuerza bruta: 8 intentos fallidos por IP en 15 minutos. Está en memoria y se
reinicia con cada despliegue.

## 7. Errores frecuentes

| Síntoma | Causa |
|---|---|
| "La contraseña debe tener al menos 12 caracteres" | El script rechaza contraseñas cortas |
| `Duplicate entry ... for key 'uq_crm_users_email'` | Ese correo ya existe |
| "Credenciales invalidas" | Correo o contraseña incorrectos; el mensaje es igual a propósito |
| "Demasiados intentos. Prueba en 15 minutos." | Freno de fuerza bruta; se levanta reiniciando la app |
| `/health` sigue en 503 con "CRM sin usuarios" | No se pegó el `INSERT`, o se pegó en otra base |

## 8. Por qué doble login

- El CRM vive en `reformadental.com` y el dashboard en `e-commetrics.com`: otro servidor,
  otra base y otro dueño. La cookie del dashboard no llega al CRM.
- Son 2 o 3 personas: mantener dos contraseñas cuesta poco.
- Aísla el riesgo: los fallos de seguridad del backend del dashboard (ver
  `CRM_STATUS.md` §5) no dan acceso a los leads del CRM.
- Migrar a login único después es barato: las tablas `crm_*` no tienen claves foráneas a
  `crm_users`. El cambio queda en `verifyToken` (`crm/auth.js`), `/login` y la pantalla de
  login del frontend.

Reconsiderar el login único si: hay 3 o más apps con login propio, los usuarios del CRM
crecen o rotan mucho, se quiere que el permiso `CRM` del dashboard mande de verdad, o se
ofrece el CRM a otros clientes.

## 9. Pendiente opcional

- Pantalla de usuarios dentro del CRM (crear, listar, borrar). Hoy no existe: el backend no
  tiene rutas de usuarios, solo scripts. El primer admin siempre debe crearse por SQL. No
  vale la pena con pocos usuarios.

## 10. Cuidado con el repo

Los hashes de §4 son de contraseñas aleatorias de 16 caracteres, así que no son
explotables en la práctica. Aun así, son datos de acceso. **No publiques este archivo en
un repositorio público**; en uno privado es aceptable. Si prefieres no versionarlos, borra
la sección 4 antes de commitear: la base ya los tiene.
