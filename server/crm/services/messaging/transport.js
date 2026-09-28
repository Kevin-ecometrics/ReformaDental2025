// Where the shared SMTP transport lives.
//
// The calendar already has a nodemailer transport built from EMAIL_HOST /
// EMAIL_USER / EMAIL_PASS and verified at boot (server.js line 65). The CRM
// reuses that exact transport rather than opening a second connection with the
// same credentials -- server.js passes it in via mount({ mail }) and it lands
// here.
//
// Separate module, not index.js, because email.js needs it and index.js already
// requires email.js: putting it in index.js would be circular.

let mailTransport = null;

/**
 * @param {import('nodemailer').Transporter|null} transport
 */
function setMailTransport(transport) {
  mailTransport = transport || null;
}

/**
 * @returns {import('nodemailer').Transporter|null} null if the calendar's
 *   transport was not injected (e.g. the module is used standalone).
 */
function getMailTransport() {
  return mailTransport;
}

module.exports = { setMailTransport, getMailTransport };
