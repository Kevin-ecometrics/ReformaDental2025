// Usuarios del CRM, solo para admins. Antes se creaban por SQL.

const express = require("express");
const { asyncHandler } = require("./util");
const { requireAdmin, hashPassword } = require("../auth");
const { listUsers, getUserByEmail, getUserById, createUser, updateUser, deleteUser } = require("../services/repo/users");

const router = express.Router();

const ROLES = ["admin", "staff"];
const MIN_PASSWORD_LENGTH = 12;

/** Nunca sale el hash de la contrasena. */
const publicUser = ({ id, email, name, role, createdAt, lastLoginAt }) => ({ id, email, name, role, createdAt, lastLoginAt });

/**
 * @param {{name?: unknown, role?: unknown, password?: unknown}} body
 * @returns {{patch?: {name?: string, role?: string, passwordHash?: string}, error?: string}}
 */
function parseUserChanges(body) {
  const patch = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 255) return { error: "name is required" };
    patch.name = name;
  }
  if ("role" in body) {
    if (!ROLES.includes(body.role)) return { error: "role must be admin or staff" };
    patch.role = body.role;
  }
  if ("password" in body) {
    if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LENGTH) {
      return { error: `password must have at least ${MIN_PASSWORD_LENGTH} characters` };
    }
    patch.passwordHash = hashPassword(body.password);
  }
  return { patch };
}

/** El CRM siempre debe conservar a alguien que pueda administrarlo. */
async function isLastAdmin(user) {
  if (user.role !== "admin") return false;
  const users = await listUsers();
  return users.filter((other) => other.role === "admin").length <= 1;
}

router.get(
  "/users",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ users: (await listUsers()).map(publicUser) });
  })
);

router.post(
  "/users",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 255) return res.status(400).json({ error: "email is not valid" });

    const { patch, error } = parseUserChanges({
      name: body.name,
      role: body.role,
      password: body.password,
    });
    if (error) return res.status(400).json({ error });
    if (await getUserByEmail(email)) return res.status(409).json({ error: "A user with this email already exists." });

    const user = await createUser({ email, ...patch });
    return res.status(201).json({ user: publicUser({ ...user, email, lastLoginAt: null }) });
  })
);

router.patch(
  "/users/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { patch, error } = parseUserChanges(req.body || {});
    if (error) return res.status(400).json({ error });
    if (patch.role && patch.role !== "admin" && (await isLastAdmin(user))) {
      return res.status(409).json({ error: "The CRM needs at least one admin." });
    }

    await updateUser(user.id, patch);
    return res.json({ user: publicUser(await getUserById(user.id)) });
  })
);

router.delete(
  "/users/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.sub) return res.status(409).json({ error: "You cannot delete your own user." });

    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (await isLastAdmin(user)) return res.status(409).json({ error: "The CRM needs at least one admin." });

    await deleteUser(user.id);
    return res.json({ ok: true });
  })
);

module.exports = router;
