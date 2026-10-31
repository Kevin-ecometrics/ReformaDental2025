// Como se reconoce a la misma persona entre leads y citas.

/**
 * Ultimos 10 digitos: la cita guarda "664…" y Meta manda "+52664…".
 * @param {string|null|undefined} phone
 * @returns {string|null}
 */
function phoneKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
function emailKey(email) {
  const value = String(email || "").trim().toLowerCase();
  return value || null;
}

/**
 * Leads con el mismo telefono o correo. A diferencia del cruce de citas, aqui
 * basta con uno de los dos: solo sirve para avisar, nunca fusiona ni bloquea.
 * Cuenta archivados, para que no se cree de nuevo a alguien que ya se archivo.
 * @param {{id?: string, phone?: string|null, email?: string|null}} contact
 * @param {import("../types").Lead[]} leads
 * @returns {import("../types").Lead[]}
 */
function findDuplicates(contact, leads) {
  const phone = phoneKey(contact.phone);
  const email = emailKey(contact.email);
  return leads.filter(
    (lead) =>
      lead.id !== contact.id &&
      ((phone && phoneKey(lead.phone) === phone) || (email && emailKey(lead.email) === email))
  );
}

module.exports = { phoneKey, emailKey, findDuplicates };
