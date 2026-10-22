// server/src/utils/emailTemplate.js
// Branded OTP e-mail (HTML + plain-text). Table layout + inline styles so it renders in Gmail, Outlook, Apple Mail.
// Usage:
//   const { renderOtpEmail } = require('./emailTemplate');
//   const { subject, html, text } = renderOtpEmail({ code: '482913', name: 'Ali', purpose: 'verify' });

const BRAND = {
  name: process.env.APP_NAME || 'Chatly',
  color: '#E8473F',      // Chatly theme accent (app/src/theme.js: accent) — header + code + links
  colorSoft: '#FDECEA',  // soft Chatly-red tint for the code box background
  supportEmail: process.env.SUPPORT_EMAIL || 'support@chatly.com', // default; override with SUPPORT_EMAIL in .env if needed
  website: '',           // optional, e.g. 'https://yourdomain.com'
};

const COPY = {
  verify: {
    subject: (code) => `${code} is your ${BRAND.name} verification code`,
    title: 'Verify your email',
    intro: `Welcome to ${BRAND.name}! Enter this code in the app to finish creating your account.`,
  },
  reset: {
    subject: (code) => `${code} is your ${BRAND.name} password reset code`,
    title: 'Reset your password',
    intro: 'We received a request to reset your password. Enter this code in the app to choose a new one.',
  },
  login: {
    subject: (code) => `${code} is your ${BRAND.name} login code`,
    title: 'Your login code',
    intro: 'Use this code to log in to your account.',
  },
};

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderOtpEmail({ code, name = '', purpose = 'verify', expiresInMinutes = 10 }) {
  const c = COPY[purpose] || COPY.verify;
  const safeCode = esc(code);
  const greeting = name ? `Hi ${esc(name)},` : 'Hi,';
  const textGreeting = name ? `Hi ${name},` : 'Hi,';
  const subject = c.subject(code);
  const preheader = `Your code is ${code}. It expires in ${expiresInMinutes} minutes.`;
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bg { background-color: #0f1417 !important; }
    .card { background-color: #1a2125 !important; }
    .txt { color: #e6ebee !important; }
    .muted { color: #9aa7ae !important; }
    .codebox { background-color: #3D1713 !important; }
    .code { color: #FF9A90 !important; }
    .hr { border-color: #2b353a !important; }
  }
  @media only screen and (max-width: 480px) {
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .code { font-size: 32px !important; letter-spacing: 6px !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#f4f5f7;">
<!-- preheader (inbox preview text) -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background-color:#f4f5f7;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <!-- brand -->
        <tr>
          <td align="center" style="padding:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;color:${BRAND.color};letter-spacing:0.3px;">
            &#128172; ${esc(BRAND.name)}
          </td>
        </tr>
        <!-- card -->
        <tr>
          <td class="card px" style="background-color:#ffffff;border-radius:16px;padding:36px 36px 32px 36px;font-family:Arial,Helvetica,sans-serif;">
            <h1 class="txt" style="margin:0 0 12px 0;font-size:22px;line-height:28px;color:#14202a;">${esc(c.title)}</h1>
            <p class="txt" style="margin:0 0 6px 0;font-size:15px;line-height:23px;color:#33424d;">${greeting}</p>
            <p class="txt" style="margin:0 0 24px 0;font-size:15px;line-height:23px;color:#33424d;">${esc(c.intro)}</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" class="codebox" style="background-color:${BRAND.colorSoft};border-radius:12px;padding:22px 10px;">
                  <div class="code" style="font-family:'Courier New',Courier,monospace;font-size:38px;line-height:44px;font-weight:700;letter-spacing:10px;color:${BRAND.color};padding-left:10px;">${safeCode}</div>
                </td>
              </tr>
            </table>

            <p class="muted" style="margin:18px 0 0 0;font-size:13px;line-height:20px;color:#5d6b75;text-align:center;">
              This code expires in <strong>${expiresInMinutes} minutes</strong>.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
              <tr><td class="hr" style="border-top:1px solid #e6e9ec;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
            </table>

            <p class="muted" style="margin:18px 0 0 0;font-size:13px;line-height:20px;color:#5d6b75;">
              <strong>Never share this code</strong> with anyone. ${esc(BRAND.name)} will never ask you for it.<br>
              If you didn&rsquo;t request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td align="center" class="muted" style="padding:20px 10px 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#8a96a0;">
            Need help? <a href="mailto:${esc(BRAND.supportEmail)}" style="color:${BRAND.color};text-decoration:none;">${esc(BRAND.supportEmail)}</a><br>
            &copy; ${year} ${esc(BRAND.name)}. All rights reserved.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    `${BRAND.name} - ${c.title}`,
    '',
    textGreeting,
    c.intro,
    '',
    `Your code: ${code}`,
    `It expires in ${expiresInMinutes} minutes.`,
    '',
    `Never share this code with anyone. ${BRAND.name} will never ask you for it.`,
    "If you didn't request this, you can safely ignore this email.",
    '',
    `Need help? ${BRAND.supportEmail}`,
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderOtpEmail, BRAND };