// peers.js
//
// This is the ONLY file that reads process.env directly. Every other
// file imports NODE_ID / PORT / PEERS from here. That way, if you
// ever change how config is supplied (e.g. move to Docker env vars
// instead of .env files), you only edit this one file.

require('dotenv').config();

const NODE_ID = process.env.NODE_ID;
const PORT = process.env.PORT;

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

module.exports = { NODE_ID, PORT, PEERS };
