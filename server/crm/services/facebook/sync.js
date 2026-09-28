// Sincronizacion de leads de Facebook Lead Ads.
//
// Traduccion directa de src/lib/facebookSync.ts, con la lectura del estado
// migrada de lowdb a crm_sync_state.
//
// Recorre los leadgen_forms de la pagina, baja los leads de cada formulario y
// los mete por services/leads.createLead(), que es quien deduplica por
// fbLeadgenId. Por eso es seguro que el cron lo llame cada 5 minutos: releer un
// formulario que ya se leyo no crea duplicados.

const { createLead } = require("../leads");
const { updateSyncState } = require("../repo/syncState");
const { now } = require("../../db/connection");

const FB_API_VERSION = "v26.0";
const GRAPH_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

/**
 * @typedef {object} SyncResult
 * @property {boolean} ok
 * @property {number} fetched
 * @property {number} created
 * @property {string} [error]
 */

/**
 * Busca el primer valor presente entre varios nombres de campo posibles. Meta
 * deja el nombre del campo tal como lo escribio el anunciante, y cada formulario
 * lo nombra distinto, asi que se prueban varias variantes en vez de asumir una.
 *
 * @param {Array<{name: string, values?: string[]}>} fields
 * @param {...string} candidateNames
 * @returns {string|null}
 */
function fieldValue(fields, ...candidateNames) {
  for (const name of candidateNames) {
    const match = fields.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (match && match.values && match.values[0]) return match.values[0];
  }
  return null;
}

/**
 * @returns {Promise<SyncResult>} nunca lanza
 */
async function syncFacebookLeads() {
  const accessToken = process.env.CRM_FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.CRM_FB_PAGE_ID;

  if (!accessToken || !pageId) {
    const error = "CRM_FB_PAGE_ACCESS_TOKEN / CRM_FB_PAGE_ID not set — Facebook sync skipped";
    await updateSyncState({ lastError: error });
    return { ok: false, fetched: 0, created: 0, error };
  }

  try {
    const formsRes = await fetch(
      `${GRAPH_URL}/${pageId}/leadgen_forms?fields=id,name&access_token=${accessToken}`
    );
    const formsJson = await formsRes.json();
    if (!formsRes.ok) {
      throw new Error(`leadgen_forms failed: HTTP ${formsRes.status}: ${JSON.stringify(formsJson)}`);
    }
    const forms = formsJson.data || [];

    let fetched = 0;
    let created = 0;

    for (const form of forms) {
      const leadsRes = await fetch(
        `${GRAPH_URL}/${form.id}/leads?fields=field_data,created_time,ad_name,campaign_name&access_token=${accessToken}`
      );
      const leadsJson = await leadsRes.json();
      if (!leadsRes.ok) {
        throw new Error(
          `leads fetch failed for form ${form.id}: HTTP ${leadsRes.status}: ${JSON.stringify(leadsJson)}`
        );
      }
      const leads = leadsJson.data || [];
      fetched += leads.length;

      for (const raw of leads) {
        const fields = raw.field_data || [];
        const joinedName = [fieldValue(fields, "first_name"), fieldValue(fields, "last_name")]
          .filter(Boolean)
          .join(" ");
        const name = fieldValue(fields, "full_name", "name") || joinedName || "Unnamed lead";
        const email = fieldValue(fields, "email");
        const phone = fieldValue(fields, "phone_number", "phone");

        const fieldDataRaw = {};
        for (const f of fields) fieldDataRaw[f.name] = f.values && f.values[0] !== undefined ? f.values[0] : null;

        const { created: wasCreated } = await createLead({
          name,
          email,
          phone,
          source: "facebook",
          fbLeadgenId: raw.id,
          campaignName: raw.campaign_name ?? null,
          adName: raw.ad_name ?? null,
          formName: form.name,
          fieldDataRaw,
        });
        if (wasCreated) created += 1;
      }
    }

    await updateSyncState({ lastSyncAt: now(), lastError: null });
    return { ok: true, fetched, created };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await updateSyncState({ lastError: error });
    return { ok: false, fetched: 0, created: 0, error };
  }
}

/**
 * Comprueba el Page Access Token contra /debug_token.
//
// Un token de pagina derivado de un user token de larga duracion normalmente no
 * caduca por tiempo, pero se rompe por otras vias: permiso revocado, contrasena
 * cambiada, o la app perdiendo acceso. Esto lo detecta antes de que el proximo
 * sync empiece a fallar en silencio, y Settings lo muestra.
 *
 * @returns {Promise<void>} nunca lanza
 */
async function checkFacebookTokenValidity() {
  const accessToken = process.env.CRM_FB_PAGE_ACCESS_TOKEN;
  if (!accessToken) return;

  try {
    const res = await fetch(
      `${GRAPH_URL}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
    );
    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error((json.error && json.error.message) || `HTTP ${res.status}`);
    }
    const data = json.data || {};
    const isValid = Boolean(data.is_valid);
    await updateSyncState({
      tokenValid: isValid,
      tokenCheckedAt: now(),
      tokenCheckError: isValid ? null : (json.error && json.error.message) || "Token is no longer valid",
    });
  } catch (err) {
    await updateSyncState({
      tokenValid: false,
      tokenCheckedAt: now(),
      tokenCheckError: err instanceof Error ? err.message : String(err),
    });
  }
}

module.exports = { syncFacebookLeads, checkFacebookTokenValidity, fieldValue };
