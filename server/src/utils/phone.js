const { parsePhoneNumberFromString } = require('libphonenumber-js');

/**
 * Normalizes a phone number to E.164 (+923001234567).
 * defaultCountry is an ISO code (e.g. "PK") used for local numbers like 03001234567.
 */
function toE164(raw, defaultCountry) {
  if (!raw || typeof raw !== 'string') return null;
  let input = raw.trim().replace(/[^\d+]/g, '');
  if (input.startsWith('00')) input = `+${input.slice(2)}`;
  const parsed = parsePhoneNumberFromString(input, defaultCountry || undefined);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

function countryOf(e164) {
  const parsed = parsePhoneNumberFromString(e164 || '');
  return parsed ? parsed.country : undefined;
}

module.exports = { toE164, countryOf };
