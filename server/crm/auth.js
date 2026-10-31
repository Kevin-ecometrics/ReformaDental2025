// Auth del CRM: scrypt para contrasenas, JWT en cookie para la sesion.
//
// ESTO NO ES UNA TRADUCCION. El CRM de Next.js no tenia autenticacion: sus 15
// rutas eran publicas, sin middleware ni sesion (comprobado en el repo de
// origen). Eso exponia PII de leads y permitia gastar presupuesto de Twilio y de
// Meta desde cualquier pagina. Esta capa es nueva y hay que tratarla como una
// funcionalidad de seguridad, no como un refactor.
//
// Decisiones y por que:
//
// - scrypt (no bcrypt ni argon2): viene en node:crypto, sin dependencias
//   nuevas, y es aceptable para este caso. El formato del hash lleva la version
//   y los parametros para poder subirlos mas adelante sin invalidar las
//   contrasenas existentes.
// - JWT en cookie httpOnly, no en localStorage: asi el token no es legible por
//   JavaScript y un XSS no se lo lleva.
// - SameSite=None + Secure: obligatorio, porque el dashboard vive en
//   e-commetrics.com y la API en reformadental.com, o sea distinto sitio. Ese
//   mismo motivo hace que SameSite deje de proteger de CSRF, asi que
//   requireSameOrigin() comprueba el Origin en cada escritura. Sin eso, cualquier
//   pagina podria hacer que el navegador del admin mande un PATCH de etapa o un
//   POST de envio de SMS.

const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { getUserByEmail, getUserById, touchLastLogin } = require("./services/repo/users");
const { runAsUser } = require("./requestUser");

const COOKIE_NAME = "crm_token";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias
const SCRYPT_KEYLEN = 64;
// N=16384,r=8,p=1 es el segundo recomendado de OWASP para scrypt. Cuesta ~50ms
// por verificacion, suficiente para frenar fuerza bruta sin molestar al usuario.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const MAX_LOGIN_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * @param {string} password
 * @returns {string} `scrypt$N$r$p$saltHex$hashHex`
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("hex"),
    hash.toString("hex"),
  ].join("$");
}

/**
 * @param {string} password
 * @param {string} stored valor devuelto por hashPassword
 * @returns {boolean}
 */
function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split("$");
    if (scheme !== "scrypt") return false;

    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });

    // timingSafeEqual exige misma longitud y revienta si no, por eso el check.
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * @returns {string} el secreto, o lanza. Sin secreto fijo: un default sería un
 *   fallo de seguridad silencioso en produccion.
 */
function jwtSecret() {
  const secret = process.env.CRM_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "CRM_JWT_SECRET no esta definido o es demasiado corto (minimo 32 caracteres). Generar con: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
  }
  return secret;
}

/**
 * @param {import('./types').CrmUser} user
 * @returns {string}
 */
function signToken(user) {
  return jwt.sign({ email: user.email, name: user.name, role: user.role }, jwtSecret(), {
    subject: user.id,
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

/**
 * @param {string} token
 * @returns {object|null} payload, o null si es invalido/caducado
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
}

/**
 * @param {import('express').Response} res
 * @param {string} token
 */
function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: TOKEN_TTL_SECONDS * 1000,
    // Acotada a /crm: el token no viaja al calendario ni a ningun otro endpoint.
    path: "/crm",
  });
}

/**
 * @param {import('express').Response} res
 */
function clearAuthCookie(res) {
  // Las opciones deben coincidir con las del set o el navegador no la borra.
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: "none", path: "/crm" });
}

/**
 * Lee el valor de una cookie del header Cookie.
 *
 * Se parsea a mano y no con cookie-parser a proposito: son dos lineas y evita
 * anadir una dependencia mas a un proceso de produccion solo por esto.
 *
 * @param {import('express').Request} req
 * @param {string} name
 * @returns {string|null}
 */
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;

    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/**
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function readToken(req) {
  // El header Authorization va primero para que curl y los tests puedan
  // autenticarse sin fabricar una cookie.
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return readCookie(req, COOKIE_NAME);
}

// ─── Freno a fuerza bruta ─────────────────────────────────────────────────────
// En memoria y por IP. Suficiente para frenar un script burdo; no sobrevive a un
// despliegue (se reinicia) ni a un ataque distribuido, y no pretende mas. Si
// algun dia hace falta de verdad, el sitio es una tabla de intentos en MySQL o
// un rate limit en el proxy de cPanel.

/** @type {Map<string, {count: number, resetAt: number}>} */
const attempts = new Map();

