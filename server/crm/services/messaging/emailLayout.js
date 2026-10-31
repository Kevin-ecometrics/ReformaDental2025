// Diseno de los correos de Reforma Dental: el marco comun de la confirmacion de
// citas (server.src.js) y de los correos del CRM. Lo que cambia entre ellos son las
// filas de la tarjeta central.

const CLINIC_ADDRESS = "8169-206 Ignacio Zaragoza, Zona Centro, Tijuana, Baja California, México";
const CLINIC_PHONE_TEXT = "+1 619-586-1436";
const CLINIC_PHONE_TEL = "+16195861436";
const CLINIC_LOGO_URL = "https://reformadental.com/logo-emailTemplate.png";

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * El documento completo. `title`, `preheader` y `rows` van tal cual: quien llama
 * responde de escapar lo que venga de fuera.
 * @param {{lang: string, title: string, preheader: string, rows: string}} parts
 * @returns {string}
 */
function emailShell({ lang, title, preheader, rows }) {
  return "<!DOCTYPE html>\n" +
'<html lang="' + lang + '">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<meta name="color-scheme" content="light dark">\n' +
'<meta name="supported-color-schemes" content="light dark">\n' +
'<title>' + title + '</title>\n' +
'<!--[if mso]>\n' +
'<style>table,td{font-family:Verdana,Arial,sans-serif !important;}</style>\n' +
'<![endif]-->\n' +
'</head>\n' +
'<body style="margin:0;padding:0;background-color:#f2f3ec;">\n' +
'  <span style="display:none;font-size:1px;color:#f2f3ec;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' + preheader + '</span>\n' +
'  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f2f3ec;">\n' +
'    <tr>\n' +
'      <td align="center" style="padding:32px 12px;">\n' +
'        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">\n' +
'\n' +
'          <!-- header band -->\n' +
'          <tr>\n' +
'            <td align="center" style="background-color:#4d5c66;border-radius:14px 14px 0 0;padding:32px 40px 28px 40px;">\n' +
'              <img src="' + CLINIC_LOGO_URL + '" width="130" height="130" alt="Reforma Dental" style="display:block;width:130px;height:130px;border:0;margin:0 auto;">\n' +
'              <div style="font-family:Verdana,Arial,sans-serif;font-size:20px;letter-spacing:4px;font-weight:bold;color:#fdfdfa;padding-top:10px;">REFORMA&nbsp;DENTAL</div>\n' +
'              <div style="font-family:Verdana,Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#aeca12;padding-top:6px;">TIJUANA &middot; B.C.</div>\n' +
'            </td>\n' +
'          </tr>\n' +
'\n' +
'          <!-- green accent line -->\n' +
'          <tr>\n' +
'            <td style="height:5px;background-color:#aeca12;font-size:0;line-height:0;" height="5">&nbsp;</td>\n' +
'          </tr>\n' +
'\n' +
'          <!-- card body -->\n' +
'          <tr>\n' +
'            <td style="background-color:#fdfdfa;">\n' +
'              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
'\n' +
rows +
'              </table>\n' +
'            </td>\n' +
'          </tr>\n' +
'\n' +
'          <!-- footer -->\n' +
'          <tr>\n' +
'            <td align="center" style="background-color:#4d5c66;border-radius:0 0 14px 14px;padding:28px 40px;">\n' +
'              <div style="font-family:Verdana,Arial,sans-serif;font-size:13px;color:#f2f3ec;mso-line-height-rule:exactly;line-height:21px;">\n' +
'                <strong>Reforma Dental</strong> &nbsp;&middot;&nbsp; ' + CLINIC_ADDRESS + '\n' +
'              </div>\n' +
'              <div style="font-family:Verdana,Arial,sans-serif;font-size:13px;color:#f2f3ec;mso-line-height-rule:exactly;line-height:21px;padding-top:4px;">\n' +
'                <a href="tel:' + CLINIC_PHONE_TEL + '" style="color:#f2f3ec;text-decoration:underline;">' + CLINIC_PHONE_TEXT + '</a> &nbsp;&middot;&nbsp; <a href="https://reformadental.com" style="color:#f2f3ec;text-decoration:underline;">reformadental.com</a>\n' +
'              </div>\n' +
'              <div style="font-family:Georgia,\'Times New Roman\',serif;font-style:italic;font-size:12px;color:#aebcc4;padding-top:14px;">\n' +
'                Sonr&iacute;e, es la mejor decisi&oacute;n &middot; Smile, it\'s the best choice\n' +
'              </div>\n' +
'            </td>\n' +
'          </tr>\n' +
'\n' +
'        </table>\n' +
'      </td>\n' +
'    </tr>\n' +
'  </table>\n' +
'</body>\n' +
'</html>\n';
}

/**
 * La fila con el boton al sitio.
 * @param {string} label
 * @returns {string}
 */
function emailButton(label) {
  return '                <!-- button -->\n' +
'                <tr>\n' +
'                  <td align="center" style="padding:28px 48px 44px 48px;">\n' +
'                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">\n' +
'                      <tr>\n' +
'                        <td align="center" bgcolor="#8fd2ef" style="border-radius:28px;">\n' +
'                          <a href="https://reformadental.com" style="display:block;padding:15px 46px;font-family:Verdana,Arial,sans-serif;font-size:15px;font-weight:bold;color:#2c4a58;text-decoration:none;border-radius:28px;">' + label + '</a>\n' +
'                        </td>\n' +
'                      </tr>\n' +
'                    </table>\n' +
'                  </td>\n' +
'                </tr>\n';
}

/**
 * Correo del CRM. El asunto y el texto llevan datos del lead (nombre de Facebook o
 * CSV), asi que se escapan siempre.
 * @param {string} subject
 * @param {string} text
 * @returns {string}
 */
function emailHtml(subject, text) {
  const headline = escapeHtml(subject);
  const body = escapeHtml(text).replace(/\r?\n/g, "<br>");

  return emailShell({
    lang: "es",
    title: headline,
    preheader: escapeHtml(text.replace(/\s+/g, " ").slice(0, 120)),
    rows:
      '                <tr>\n' +
      '                  <td align="center" style="padding:40px 48px 0 48px;font-family:Georgia,\'Times New Roman\',serif;font-size:30px;font-weight:bold;color:#4d5c66;mso-line-height-rule:exactly;line-height:36px;">\n' +
      '                    ' + headline + '\n' +
      '                  </td>\n' +
      '                </tr>\n' +
      '                <tr>\n' +
      '                  <td style="padding:24px 48px 0 48px;font-family:Verdana,Arial,sans-serif;font-size:15px;color:#66757f;mso-line-height-rule:exactly;line-height:23px;">\n' +
      '                    ' + body + '\n' +
      '                  </td>\n' +
      '                </tr>\n' +
      '\n' +
      emailButton("Visita reformadental.com"),
  });
}

module.exports = { CLINIC_ADDRESS, CLINIC_PHONE_TEXT, CLINIC_PHONE_TEL, CLINIC_LOGO_URL, emailShell, emailButton, emailHtml };
