// debugRoutes.js
//
// Read-only diagnostic endpoint exposing comprehensive telemetry state
// unauthenticated, like /audit.

const express = require('express');
const raftState = require('../state/raftState');
const { NODE_ID, PEERS } = require('../config/peers');
const metrics = require('../telemetry/metrics');
const clocks = require('../clock/clocks');
const ricartAgrawala = require('../mutex/ricartAgrawala');

const router = express.Router();

router.get('/state', (req, res) => {
  const state = raftState.getState();
  const telState = metrics.getTelemetryState();

  const lastLogIndex = state.log.length - 1;
  const lastLogTerm = lastLogIndex >= 0 ? state.log[lastLogIndex].term : 0;

  // voteCount: committed non-noop entries
  let voteCount = 0;
  const limit = Math.min(state.commitIndex, lastLogIndex);
  for (let i = 0; i <= limit; i++) {
    const entry = state.log[i];
    if (entry && entry.command && entry.command.type !== 'noop' && entry.command.voterId) {
      voteCount++;
    }
  }

  // logTail: last 25 entries as {index, term, kind:'noop'|'vote', voterId, choice, committed:boolean}
  const startIndex = Math.max(0, state.log.length - 25);
  const logTail = state.log.slice(startIndex).map((e) => ({
    index: e.index,
    term: e.term,
    kind: e.command?.type === 'noop' ? 'noop' : 'vote',
    voterId: e.command?.voterId || null,
    choice: e.command?.candidateChoice || null,
    committed: e.index <= state.commitIndex,
  }));

  // replication (leader only): per follower {nextIndex, matchIndex, lag}
  let replication = null;
  if (state.role === raftState.ROLES.LEADER) {
    replication = {};
    const nextIndexMap = raftState.getNextIndex() || {};
    const matchIndexMap = raftState.getMatchIndex() || {};
    for (const peer of PEERS) {
      const nextIndex = nextIndexMap[peer.id] ?? 0;
      const matchIndex = matchIndexMap[peer.id] ?? -1;
      const lag = Math.max(0, lastLogIndex - matchIndex);
      replication[peer.id] = {
        nextIndex,
        matchIndex,
        lag,
      };
    }
  }

  const debugState = {
    nodeId: NODE_ID,
    role: state.role,
    term: state.currentTerm,
    votedFor: state.votedFor,
    leaderId: state.currentLeaderId,
    uptimeSec: telState.uptimeSec,
    commitIndex: state.commitIndex,
    lastLogIndex,
    lastLogTerm,
    voteCount,
    logTail,
    replication,
    counters: telState.counters,
    lastHeartbeatAgoMs: telState.lastHeartbeatAgoMs,
    persist: {
      bytes: telState.persistedFileSize,
      lastSavedAt: telState.lastPersistAt,
    },
    clock: clocks.snapshot(),
    mutex: ricartAgrawala.getMutexState ? ricartAgrawala.getMutexState() : 'RELEASED',
  };

  res.json(debugState);
});

module.exports = router;
