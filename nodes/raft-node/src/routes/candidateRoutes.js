// candidateRoutes.js

const express = require('express');
const { CANDIDATES } = require('../data/candidates');

const router = express.Router();

router.get('/candidates', (req, res) => {
  res.json(CANDIDATES);
});

module.exports = router;
