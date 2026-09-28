// Conversions API de Meta.
//
// Traduccion directa de src/lib/facebookCapi.ts. El unico cambio estructural
// es donde se guarda el estado: antes en `db.data.syncState` de lowdb, ahora en
// la fila unica de crm_sync_state via updateSyncState(). El payload del
// evento, el hash y el orden de los efectos quedan intactos, porque cambiar el
// payload cambia como Meta atribuye la conversion y eso no se toca sin medir.

const crypto = require("node:crypto");
const { addActivity } = require("../repo/activities");
const { updateSyncState } = require("../repo/syncState");
const { now } = require("../../db/connection");

const FB_API_VERSION = "v26.0";
const FB_DATASET_ID = "606403608113212";

/**
 * SHA-256 en minusculas: es lo que exige Meta, y Meta compara el hash, no el
 * valor, asi que el trim/lower no son cosmeticos.
 * @param {string} value
 * @returns {string}
 */
function sha256(value) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * @param {string|null} email
 * @returns {string[]|undefined}
 */
function hashEmail(email) {
  if (!email) return undefined;
  return [sha256(email)];
}

/**
 * Solo digitos: Meta exige el E.164 sin signos.
 * @param {string|null} phone
 * @returns {string[]|undefined}
 */
function hashPhone(phone) {
  if (!phone) return undefined;
  const digitsOnly = phone.replace(/[^\d]/g, "");
  if (!digitsOnly) return undefined;
  return [sha256(digitsOnly)];
}

/**
 * @param {import("../../types").Lead} lead
 * @returns {Record<string, unknown>}
 */
function buildUserData(lead) {
  const raw = lead.fieldDataRaw || {};
  const userData = {};

  if (lead.fbLeadgenId) userData.lead_id = lead.fbLeadgenId;

  // Lead Ads no devuelve un click id en field_data, asi que esto solo aparece
  // si el lead trae uno en fieldDataRaw (por ejemplo de un formulario web
  // futuro). En leads puros de Facebook no esta.
  const clickId = raw.click_id ?? raw.fbc;
  if (typeof clickId === "string" && clickId) userData.click_id = clickId;

  const em = hashEmail(lead.email);
  if (em) userData.em = em;

  const ph = hashPhone(lead.phone);
  if (ph) userData.ph = ph;

  for (const [target, field] of [
    ["ge", "gender"],
    ["db", "date_of_birth"],
    ["ct", "city"],
    ["st", "state"],
    ["zp", "zip"],
    ["country", "country"],
  ]) {
    const val = raw[field];
    if (typeof val === "string" && val) {
      userData[target] = [sha256(val)];
    }
  }

  return userData;
}

/**
 * @typedef {object} CapiSendResult
 * @property {boolean} ok
 * @property {number} [status]
 * @property {unknown} [body]
 * @property {string} [error]
 * @property {Record<string, unknown>} payload
 */

/**
 * Envia un evento de conversion y deja rastro en syncState y en el log del
 * lead, para los cuatro desenlaces: sin token, con excepcion de red, con error
 * HTTP y con exito. Nunca lanza.
 *
 * @param {import("../../types").Lead} lead
 * @param {string} stageName
 * @returns {Promise<CapiSendResult>}
 */
async function sendCapiEvent(lead, stageName) {
  const accessToken = process.env.CRM_FB_CAPI_ACCESS_TOKEN;
  const testEventCode = process.env.CRM_FB_CAPI_TEST_EVENT_CODE;

  const payload = {
    event_name: stageName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "system_generated",
    custom_data: {
      event_source: "crm",
      lead_event_source: "Reforma Dental CRM",
    },
    user_data: buildUserData(lead),
  };

  if (!accessToken) {
    await updateSyncState({
      lastCapiError: "CRM_FB_CAPI_ACCESS_TOKEN is not set — CAPI event not sent",
    });
    await addActivity(
      lead.id,
      "capi_failed",
      `CAPI event "${stageName}" not sent: missing CRM_FB_CAPI_ACCESS_TOKEN`
    );
    return { ok: false, error: "missing_access_token", payload };
  }

  const url = new URL(`https://graph.facebook.com/${FB_API_VERSION}/${FB_DATASET_ID}/events`);
  url.searchParams.set("access_token", accessToken);

  const body = { data: [payload] };
  if (testEventCode) body.test_event_code = testEventCode;

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => undefined);

    if (res.ok) {
      await updateSyncState({ lastCapiAt: now(), lastCapiError: null });
      await addActivity(
        lead.id,
        "capi_sent",
        `CAPI event "${stageName}" sent${testEventCode ? " (test mode)" : ""}`
      );
      return { ok: true, status: res.status, body: json, payload };
    }

    const errMsg = `HTTP ${res.status}: ${JSON.stringify(json)}`;
    await updateSyncState({ lastCapiError: errMsg });
    await addActivity(lead.id, "capi_failed", `CAPI event "${stageName}" failed: ${errMsg}`);
    return { ok: false, status: res.status, body: json, error: errMsg, payload };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await updateSyncState({ lastCapiError: errMsg });
    await addActivity(lead.id, "capi_failed", `CAPI event "${stageName}" failed: ${errMsg}`);
    return { ok: false, error: errMsg, payload };
  }
}

module.exports = { sendCapiEvent, buildUserData, sha256 };
