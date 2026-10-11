// appendEntries.js
//
// Two responsibilities live here:
//   1. Leader side: sendAppendEntriesToAll / startLeaderHeartbeats /
//      leaderAppendAndReplicate — sending heartbeats and replicating
//      new log entries to followers.
//   2. Follower side: handleAppendEntries — reacting to heartbeats
//      or entries we receive from a leader.
//
// Both sides push live updates over Socket.io so the dashboard stays
// in sync without polling.

const raftState = require('../state/raftState');
const timers = require('../election/timers');
const peerClient = require('./peerClient');
const { emitUpdate } = require('../realtime/socketServer');
const { NODE_ID, PEERS } = require('../config/peers');
const clocks = require('../clock/clocks');
const metrics = require('../telemetry/metrics');

async function sendAppendEntriesToAll() {
  const state = raftState.getState();
  if (state.role !== raftState.ROLES.LEADER) return;

  metrics.inc('appendSent');
  const currentTerm = state.currentTerm;
  const nextIndexMap = raftState.getNextIndex();
  
  const requests = PEERS.map((peer) => {
    const peerNextIndex = nextIndexMap[peer.id];
    const prevLogIndex = peerNextIndex - 1;
    const prevLogTerm = (prevLogIndex >= 0 && prevLogIndex < state.log.length) 
                        ? state.log[prevLogIndex].term : 0;
    const entries = state.log.slice(peerNextIndex);

    // Only tick the clock if we're actually sending entries, not for
    // empty heartbeats.
    const clock = entries.length > 0 ? clocks.localEvent() : undefined;

    const payload = {
      term: currentTerm,
      leaderId: NODE_ID,
      prevLogIndex,
      prevLogTerm,
      entries,
      leaderCommitIndex: state.commitIndex,
      clock,
    };
    return peerClient.sendAppendEntries(peer.url, payload).then(result => ({ peer, result }));
  });

  const results = await Promise.allSettled(requests);

  const afterState = raftState.getState();
  if (afterState.role !== raftState.ROLES.LEADER || afterState.currentTerm !== currentTerm) {
    return;
  }

  const matchIndexMap = raftState.getMatchIndex();

  for (let i = 0; i < results.length; i++) {
    const settled = results[i];
    const peer = PEERS[i];
    if (settled.status !== 'fulfilled' || !settled.value.result.ok) {
      metrics.inc('appendFailed');
      metrics.event('append-failed', { peerId: peer.id });
      continue;
    }
    
    const { result } = settled.value;
    const { term, success, matchIndex, conflictIndex } = result.data;

    if (term > afterState.currentTerm) {
      raftState.becomeFollower(term);
      metrics.setLeaderSinceTerm(null); metrics.event('stepped-down', { toTerm: term });
      timers.stopHeartbeatTimer();
      timers.resetElectionTimer(require('./requestVote').startElection);
      emitUpdate('status', raftState.getStatusSnapshot(NODE_ID));
      return; // Stop processing, we are no longer leader
    }

    if (success) {
      matchIndexMap[peer.id] = Math.max(matchIndexMap[peer.id] || -1, matchIndex);
      nextIndexMap[peer.id] = matchIndexMap[peer.id] + 1;
      // If they returned a clock (meaning we sent them entries, not
      // just a heartbeat), merge it back in.
      if (result.data.clock) {
        clocks.onReceive(result.data.clock);
      }
    } else if (conflictIndex !== undefined) {
      nextIndexMap[peer.id] = Math.max(0, Math.min(nextIndexMap[peer.id], conflictIndex));
    }
  }

  const clusterSize = PEERS.length + 1;
  const majority = Math.floor(clusterSize / 2) + 1;
  let newlyCommitted = [];

  for (let N = afterState.commitIndex + 1; N < afterState.log.length; N++) {
    if (afterState.log[N].term === currentTerm) {
      let acks = 1;
      for (const peer of PEERS) {
        if (matchIndexMap[peer.id] >= N) acks++;
      }
      if (acks >= majority) {
        raftState.updateCommitIndex(N);
        newlyCommitted.push({ entry: afterState.log[N], acks });
      }
    }
  }

  if (newlyCommitted.length > 0) {
    metrics.event('commit-advanced', { commitIndex: raftState.getState().commitIndex });
    for (const { entry, acks } of newlyCommitted) {
      if (entry.command.type === 'noop') continue;
      const commitClock = clocks.localEvent();
      console.log(`[${NODE_ID}] committed entry ${entry.index} (${acks}/${clusterSize} acks)`);
      emitUpdate('vote-activity', {
        voterId: entry.command.voterId,
        candidateChoice: entry.command.candidateChoice,
        receivedByNode: entry.command.receivedByNode,
        handledByNode: NODE_ID,
        acks,
        clusterSize,
        committedAt: Date.now(),
        receivedClock: entry.command.receivedClock,
        appendClock: entry.command.appendClock,
        commitClock,
        index: entry.index,
      });
    }
    emitUpdate('tally', raftState.getTallySnapshot());
    emitUpdate('status', raftState.getStatusSnapshot(NODE_ID));
  }
}

