// peerClient.js
//
// Thin wrapper for outbound calls to other nodes. A dead or slow peer
// is a NORMAL, expected event in this system — this never throws, it
// always resolves to { ok: true/false } so callers can just skip
// unreachable peers instead of crashing.

const axios = require('axios');
const { FORWARD_TIMEOUT_MS, RPC_TIMEOUT_MS, NODE_ID } = require('../config/peers');

const REQUEST_TIMEOUT_MS = RPC_TIMEOUT_MS;

async function post(url, path, payload, headers = {}) {
  try {
    const response = await axios.post(`${url}${path}`, payload, {
      timeout: REQUEST_TIMEOUT_MS,
      headers,
    });
    return { ok: true, data: response.data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function sendRequestVote(peerUrl, payload) {
  return post(peerUrl, '/rpc/request-vote', payload);
}

function sendAppendEntries(peerUrl, payload) {
  return post(peerUrl, '/rpc/append-entries', payload);
}

// authHeader is the raw "Bearer <token>" string from the original
// voter's request — forwarded as-is so the leader can identify the
// voter itself, rather than trusting a plain voterId in the body.
// x-forwarded-by-node tells the leader this is a trusted peer forward.
function forwardVote(leaderUrl, payload, authHeader) {
  const headers = { 'x-forwarded-by-node': NODE_ID };
  if (authHeader) headers.Authorization = authHeader;
  return axios.post(`${leaderUrl}/vote`, payload, {
    timeout: FORWARD_TIMEOUT_MS,
    headers,
    validateStatus: () => true // Resolve for any HTTP status, don't throw on 4xx/5xx
  }).then(response => {
    return { ok: true, status: response.status, data: response.data };
  }).catch(err => {
    return { ok: false, error: err.message };
  });
}

module.exports = { sendRequestVote, sendAppendEntries, forwardVote };
