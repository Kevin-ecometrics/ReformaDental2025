// Endpoints de sesion. Son NUEVOS: el CRM de Next.js no tenia ninguno.
//
// Ninguno exige requireAuth, y es intencionado:
//   /login   es la puerta de entrada; no puede exigir una sesion que no existe.
//   /logout  solo borra la cookie; que lo pueda llamar cualquiera es inofensivo.
//   /me      responde 200 con user:null si no hay sesion, para que el frontend
//            pueda comprobar si esta logueado sin tratar un 401 como error.

const express = require("express");
const { asyncHandler } = require("./util");
const { login, clearAuthCookie, readToken, verifyToken } = require("../auth");
const { getUserById } = require("../services/repo/users");

const router = express.Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const result = await login(req, res);
    if (!result.ok) return res.status(401).json({ error: result.error });
    // `token` viaja en el cuerpo ademas de en la cookie: el dashboard esta en
    // otro dominio y depende del header Authorization para no depender de una
    // cookie de terceros. Ver el comentario en auth.js login().
    return res.json({ user: result.user, token: result.token });
  })
);

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/**
 * El frontend lo llama al cargar para saber si ya hay sesion. Devuelve 200 con
 * user:null en vez de 401, para que no haya que tratar el caso como error.
 */
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const token = readToken(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload) return res.json({ user: null });

    // De la base y no del token, para que un cambio de rol se vea al recargar. Si la
    // base falla no se cierra la sesion: las demas rutas ya responderan su error.
    let user = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
    try {
      const stored = await getUserById(payload.sub);
      if (!stored) return res.json({ user: null });
      user = { id: stored.id, email: stored.email, name: stored.name, role: stored.role };
    } catch (err) {
      console.error("[crm/auth] /me no pudo leer el usuario:", err.message);
    }
    return res.json({ user });
  })
);

module.exports = router;