function startLeaderHeartbeats() {
  timers.startHeartbeatTimer(() => sendAppendEntriesToAll());
}

async function leaderAppendAndReplicate(command) {
  const entry = raftState.appendLogEntry(command);
  await sendAppendEntriesToAll();
  return { entry, committed: raftState.getState().commitIndex >= entry.index };
}

function handleAppendEntries({ term, leaderId, prevLogIndex, prevLogTerm, entries, leaderCommitIndex, clock }) {
  const state = raftState.getState();

  if (term < state.currentTerm) {
    return { term: state.currentTerm, success: false };
  }

  raftState.becomeFollower(term, leaderId);
  metrics.trackHeartbeat();
  if (entries.length === 0) {
    metrics.inc('heartbeatsReceived');
  } else {
    metrics.inc('appendReceived');
    metrics.event('append-received', { count: entries.length, leaderId });
  }

  timers.stopHeartbeatTimer();
  timers.resetElectionTimer(require('./requestVote').startElection);

  if (prevLogIndex >= 0) {
    if (state.log.length <= prevLogIndex) {
      return { term: state.currentTerm, success: false, conflictIndex: state.log.length };
    }
    if (state.log[prevLogIndex].term !== prevLogTerm) {
      return { term: state.currentTerm, success: false, conflictIndex: prevLogIndex };
    }
  }

  let truncated = false;
  for (const entry of entries) {
    if (entry.index < state.log.length) {
      if (state.log[entry.index].term !== entry.term) {
        truncated = true;
        raftState.truncateLogFrom(entry.index);
        raftState.appendReplicatedEntry(entry);
      }
    } else {
      raftState.appendReplicatedEntry(entry);
    }
  }

  if (entries.length >= 2 || truncated) {
    metrics.event('catch-up', { count: entries.length, leaderId, truncated });
  }

  emitUpdate('status', raftState.getStatusSnapshot(NODE_ID));

  if (leaderCommitIndex > state.commitIndex) {
    raftState.updateCommitIndex(Math.min(leaderCommitIndex, prevLogIndex + entries.length));
    metrics.event('commit-advanced', { commitIndex: raftState.getState().commitIndex });
    emitUpdate('tally', raftState.getTallySnapshot());
  }

  // If the leader sent a clock, merge it and return our own snapshot
  // so the leader can merge our clock back into its state.
  let responseClock;
  if (clock) {
    responseClock = clocks.onReceive(clock);
  }

  return { 
    term: raftState.getState().currentTerm, 
    success: true, 
    matchIndex: prevLogIndex + entries.length,
    clock: responseClock 
  };
}

module.exports = {
  startLeaderHeartbeats,
  leaderAppendAndReplicate,
  handleAppendEntries,
};
