const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set([
  'admin', 'administrator', 'support', 'help', 'chatly', 'moderator', 'mod', 'system', 'root',
  'ai', 'assistant', 'official', 'staff', 'team', 'security', 'verified',
]);

const normalizeEmail = (v) => String(v || '').trim().toLowerCase();
const normalizeUsername = (v) => String(v || '').trim().toLowerCase().replace(/^@/, '');

/** Returns an error message, or null when the username is fine. */
function usernameError(username) {
  if (!USERNAME_RE.test(username)) return 'Username must be 3-20 characters: letters, numbers and underscore only';
  if (RESERVED.has(username)) return 'This username is not available';
  return null;
}

/** Returns an error message, or null when the password is fine. */
function passwordError(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 72) return 'Password is too long';
  return null;
}

module.exports = { EMAIL_RE, normalizeEmail, normalizeUsername, usernameError, passwordError };