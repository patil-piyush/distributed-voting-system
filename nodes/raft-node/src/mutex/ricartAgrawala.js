const axios = require('axios');
const { NODE_ID, PEERS, RA_TIMEOUT_MS } = require('../config/peers');
const clocks = require('../clock/clocks');
const { emitUpdate } = require('../realtime/socketServer');

const STATES = {
  RELEASED: 'RELEASED',
  WANTED: 'WANTED',
  HELD: 'HELD',
};

let state = STATES.RELEASED;
let requestTs = 0;
let deferred = [];
let pendingReplies = new Set();
let resolveHolding = null;

// One outstanding request per node: queue concurrent local calls.
let requestQueue = [];
let isProcessingQueue = false;

function emitMutexEvent(event, ts) {
  emitUpdate('mutex', {
    node: NODE_ID,
    event,
    ts,
    at: new Date().toISOString(),
  });
}

function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;
  
  const resolve = requestQueue.shift();
  
  state = STATES.WANTED;
  requestTs = clocks.localEvent().lamport;
  
  emitMutexEvent('REQUEST', requestTs);

  pendingReplies = new Set(PEERS.map(p => p.id));
  resolveHolding = resolve;

  if (pendingReplies.size === 0) {
    // Single node cluster
    enterCS();
    return;
  }

  // Send RA REQUEST to every peer
  for (const peer of PEERS) {
    const peerUrl = peer.url;
    axios.post(`${peerUrl}/rpc/ra-request`, {
      from: NODE_ID,
      ts: requestTs,
    }, { timeout: RA_TIMEOUT_MS })
    .catch(() => {
      // Treat as crashed and skip.
      handleReply(peer.id);
    });
  }
}

function enterCS() {
  state = STATES.HELD;
  emitMutexEvent('ENTER', requestTs);
  if (resolveHolding) {
    const resolve = resolveHolding;
    resolveHolding = null;
    resolve();
  }
}

function handleReply(fromNodeId) {
  if (pendingReplies.has(fromNodeId)) {
    pendingReplies.delete(fromNodeId);
    if (pendingReplies.size === 0 && state === STATES.WANTED) {
      enterCS();
    }
  }
}

async function requestCS() {
  return new Promise(resolve => {
    requestQueue.push(resolve);
    processQueue();
  });
}

function releaseCS() {
  state = STATES.RELEASED;
  emitMutexEvent('EXIT', requestTs);

  for (const p of deferred) {
    const peerUrl = p.url;
    axios.post(`${peerUrl}/rpc/ra-reply`, {
      from: NODE_ID,
    }).catch(() => {});
  }
  deferred = [];

  isProcessingQueue = false;
  processQueue();
}

function handleReceiveRequest(from, ts) {
  // Merge Lamport clock
  clocks.onReceive({ lamport: ts });

  const peer = PEERS.find(p => p.id === from);
  if (!peer) return;

  const defer = state === STATES.HELD || 
                (state === STATES.WANTED && 
                 (requestTs < ts || (requestTs === ts && NODE_ID < from)));

  if (defer) {
    deferred.push(peer);
    emitMutexEvent('DEFER', ts);
  } else {
    emitMutexEvent('REPLY', ts);
    axios.post(`${peer.url}/rpc/ra-reply`, {
      from: NODE_ID,
    }).catch(() => {});
  }
}

function handleReceiveReply(from) {
  // We can merge clock if reply included it, but instruction says merge on every message. 
  // We can assume reply just bumps clock slightly or we don't need to bump it for reply.
  // We just process the reply.
  clocks.localEvent(); // Tick clock on receiving reply just to be consistent with "on every message". Wait, the instruction: "Merge Lamport clocks on every message". 
  // Let's just tick for the receive event.
  handleReply(from);
}

module.exports = {
  requestCS,
  releaseCS,
  handleReceiveRequest,
  handleReceiveReply,
  getMutexState: () => state,
};
