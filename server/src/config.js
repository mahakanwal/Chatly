require('dotenv').config();

// "twilio" = real SMS via Twilio Verify
// "log"    = free testing mode: a real random code is generated and printed in the server logs
const otpProvider = (process.env.OTP_PROVIDER || 'twilio').toLowerCase();

const required = [
  'MONGODB_URI',
  'JWT_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'AI_API_KEY',
];
if (otpProvider === 'twilio') {
  required.push('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID');
}
if (otpProvider === 'whatsapp') {
  required.push('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE_NAME');
}

// Backwards compatible with the earlier OPENAI_* variable names
process.env.AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in every value.');
  process.exit(1);
}

const truthy = (v, fallback) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

module.exports = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  otpProvider,
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME,
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  // Any OpenAI-compatible API: OpenAI, Groq (free), Gemini (free)
  ai: {
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL || undefined, // empty = OpenAI
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    vision: truthy(process.env.AI_VISION, false), // can the model read images? default OFF — set true only for vision models (GPT-4o, Gemini)
    transcribeModel: process.env.AI_TRANSCRIBE_MODEL ?? process.env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1', // empty = off
    assistantName: process.env.AI_ASSISTANT_NAME || 'AI Assistant',
  },
  review: {
    phone: process.env.REVIEW_PHONE || '',
    code: process.env.REVIEW_CODE || '',
  },
  // Agora voice/video calls. App Certificate is only needed when the Agora project uses "Secure mode" (tokens).
  agora: {
    appId: process.env.AGORA_APP_ID || '',
    appCertificate: process.env.AGORA_APP_CERTIFICATE || '',
  },
  maxUploadBytes: (Number(process.env.MAX_UPLOAD_MB) || 50) * 1024 * 1024,
};