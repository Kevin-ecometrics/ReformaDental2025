// Lectura de un CSV de leads, sin escribir nada.

const { parseContactPatch } = require("./leadContact");
const { phoneKey, emailKey } = require("./matching");

/**
 * CSV con comillas: "Perez, Ana" es un campo y "" es una comilla literal.
 * @param {string} text
 * @returns {string[][]} filas no vacias
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && !field.trim()) {
      field = "";
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field.trim());
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

/**
 * Decide que filas se importan. Una fila con columnas de mas es invalida y no se
 * adivina: "Perez, Ana" sin comillas partiria el nombre y correria los demas datos.
 * Los duplicados se comparan contra los leads existentes y contra el propio archivo.
 *
 * @param {string} text
 * @param {import("../types").Lead[]} existing incluye archivados
 * @returns {{error?: string, rows?: {name: string, email: string|null, phone: string|null}[], duplicates?: number, invalid?: number}}
 */
function planCsvImport(text, existing) {
  const [header, ...lines] = parseCsv(text.replace(/^﻿/, ""));
  if (!header || lines.length === 0) return { error: "CSV must have a header row and at least one data row" };

  const headers = header.map((h) => h.toLowerCase());
  const nameIdx = headers.indexOf("name");
  if (nameIdx === -1) return { error: 'CSV header must include a "name" column' };
  const emailIdx = headers.indexOf("email");
  const phoneIdx = headers.indexOf("phone");

  const phones = new Set(existing.map((lead) => phoneKey(lead.phone)).filter(Boolean));
  const emails = new Set(existing.map((lead) => emailKey(lead.email)).filter(Boolean));
  const rows = [];
  let duplicates = 0;
  let invalid = 0;

  for (const cols of lines) {
    const { patch, error } = parseContactPatch({
      name: cols[nameIdx] ?? "",
      email: emailIdx !== -1 ? cols[emailIdx] ?? "" : "",
      phone: phoneIdx !== -1 ? cols[phoneIdx] ?? "" : "",
    });
    if (error || cols.length > headers.length) {
      invalid += 1;
      continue;
    }

    const phone = phoneKey(patch.phone);
    const email = emailKey(patch.email);
    if ((phone && phones.has(phone)) || (email && emails.has(email))) {
      duplicates += 1;
      continue;
    }
    if (phone) phones.add(phone);
    if (email) emails.add(email);
    rows.push(patch);
  }

  return { rows, duplicates, invalid };
}

module.exports = { parseCsv, planCsvImport };
