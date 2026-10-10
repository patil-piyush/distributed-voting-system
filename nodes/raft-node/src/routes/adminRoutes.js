const express = require('express');
const fs = require('fs');
const path = require('path');
const { SHARED_DIR, ADMIN_KEY, CS_HOLD_MS, NODE_ID } = require('../config/peers');
const { requestCS, releaseCS } = require('../mutex/ricartAgrawala');
const raftState = require('../state/raftState');
const clocks = require('../clock/clocks');

const router = express.Router();
const RESULTS_FILE = path.join(SHARED_DIR, 'results-publication.log');

// Make sure the shared directory exists
if (!fs.existsSync(SHARED_DIR)) {
  fs.mkdirSync(SHARED_DIR, { recursive: true });
}

// Middleware to check admin key
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'unauthorized' });
  }
  next();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

router.post('/publish-results', requireAdmin, async (req, res) => {
  try {
    // 1. Request critical section
    await requestCS();

    try {
      // 2. Critical Section begins
      const lamport = clocks.snapshot().lamport;
      const beginLine = `BEGIN node=${NODE_ID} lamport=${lamport} t=${new Date().toISOString()}\n`;
      fs.appendFileSync(RESULTS_FILE, beginLine);

      // 3. Sleep to simulate work and hold the CS
      await sleep(CS_HOLD_MS);

      // 4. Append tally and end marker
      const tally = raftState.getTallySnapshot();
      const endLine = `${JSON.stringify(tally)}\nEND node=${NODE_ID}\n`;
      fs.appendFileSync(RESULTS_FILE, endLine);

      res.json({ ok: true, node: NODE_ID, message: 'results published' });
    } finally {
      // 5. Release critical section
      releaseCS();
    }
  } catch (error) {
    console.error('Error publishing results:', error);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/mutex-log', (req, res) => {
  if (!fs.existsSync(RESULTS_FILE)) {
    return res.type('text/plain').send('File not found');
  }
  const content = fs.readFileSync(RESULTS_FILE, 'utf8');
  res.type('text/plain').send(content);
});

module.exports = router;
