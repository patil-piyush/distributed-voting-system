// metrics.js
//
// In-memory telemetry metrics and cluster-event emitter for passive telemetry.
// Read-only and non-throwing: no Raft or consensus logic mutations.

const { NODE_ID } = require('../config/peers');
const raftState = require('../state/raftState');
const { emitUpdate } = require('../realtime/socketServer');

const startedAt = Date.now();

const counters = {
  electionsStarted: 0,
  electionsWon: 0,
  votesGranted: 0,
  votesDenied: 0,
  appendSent: 0,
  appendReceived: 0,
  appendFailed: 0,
  heartbeatsReceived: 0,
  forwardedVotes: 0,
  votes200: 0,
  votes202: 0,
  votes409: 0,
};

// Ring buffer of last 200 events
const MAX_EVENTS = 200;
const events = [];

let lastHeartbeatAt = null;
let leaderSinceTerm = null;
let lastPersistAt = null;
let persistedFileSize = 0;

function inc(name) {
  try {
    if (counters[name] !== undefined) {
      counters[name] += 1;
    } else {
      counters[name] = 1;
    }
  } catch (_) {}
}

function event(type, detail = {}) {
  try {
    const term = raftState.getState?.()?.currentTerm ?? 0;
    const item = {
      at: new Date().toISOString(),
      nodeId: NODE_ID,
      type,
      term,
      detail,
    };

    events.push(item);
    if (events.length > MAX_EVENTS) {
      events.shift();
    }

    emitUpdate('cluster-event', item);
    return item;
  } catch (_) {}
}

function trackHeartbeat() {
  try {
    lastHeartbeatAt = Date.now();
  } catch (_) {}
}

function setLeaderSinceTerm(term) {
  try {
    leaderSinceTerm = term;
  } catch (_) {}
}

function trackPersist(bytes) {
  try {
    lastPersistAt = new Date().toISOString();
    persistedFileSize = bytes;
  } catch (_) {}
}

function getCounters() {
  return { ...counters };
}

function getEvents() {
  return [...events];
}

function getTelemetryState() {
  return {
    startedAt,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    counters: getCounters(),
    lastHeartbeatAt,
    lastHeartbeatAgoMs: lastHeartbeatAt ? Date.now() - lastHeartbeatAt : null,
    leaderSinceTerm,
    lastPersistAt,
    persistedFileSize,
  };
}

module.exports = {
  inc,
  event,
  trackHeartbeat,
  setLeaderSinceTerm,
  trackPersist,
  getCounters,
  getEvents,
  getTelemetryState,
};
