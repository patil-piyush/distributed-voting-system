// authMiddleware.js
//
// Protects routes that require a logged-in voter. On success, attaches
// req.voter = { voterId, name } so downstream handlers know who's
// making the request without trusting anything from the request body.

const { verifyToken } = require('./authService');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'missing auth token' });

  const result = verifyToken(token);
  if (!result.ok) return res.status(401).json({ error: result.error });

  req.voter = result.payload;
  next();
}

module.exports = { requireAuth };
