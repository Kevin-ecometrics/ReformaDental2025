require("dotenv").config();

// Comandos de instalacion del CRM (--crm-seed, --crm-create-user, --crm-migrate):
// corren y salen sin arrancar el servidor ni el cron.
const crmCliMode = require("./crm/cli").run(process.argv.slice(2));

const express    = require("express");
const mysql      = require("mysql");
const cors       = require("cors");
const nodemailer = require("nodemailer");

const app  = express();
const PORT = 3001;

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = [
  "https://www.reformadental.com",
  "https://reformadental.com",
  "https://www.e-commetrics.com",
  "https://e-commetrics.com",
  "http://localhost:4321",
  "http://localhost:3000",
  "http://localhost:3001",
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("CORS: origen no permitido: " + origin));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json());

// ─── MySQL ────────────────────────────────────────────────────────────────────

const db = mysql.createPool({
  host:            process.env.MYSQL_HOST     || "localhost",
  user:            process.env.MYSQL_USER     || "root",
  password:        process.env.MYSQL_PASSWORD || "",
  database:        process.env.MYSQL_DATABASE || "clinicareforma_contacts",
  port:            3306,
  connectionLimit: 10,
});

// Verificar conexión al iniciar
db.getConnection(function(err, conn) {
  if (err) {
    console.error("✗ DB Error:", err.message);
  } else {
    console.log("✓ Base de datos conectada");
    conn.release();
  }
});

function query(sql, params, cb) {
  db.query(sql, params, cb);
}

// ─── Email ────────────────────────────────────────────────────────────────────

const mail = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || "host11.registrar-servers.com",
  port:   465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || "mydentist@reformadental.com",
    pass: process.env.EMAIL_PASS || "",
  },
});

console.log("✓ Email configurado con host=" + (process.env.EMAIL_HOST || "host11.registrar-servers.com") + " user=" + (process.env.EMAIL_USER || "mydentist@reformadental.com") + " pass=" + (process.env.EMAIL_PASS ? "(definida)" : "(VACÍA - usará fallback sin password)"));

