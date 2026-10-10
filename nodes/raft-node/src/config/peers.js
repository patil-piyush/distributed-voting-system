// peers.js
//
// This is the ONLY file that reads process.env directly. Every other
// file imports NODE_ID / PORT / PEERS from here. That way, if you
// ever change how config is supplied (e.g. move to Docker env vars
// instead of .env files), you only edit this one file.

require('dotenv').config();

const NODE_ID = process.env.NODE_ID;
const PORT = process.env.PORT;
const DATA_DIR = process.env.DATA_DIR || './data';
const PERSIST = process.env.PERSIST !== 'false';
const FORWARD_TIMEOUT_MS = parseInt(process.env.FORWARD_TIMEOUT_MS, 10) || 3000;
const ELECTION_TIMEOUT_MIN_MS = parseInt(process.env.ELECTION_TIMEOUT_MIN_MS, 10) || 150;
const ELECTION_TIMEOUT_MAX_MS = parseInt(process.env.ELECTION_TIMEOUT_MAX_MS, 10) || 300;
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS, 10) || 50;
const RPC_TIMEOUT_MS = parseInt(process.env.RPC_TIMEOUT_MS, 10) || 50;

const SHARED_DIR = process.env.SHARED_DIR || './shared';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-demo-key';
const CS_HOLD_MS = parseInt(process.env.CS_HOLD_MS, 10) || 1500;
const RA_TIMEOUT_MS = parseInt(process.env.RA_TIMEOUT_MS, 10) || 2000;

// PEERS is a comma-separated list of "id@url" pairs, e.g.:
// node2@http://localhost:5002,node3@http://localhost:5003
// We split on '@' (not ':') because the url itself contains colons.
const PEERS = (process.env.PEERS || '')
  .split(',')
  .filter(Boolean)
  .map((entry) => {
    const [id, url] = entry.split('@');
    return { id, url };
  });

if (!NODE_ID || !PORT) {
  throw new Error(
    'NODE_ID and PORT are not set. Run this via one of the ' +
    'npm scripts, e.g. "npm run start:node1", which loads the ' +
    'matching .env.nodeN file.'
  );
}

module.exports = { 
  NODE_ID, 
  PORT, 
  PEERS, 
  DATA_DIR, 
  PERSIST, 
  FORWARD_TIMEOUT_MS,
  ELECTION_TIMEOUT_MIN_MS,
  ELECTION_TIMEOUT_MAX_MS,
  HEARTBEAT_INTERVAL_MS,
  RPC_TIMEOUT_MS,
  SHARED_DIR,
  ADMIN_KEY,
  CS_HOLD_MS,
  RA_TIMEOUT_MS
};
