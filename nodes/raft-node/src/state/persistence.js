// persistence.js
//
// Handles saving and loading the raft state to/from a local file.

const fs = require('fs');
const path = require('path');
const { NODE_ID, DATA_DIR, PERSIST } = require('../config/peers');

const metrics = require('../telemetry/metrics');

if (PERSIST && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const filePath = path.join(DATA_DIR, `${NODE_ID}.json`);
if (PERSIST && fs.existsSync(filePath)) {
  try {
    const stat = fs.statSync(filePath);
    metrics.trackPersist(stat.size);
  } catch (_) {}
}

function save(state) {
  if (!PERSIST) return;
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  const data = JSON.stringify({
    currentTerm: state.currentTerm,
    votedFor: state.votedFor,
    log: state.log,
    commitIndex: state.commitIndex,
  });
  // Write synchronously because state must be durable before we answer an RPC
  fs.writeFileSync(tempPath, data, 'utf8');
  fs.renameSync(tempPath, filePath);
  try { metrics.trackPersist(Buffer.byteLength(data, 'utf8')); } catch (_) {}
}

function load() {
  if (!PERSIST || !fs.existsSync(filePath)) return null;
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.warn(`[${NODE_ID}] corrupt state file found, backing it up`);
    const corruptPath = `${filePath}.corrupt-${Date.now()}`;
    fs.renameSync(filePath, corruptPath);
    return null;
  }
}

module.exports = { save, load };