mail.verify(function(err) {
  if (err) console.error("✗ SMTP verify falló:", err.message);
  else console.log("✓ SMTP conectado y listo para enviar");
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateStr(d) {
  if (typeof d === "object" && d !== null && d.getFullYear) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  return String(d).split("T")[0] || "";
}

function fechaES(f) {
  var m = ["enero","febrero","marzo","abril","mayo","junio",
           "julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var p = f.split("-");
  return parseInt(p[2]) + " de " + m[parseInt(p[1]) - 1] + " de " + p[0];
}

function fechaEN(f) {
  var m = ["January","February","March","April","May","June",
           "July","August","September","October","November","December"];
  var p = f.split("-");
  return m[parseInt(p[1]) - 1] + " " + parseInt(p[2]) + ", " + p[0];
}

function hora12(h) {
  var n = parseInt(h.split(":")[0]);
  return (n % 12 || 12) + ":00 " + (n >= 12 ? "PM" : "AM");
}

var CLINIC_ADDRESS     = "8169-206 Ignacio Zaragoza, Zona Centro, Tijuana, Baja California, México";
var CLINIC_ADDRESS_ICS = CLINIC_ADDRESS.replace(/,/g, "\\,");
var CLINIC_PHONE_TEXT  = "+1 619-586-1436";
var CLINIC_PHONE_TEL   = "+16195861436";
var CLINIC_LOGO_URL    = "https://reformadental.com/logo-emailTemplate.png";

function ics(nombre, fecha, hora, lang) {
  var p = fecha.split("-"), hp = hora.split(":");
  var start = new Date(+p[0], +p[1]-1, +p[2], +hp[0]-4, +hp[1]);
  var end   = new Date(start.getTime() + 1800000);
  var fmt   = function(d) { return d.toISOString().replace(/[-:]|\.\d{3}/g,"").slice(0,15); };
  var summ  = lang === "ES" ? "Cita Dental con " : "Dental Appointment with ";
  return [
    "BEGIN:VCALENDAR","VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:" + Date.now() + "@reformadental.com",
    "DTSTAMP:" + fmt(new Date()),
    "DTSTART:" + fmt(start),
    "DTEND:"   + fmt(end),
    "SUMMARY:" + summ + nombre,
    "LOCATION:" + CLINIC_ADDRESS_ICS,
    "END:VEVENT","END:VCALENDAR",
  ].join("\r\n");
}

// Plantilla de confirmación de cita — importada desde Claude Design
// (appointment-confirmed-email.html). lang: "ES" | "EN"
function confirmationHtml(lang, nombre, fecha, hora, telefono) {
  var isES = lang === "ES";

  var fechaFmt   = isES ? fechaES(fecha) : fechaEN(fecha);
  var horaFmt    = hora12(hora);
  var preheader  = isES
    ? "Tu cita está confirmada para el " + fechaFmt + " a las " + horaFmt + " — Dental Reforma, Tijuana."
    : "Your appointment is confirmed for " + fechaFmt + " at " + horaFmt + " — Dental Reforma, Tijuana.";
  var headline   = isES ? "Cita Confirmada" : "Appointment Confirmed";
  var greeting   = isES
    ? "Estimado/a <strong style=\"color:#4d5c66;\">" + nombre + "</strong>, gracias por agendar con nosotros.<br>Esperamos verte pronto."
    : "Dear <strong style=\"color:#4d5c66;\">" + nombre + "</strong>, thank you for booking with us.<br>We look forward to seeing you.";
  var lblDate     = isES ? "FECHA" : "DATE";
  var lblTime     = isES ? "HORA" : "TIME";
  var lblPhone    = isES ? "TELÉFONO" : "PHONE";
  var lblLocation = isES ? "UBICACIÓN" : "LOCATION";
  var calendarNote = isES
    ? "Se adjunta una invitaci&oacute;n de calendario &mdash; agr&eacute;gala para no perder tu cita."
    : "A calendar invite is attached &mdash; add it so you don't miss your visit.";
  var button = isES ? "Visita reformadental.com" : "Visit reformadental.com";

  return "<!DOCTYPE html>\n" +
'<html lang="' + (isES ? "es" : "en") + '">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<meta name="color-scheme" content="light dark">\n' +
'<meta name="supported-color-schemes" content="light dark">\n' +
'<title>' + headline + ' — Dental Reforma</title>\n' +
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
'                <!-- confirmed badge + headline -->\n' +
'                <tr>\n' +
'                  <td align="center" style="padding:40px 48px 0 48px;">\n' +
'                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">\n' +
'                      <tr>\n' +
'                        <td align="center" width="52" height="52" style="width:52px;height:52px;background-color:#aeca12;border-radius:26px;font-family:Verdana,Arial,sans-serif;font-size:26px;font-weight:bold;color:#fdfdfa;mso-line-height-rule:exactly;line-height:52px;">&#10003;</td>\n' +
'                      </tr>\n' +
'                    </table>\n' +
'                  </td>\n' +
'                </tr>\n' +
'                <tr>\n' +
'                  <td align="center" style="padding:20px 48px 0 48px;font-family:Georgia,\'Times New Roman\',serif;font-size:30px;font-weight:bold;color:#4d5c66;mso-line-height-rule:exactly;line-height:36px;">\n' +
'                    ' + headline + '\n' +
'                  </td>\n' +
'                </tr>\n' +
'                <tr>\n' +
'                  <td align="center" style="padding:12px 48px 0 48px;font-family:Verdana,Arial,sans-serif;font-size:15px;color:#66757f;mso-line-height-rule:exactly;line-height:23px;">\n' +
'                    ' + greeting + '\n' +
'                  </td>\n' +
'                </tr>\n' +
'\n' +
'                <!-- details card -->\n' +
'                <tr>\n' +
'                  <td style="padding:32px 48px 0 48px;">\n' +
'                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f8e6;border-radius:12px;">\n' +
'                      <tr>\n' +
'                        <td style="padding:8px 28px;">\n' +
'                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
'                            <tr>\n' +
'                              <td width="110" style="padding:16px 0;border-bottom:1px solid #e2e9c8;font-family:Verdana,Arial,sans-serif;font-size:11px;letter-spacing:1.5px;font-weight:bold;color:#8a9a3a;" valign="middle">' + lblDate + '</td>\n' +
'                              <td style="padding:16px 0;border-bottom:1px solid #e2e9c8;font-family:Verdana,Arial,sans-serif;font-size:15px;font-weight:bold;color:#42525c;" valign="middle">' + fechaFmt + '</td>\n' +
'                            </tr>\n' +
'                            <tr>\n' +
'                              <td width="110" style="padding:16px 0;border-bottom:1px solid #e2e9c8;font-family:Verdana,Arial,sans-serif;font-size:11px;letter-spacing:1.5px;font-weight:bold;color:#8a9a3a;" valign="middle">' + lblTime + '</td>\n' +
'                              <td style="padding:16px 0;border-bottom:1px solid #e2e9c8;font-family:Verdana,Arial,sans-serif;font-size:15px;font-weight:bold;color:#42525c;" valign="middle">' + horaFmt + '</td>\n' +
'                            </tr>\n' +
'                            <tr>\n' +
'                              <td width="110" style="padding:16px 0;border-bottom:1px solid #e2e9c8;font-family:Verdana,Arial,sans-serif;font-size:11px;letter-spacing:1.5px;font-weight:bold;color:#8a9a3a;" valign="middle">' + lblPhone + '</td>\n' +
'                              <td style="padding:16px 0;border-bottom:1px solid #e2e9c8;font-family:Verdana,Arial,sans-serif;font-size:15px;color:#42525c;" valign="middle">' + telefono + '</td>\n' +
'                            </tr>\n' +
'                            <tr>\n' +
'                              <td width="110" style="padding:16px 0;font-family:Verdana,Arial,sans-serif;font-size:11px;letter-spacing:1.5px;font-weight:bold;color:#8a9a3a;" valign="middle">' + lblLocation + '</td>\n' +
'                              <td style="padding:16px 0;font-family:Verdana,Arial,sans-serif;font-size:15px;color:#42525c;mso-line-height-rule:exactly;line-height:22px;" valign="middle">' + CLINIC_ADDRESS + '</td>\n' +
'                            </tr>\n' +
'                          </table>\n' +
'                        </td>\n' +
'                      </tr>\n' +
'                    </table>\n' +
'                  </td>\n' +
'                </tr>\n' +
'\n' +
'                <!-- calendar note -->\n' +
'                <tr>\n' +
'                  <td align="center" style="padding:24px 48px 0 48px;font-family:Verdana,Arial,sans-serif;font-size:13px;color:#66757f;mso-line-height-rule:exactly;line-height:20px;">\n' +
'                    &#128197;&nbsp; ' + calendarNote + '\n' +
'                  </td>\n' +
'                </tr>\n' +
'\n' +
'                <!-- button -->\n' +
'                <tr>\n' +
'                  <td align="center" style="padding:28px 48px 44px 48px;">\n' +
'                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">\n' +
'                      <tr>\n' +
'                        <td align="center" bgcolor="#8fd2ef" style="border-radius:28px;">\n' +
'                          <a href="https://reformadental.com" style="display:block;padding:15px 46px;font-family:Verdana,Arial,sans-serif;font-size:15px;font-weight:bold;color:#2c4a58;text-decoration:none;border-radius:28px;">' + button + '</a>\n' +
'                        </td>\n' +
'                      </tr>\n' +
'                    </table>\n' +
'                  </td>\n' +
'                </tr>\n' +
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

function htmlES(nombre, fecha, hora, telefono) {
  return confirmationHtml("ES", nombre, fecha, hora, telefono);
}

function htmlEN(nombre, fecha, hora, telefono) {
  return confirmationHtml("EN", nombre, fecha, hora, telefono);
}

// ─── Rutas ────────────────────────────────────────────────────────────────────

app.get("/", function(req, res) {
  res.json({ ok: true, message: "Servidor Dental Reforma funcionando" });
});

// GET citas ocupadas — usado por el frontend Astro
app.get("/api/citas/ocupadas", function(req, res) {
  query("SELECT fecha, hora FROM citas ORDER BY fecha, hora", [], function(err, rows) {
    if (err) { console.error(err.message); return res.status(500).json({ error: "Error DB" }); }
    res.json(rows.map(function(r) {
      return { fecha: dateStr(r.fecha), hora: r.hora };
    }));
  });
});

// GET legacy — usado por dashboard e-commetrics
app.get("/fechas-seleccionadas", function(req, res) {
  query("SELECT fecha, hora FROM citas ORDER BY fecha, hora", [], function(err, rows) {
    if (err) { console.error(err.message); return res.status(500).json({ error: "Error DB" }); }
    res.json(rows.map(function(r) {
      return { date: dateStr(r.fecha), hour: String(r.hora).slice(0, 5) };
    }));
  });
});

app.get("/fechas-bloqueadas", function(req, res) {
  query("SELECT id, fecha, hora FROM fechas_bloqueadas ORDER BY fecha, hora", [], function(err, rows) {
    if (err) { console.error(err.message); return res.status(500).json({ error: "Error DB" }); }
    res.json(rows.map(function(r) {
      return { id: r.id, date: dateStr(r.fecha), hour: r.hora };
    }));
  });
});

// POST bloquear fecha — usado por dashboard e-commetrics
app.post("/bloquear-fecha", function(req, res) {
  var d = req.body.date, h = req.body.hour;
  if (!d || !h) return res.status(400).json({ error: "Faltan fecha u hora" });

  query("SELECT id FROM fechas_bloqueadas WHERE fecha=? AND hora=?", [d, h], function(err, rows) {
    if (err) return res.status(500).json({ error: "Error DB" });
    if (rows.length) return res.status(409).json({ error: "Fecha y hora ya bloqueadas" });

    query("INSERT INTO fechas_bloqueadas (fecha, hora) VALUES (?,?)", [d, h], function(err, result) {
      if (err) return res.status(500).json({ error: "Error al guardar" });
      res.status(201).json({ success: true, id: result.insertId });
    });
  });
});

// DELETE desbloquear fecha — usado por dashboard e-commetrics
app.delete("/desbloquear-fecha/:id", function(req, res) {
  var id = req.params.id;
  query("DELETE FROM fechas_bloqueadas WHERE id=?", [id], function(err, result) {
    if (err) return res.status(500).json({ error: "Error DB" });
    if (!result.affectedRows) return res.status(404).json({ error: "No encontrado" });
    res.json({ success: true });
  });
});

// ─── API REST para dashboard (similar a Monge) ───────────────────────

// GET todas las citas
app.get("/api/appointments", function(req, res) {
  query("SELECT id, nombre_paciente AS nombre, telefono, correo, primera_visita, servicio, seguro, fecha, hora, origen, created_at AS fecha_creacion FROM citas ORDER BY fecha, hora", [], function(err, rows) {
    if (err) { console.error(err.message); return res.status(500).json({ error: "Error DB" }); }
    res.json(rows.map(function(r) {
      return {
        id: r.id,
        nombre: r.nombre,
        telefono: r.telefono,
        correo: r.correo,
        primera_visita: r.primera_visita,
        servicio: r.servicio,
        seguro: r.seguro,
        fecha: dateStr(r.fecha),
        hora: String(r.hora).slice(0, 5) + ":00",
        origen: r.origen,
        fecha_creacion: r.fecha_creacion,
      };
    }));
  });
});

// POST crear cita desde dashboard
app.post("/api/appointments-dashboard", function(req, res) {
  var n = req.body.name, t = req.body.phone, e = req.body.email,
      f = req.body.date, h = req.body.time,
      pv = req.body.isFirstVisit ? 1 : 0,
      s = req.body.service || "", sg = req.body.insurance || "Sin seguro",
      o = req.body.origen || "dashboard";

  if (!n || !t || !f || !h) return res.status(400).json({ error: "Faltan campos" });

  query("SELECT id FROM citas WHERE fecha=? AND hora=?", [f, h], function(err, rows) {
    if (err) return res.status(500).json({ error: "Error DB" });
    if (rows.length) return res.status(409).json({ error: "Horario no disponible" });

    query("INSERT INTO citas (nombre_paciente,telefono,correo,fecha,hora,primera_visita,servicio,seguro,origen) VALUES (?,?,?,?,?,?,?,?,?)",
      [n, t, e, f, h, pv, s, sg, o], function(err, result) {
        if (err) return res.status(500).json({ error: "Error al guardar" });
        res.status(201).json({ success: true, id: result.insertId });
      });
  });
});

// PUT actualizar cita
app.put("/api/appointments/:id", function(req, res) {
  var id = req.params.id;
  var n = req.body.name, t = req.body.phone, e = req.body.email,
      f = req.body.date, h = req.body.time,
      pv = req.body.isFirstVisit ? 1 : 0,
      s = req.body.service || "", sg = req.body.insurance || "Sin seguro";

  if (!n || !t || !f || !h) return res.status(400).json({ error: "Faltan campos" });

  query("UPDATE citas SET nombre_paciente=?, telefono=?, correo=?, fecha=?, hora=?, primera_visita=?, servicio=?, seguro=? WHERE id=?",
    [n, t, e, f, h, pv, s, sg, id], function(err, result) {
      if (err) return res.status(500).json({ error: "Error DB" });
      if (!result.affectedRows) return res.status(404).json({ error: "No encontrado" });
      res.json({ success: true });
    });
});

// DELETE eliminar cita
app.delete("/api/appointments/:id", function(req, res) {
  var id = req.params.id;
  query("DELETE FROM citas WHERE id=?", [id], function(err, result) {
    if (err) return res.status(500).json({ error: "Error DB" });
    if (!result.affectedRows) return res.status(404).json({ error: "No encontrado" });
    res.json({ success: true });
  });
});

// POST agendar — español
app.post("/api/citas/agendar", function(req, res) {
  var n = req.body.nombre_paciente, e = req.body.correo,
      t = req.body.telefono, f = req.body.fecha, h = req.body.hora,
      pv = req.body.primera_visita ? 1 : 0,
      s = req.body.servicio || "",
      sg = req.body.seguro || "Sin seguro",
      o = req.body.origen || "web";

  if (!n || !t || !f || !h) return res.status(400).json({ error: "Faltan campos" });

  query("SELECT id FROM citas WHERE fecha=? AND hora=?", [f, h], function(err, rows) {
    if (err) return res.status(500).json({ error: "Error DB" });
    if (rows.length) return res.status(409).json({ error: "Cita no disponible" });

    query("INSERT INTO citas (nombre_paciente,correo,telefono,fecha,hora,primera_visita,servicio,seguro,origen) VALUES (?,?,?,?,?,?,?,?,?)",
      [n, e, t, f, h, pv, s, sg, o], function(err, result) {
        if (err) return res.status(500).json({ error: "Error al guardar" });

        mail.sendMail({
          from: '"Reforma Dental" <' + process.env.EMAIL_USER + '>',
          to: e, cc: [process.env.EMAIL_USER, process.env.EMAIL_CC],
          subject: "Confirmación de tu Cita - Dental Reforma",
          html: htmlES(n, f, h, t),
          attachments: [{ filename:"cita.ics", content: ics(n,f,h,"ES"), contentType:"text/calendar" }],
        }, function(err) { if (err) console.error("Mail error:", err.message); });

        res.status(201).json({ success: true, id: result.insertId });
      });
  }); 
});

// POST agendar — english
app.post("/api/citas/agendar-en", function(req, res) {
  var n = req.body.nombre_paciente, e = req.body.correo,
      t = req.body.telefono, f = req.body.fecha, h = req.body.hora,
      pv = req.body.primera_visita ? 1 : 0,
      s = req.body.servicio || "",
      sg = req.body.seguro || "Sin seguro",
      o = req.body.origen || "web";

  if (!n || !t || !f || !h) return res.status(400).json({ error: "Missing fields" });

  query("SELECT id FROM citas WHERE fecha=? AND hora=?", [f, h], function(err, rows) {
    if (err) return res.status(500).json({ error: "Error DB" });
    if (rows.length) return res.status(409).json({ error: "Not available" });

    query("INSERT INTO citas (nombre_paciente,correo,telefono,fecha,hora,primera_visita,servicio,seguro,origen) VALUES (?,?,?,?,?,?,?,?,?)",
      [n, e, t, f, h, pv, s, sg, o], function(err, result) {
        if (err) return res.status(500).json({ error: "Error saving" });

        mail.sendMail({
          from: '"Reforma Dental" <' + process.env.EMAIL_USER + '>',
          to: e, cc: [process.env.EMAIL_USER, process.env.EMAIL_CC],
          subject: "Appointment Confirmation - Dental Reforma",
          html: htmlEN(n, f, h, t),
          attachments: [{ filename:"appointment.ics", content: ics(n,f,h,"EN"), contentType:"text/calendar" }],
        }, function(err) { if (err) console.error("Mail error:", err.message); });

        res.status(201).json({ success: true, id: result.insertId });
      });
  });
});

// POST legacy — dashboard e-commetrics
app.post("/guardar-datos", function(req, res) {
  var n = req.body.nombre_paciente, e = req.body.correo,
      t = req.body.telefono, f = req.body.fecha, h = req.body.hora;
  if (!n || !t || !f || !h) return res.status(400).json({ error: "Missing fields" });
  query("SELECT id FROM citas WHERE fecha=? AND hora=?", [f, h], function(err, rows) {
    if (err || rows.length) return res.status(err ? 500 : 409).json({ error: err ? "Error DB" : "Not available" });
    query("INSERT INTO citas (nombre_paciente,correo,telefono,fecha,hora) VALUES (?,?,?,?,?)",
      [n, e, t, f, h], function(err, result) {
        if (err) return res.status(500).json({ error: "Error" });
        res.status(201).json({ success: true, id: result.insertId });
      });
  });
});

app.post("/guardar-datos-es", function(req, res) {
  var n = req.body.nombre_paciente, e = req.body.correo,
      t = req.body.telefono, f = req.body.fecha, h = req.body.hora;
  if (!n || !t || !f || !h) return res.status(400).json({ error: "Faltan campos" });
  query("SELECT id FROM citas WHERE fecha=? AND hora=?", [f, h], function(err, rows) {
    if (err || rows.length) return res.status(err ? 500 : 409).json({ error: err ? "Error DB" : "No disponible" });
    query("INSERT INTO citas (nombre_paciente,correo,telefono,fecha,hora) VALUES (?,?,?,?,?)",
      [n, e, t, f, h], function(err, result) {
        if (err) return res.status(500).json({ error: "Error" });
        res.status(201).json({ success: true, id: result.insertId });
      });
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────
//
// Publico y sin datos sensibles (solo booleanos y conteos). Tras subir un
// server.js nuevo:
//   curl -i https://reformadental.com/health
//   -> 200 {"status":"ok",...}  o  503 con la lista "failures"

if (!crmCliMode) {
  app.get("/health", function(req, res) {
    require("./crm/health")
      .checkHealth({ db: db, calendarTables: ["citas", "fechas_bloqueadas"] })
      .then(function(result) {
        res.set("Cache-Control", "no-store");
        res.status(result.code).json(result.body);
      })
      .catch(function(err) {
        res.status(503).json({ status: "fail", failures: [err.message] });
      });
  });
}

// ─── CRM ──────────────────────────────────────────────────────────────────────
//
// Montado al final, DESPUES de las rutas del calendario, para que cualquier ruta
// /crm/* nueva no pise una del calendario. Recibe el pool `db` y el
// transporte `mail` que ya estan definidos arriba: el CRM no abre conexiones
// propias ni duplica credenciales.
//
// allowedOrigins es la MISMA lista que usa el CORS de este archivo. Se pasa
// porque la cookie de sesion del CRM es SameSite=None (el dashboard vive en
// otro dominio) y eso obliga a comprobar el Origin a mano en cada escritura.

if (!crmCliMode) app.use("/crm", require("./crm").mount({ db: db, mail: mail, allowedOrigins: allowedOrigins }));

// ─── Start ────────────────────────────────────────────────────────────────────

if (!crmCliMode) {
  app.listen(PORT, function() {
    console.log("Servidor corriendo en http://localhost:" + PORT);
  });
}
