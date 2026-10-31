// Validacion de la edicion de un lead (nombre, correo y telefono).

/** Largos de las columnas de crm_leads: pasarlos daria un error de MySQL. */
const MAX_LENGTH = { name: 255, email: 255, phone: 50 };

/**
 * Toma solo los campos presentes en el body. Un correo o telefono vacio se
 * guarda como null, igual que al crear el lead; el nombre es obligatorio.
 * @param {object} body
 * @returns {{patch?: {name?: string, email?: string|null, phone?: string|null}, error?: string}}
 */
function parseContactPatch(body) {
  const patch = {};

  for (const field of Object.keys(MAX_LENGTH)) {
    if (!(field in body)) continue;

    const raw = body[field];
    if (raw !== null && typeof raw !== "string") return { error: `${field} must be text` };

    const value = (raw ?? "").trim();
    if (value.length > MAX_LENGTH[field]) return { error: `${field} is too long` };
    if (field === "name" && !value) return { error: "name is required" };
    if (field === "email" && value && !/^[^\s@]+@[^\s@]+$/.test(value)) {
      return { error: "email is not valid" };
    }

    patch[field] = value || null;
  }

  return { patch };
}

module.exports = { parseContactPatch };
