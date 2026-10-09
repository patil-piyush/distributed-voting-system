// authService.js
//
// Login is checked against the static local registry (data/voters.js)
// — it does NOT go through Raft, since eligibility data is identical
// on every node already. Only the resulting VOTE needs consensus,
// not the login check itself.

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { findVoter } = require('../data/voters');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_EXPIRY = '15m';

function login(voterId, password) {
  const voter = findVoter(voterId);
  if (!voter) return { ok: false, error: 'voter not recognized' };

  const passwordMatches = bcrypt.compareSync(password, voter.passwordHash);
  if (!passwordMatches) return { ok: false, error: 'incorrect password' };

  const token = jwt.sign(
    { voterId: voter.voterId, name: voter.name },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
  return { ok: true, token };
}

function verifyToken(token) {
  try {
    return { ok: true, payload: jwt.verify(token, JWT_SECRET) };
  } catch (err) {
    return { ok: false, error: 'invalid or expired token' };
  }
}

module.exports = { login, verifyToken };
