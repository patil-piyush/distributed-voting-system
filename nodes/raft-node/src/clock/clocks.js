// clocks.js
//
// Logical clocks (Lamport + vector) that track causal relationships
// between vote events. Clocks tick ONLY on vote-related events —
// heartbeats, RequestVote RPCs, and empty AppendEntries do not tick
// or carry clock data, keeping the stamps readable and meaningful.
//
// API:
//   localEvent()           — tick both clocks, return snapshot
//   onReceive(remote)      — merge with remote, tick, return snapshot
//   snapshot()             — current values without ticking
//   compareVectors(a, b)   — 'before' | 'after' | 'equal' | 'concurrent'

const { NODE_ID, PEERS } = require('../config/peers');
const raftState = require('../state/raftState');

// Vector keys are all node ids, sorted for deterministic ordering.
const allNodeIds = [NODE_ID, ...PEERS.map((p) => p.id)].sort();

let lamport = 0;
const vector = {};
for (const id of allNodeIds) {
  vector[id] = 0;
}

// On startup, initialise from the persisted log so that a restarted
// node's Lamport value continues upward instead of resetting.
const state = raftState.getState();
for (const entry of state.log) {
  const cmd = entry.command;
  // Scan all clock stamps stored inside each entry's command.
  for (const key of ['receivedClock', 'appendClock', 'commitClock']) {
    if (cmd && cmd[key]) {
      if (cmd[key].lamport > lamport) {
        lamport = cmd[key].lamport;
      }
      if (cmd[key].vector && cmd[key].vector[NODE_ID] > vector[NODE_ID]) {
        vector[NODE_ID] = cmd[key].vector[NODE_ID];
      }
    }
  }
}

function snapshot() {
  return { lamport, vector: { ...vector } };
}

function localEvent() {
  lamport += 1;
  vector[NODE_ID] += 1;
  return snapshot();
}

function onReceive(remote) {
  // Merge Lamport: max of local and remote, then +1.
  lamport = Math.max(lamport, remote.lamport || 0) + 1;
  // Merge vector: element-wise max, then tick own component.
  if (remote.vector) {
    for (const id of allNodeIds) {
      vector[id] = Math.max(vector[id] || 0, remote.vector[id] || 0);
    }
  }
  vector[NODE_ID] += 1;
  return snapshot();
}

// Compare two vector clocks. Returns:
//   'equal'      — identical
//   'before'     — a happened-before b
//   'after'      — a happened-after b
//   'concurrent' — neither happened-before the other
function compareVectors(a, b) {
  let aBeforeB = false; // at least one component where a < b
  let bBeforeA = false; // at least one component where b < a
  // Collect all keys from both vectors.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    if (va < vb) aBeforeB = true;
    if (va > vb) bBeforeA = true;
  }
  if (!aBeforeB && !bBeforeA) return 'equal';
  if (aBeforeB && !bBeforeA) return 'before';
  if (!aBeforeB && bBeforeA) return 'after';
  return 'concurrent';
}

module.exports = { localEvent, onReceive, snapshot, compareVectors };
