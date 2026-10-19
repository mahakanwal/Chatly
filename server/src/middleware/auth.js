const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

function signToken(userId) {
  return jwt.sign({ id: String(userId) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not authenticated' });
  try {
    const { id } = verifyToken(token);
    const user = await User.findById(id);
    if (!user || user.isBot || user.isDeleted) return res.status(401).json({ message: 'Account not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired, please log in again' });
  }
}

module.exports = { requireAuth, signToken, verifyToken };
