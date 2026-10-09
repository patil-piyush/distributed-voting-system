// authRoutes.js

const express = require('express');
const { login } = require('../auth/authService');

const router = express.Router();

router.post('/login', (req, res) => {
  const { voterId, password } = req.body;
  if (!voterId || !password) {
    return res.status(400).json({ error: 'voterId and password are required' });
  }
  const result = login(voterId, password);
  if (!result.ok) return res.status(401).json({ error: result.error });
  res.json({ token: result.token });
});

module.exports = router;