/**
 * @param {string} key
 * @returns {boolean} true si esta bloqueado
 */
function isRateLimited(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

/**
 * @param {string} key
 */
function recordFailedAttempt(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/**
 * @param {string} key
 */
function clearAttempts(key) {
  attempts.delete(key);
}

/**
 * Middleware: exige sesion valida. Responde 401 con un cuerpo que el frontend
 * pueda distinguir, para que redirija al login en vez de mostrar un error.
 *
 * El usuario se relee de la base: el token dura 7 dias, y con solo sus datos un
 * usuario borrado o sin rol de admin seguiria entrando como antes.
 * shortcut: cambiar la contrasena no invalida los tokens ya emitidos; agregar una
 * version de token al usuario si hace falta cerrar sesiones al instante.
 *
 * @type {import('express').RequestHandler}
 */
async function requireAuth(req, res, next) {
  // Las rutas se montan en varios routers con este middleware: basta validar una vez.
  if (req.user) return next();

  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Sesion caducada o invalida" });
  }

  let user;
  try {
    user = await getUserById(payload.sub);
  } catch (err) {
    console.error("[crm/auth] no se pudo leer el usuario:", err.message);
    return res.status(503).json({ error: "Could not verify the session. Try again." });
  }
  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Sesion caducada o invalida" });
  }

  req.user = { sub: user.id, email: user.email, name: user.name, role: user.role };
  return runAsUser(user.name, next);
}

/**
 * Va despues de requireAuth y ruta por ruta: como router.use() cortaria tambien a
 * los routers siguientes, que comparten el mismo prefijo.
 *
 * @type {import('express').RequestHandler}
 */
function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "Only an admin can do this." });
}

// ─── CSRF ────────────────────────────────────────────────────────────────────

/**
 * Verifica el Origin de las peticiones que escriben. Solo GET/HEAD/OPTIONS quedan
 * fuera: son idempotentes y no cambian estado.
 *
 * @type {import('express').RequestHandler}
 */
function requireSameOrigin(allowedOrigins) {
  const allow = new Set(allowedOrigins || []);

  return function (req, res, next) {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }

    const origin = req.headers.origin;
    const referer = req.headers.referer;

    // curl y scripts propios no mandan Origin. Se aceptan: el API no esta pensado
    // para uso desde curl, y un atacante con red ya esta dentro. Lo que importa es
    // que un navegador desde una pagina.gnu.org no pueda.
    if (!origin && !referer) return next();

    const candidate = origin || new URL(referer).origin;
    if (allow.has(candidate)) return next();

    return res.status(403).json({ error: "Origen no permitido" });
  };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<{ok: boolean, error?: string, token?: string, user?: import('./types').CrmUser}>}
 */
async function login(req, res) {
  const key = req.ip || "desconocido";
  if (isRateLimited(key)) {
    return { ok: false, error: "Demasiados intentos. Prueba en 15 minutos." };
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return { ok: false, error: "Faltan email y contrasena" };
  }

  const user = await getUserByEmail(email);
  // Mismo mensaje y el mismo coste de CPU para usuario inexistente y contrasena
  // incorrecta, para no filtrar que emails estan dados de alta.
  const invalid = { ok: false, error: "Credenciales invalidas" };
  if (!user) {
    // scrypt tambien aqui: si no, el tiempo de respuesta delata si el email existe.
    crypto.scryptSync(String(password), "placeholder", 64, SCRYPT_PARAMS);
    recordFailedAttempt(key);
    return invalid;
  }

  if (!verifyPassword(String(password), user.passwordHash)) {
    recordFailedAttempt(key);
    return invalid;
  }

  clearAttempts(key);
  const token = signToken(user);
  setAuthCookie(res, token);
  // Bookkeeping: que un login valido no se convierta en 500 por un UPDATE.
  void touchLastLogin(user.id);

  // El token vuelve tambien en el cuerpo, no solo en la cookie. El dashboard
  // corre en otro dominio (e-commetrics.com) y la cookie seria de terceros, que
  // Safari y Chrome van bloqueando: el frontend la usa como respaldo y manda
  // Authorization: Bearer en su lugar.
  return {
    ok: true,
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  readToken,
  readCookie,
  requireAuth,
  requireAdmin,
  requireSameOrigin,
  login,
};
