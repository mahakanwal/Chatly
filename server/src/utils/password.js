const crypto = require('crypto');

/** Password hashing with Node's built-in scrypt (no extra dependency). Format: scrypt$salt$hash */
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt.toString('hex')}$${key.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const [scheme, saltHex, hashHex] = String(stored || '').split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return resolve(false);
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), 64, (err, key) => {
      if (err) return resolve(false);
      const expected = Buffer.from(hashHex, 'hex');
      resolve(expected.length === key.length && crypto.timingSafeEqual(expected, key));
    });
  });
}

module.exports = { hashPassword, verifyPassword };