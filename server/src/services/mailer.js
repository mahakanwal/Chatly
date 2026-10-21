const config = require('../config');

/**
 * Sends one e-mail through an HTTP API (works on Render's free plan, unlike SMTP).
 * MAIL_PROVIDER=log prints the e-mail in the server logs instead - handy for testing.
 */
async function sendMail({ to, subject, html, text }) {
  const m = config.mail;

  if (m.provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${m.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${m.fromName} <${m.from}>`, to: [to], subject, html, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  if (m.provider === 'brevo') {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': m.brevoKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: m.fromName, email: m.from },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  console.log(`\n========== EMAIL to ${to} ==========\n${subject}\n\n${text}\n==========================================\n`);
}

module.exports = { sendMail };