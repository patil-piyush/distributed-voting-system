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

// Only the leader calls this. Sends a heartbeat (newEntry = null) or
// a real new log entry to every follower in parallel.
async function sendAppendEntriesToAll(newEntry = null) {
  const state = raftState.getState();
  if (state.role !== raftState.ROLES.LEADER) return;

  const payload = {
    term: state.currentTerm,
    leaderId: NODE_ID,
    entry: newEntry,
    leaderCommitIndex: state.commitIndex,
  };

  const results = await Promise.allSettled(
    PEERS.map((peer) => peerClient.sendAppendEntries(peer.url, payload))
  );

  emitUpdate('status', raftState.getStatusSnapshot(NODE_ID));

  if (!newEntry) return; // plain heartbeat — nothing to commit

  let acks = 1; // the leader counts as having "replicated" to itself
  for (const settled of results) {
    if (settled.status === 'fulfilled' && settled.value.ok && settled.value.data.success) {
      acks += 1;
    }
  }

  const clusterSize = PEERS.length + 1;
  const majority = Math.floor(clusterSize / 2) + 1;
  if (acks >= majority) {
    raftState.updateCommitIndex(newEntry.index);
    console.log(`[${NODE_ID}] committed entry ${newEntry.index} (${acks}/${clusterSize} acks)`);
    emitUpdate('tally', raftState.getTallySnapshot());
    emitUpdate('vote-activity', {
      voterId: newEntry.command.voterId,
      candidateChoice: newEntry.command.candidateChoice,
      receivedByNode: newEntry.command.receivedByNode,
      handledByNode: NODE_ID,
      acks,
      clusterSize,
      committedAt: Date.now(),
    });
    emitUpdate('status', raftState.getStatusSnapshot(NODE_ID));
  }
}

function startLeaderHeartbeats() {
  timers.startHeartbeatTimer(() => sendAppendEntriesToAll(null));
}

// Called when the leader accepts a new vote from a client: append it
// locally first, then try to replicate it to a majority.
function leaderAppendAndReplicate(command) {
  const entry = raftState.appendLogEntry(command);
  return sendAppendEntriesToAll(entry);
}

// Called by the /rpc/append-entries route when this node receives a
// heartbeat or log entry from a leader.
function handleAppendEntries({ term, leaderId, entry, leaderCommitIndex }) {
  const state = raftState.getState();

  if (term < state.currentTerm) {
    // This sender's term is stale — it's not a legitimate leader
    // (anymore), reject so it steps down when it sees our term back.
    return { term: state.currentTerm, success: false };
  }

  // Any valid AppendEntries — heartbeat or not — proves a leader is
  // alive right now, so this doubles as our heartbeat signal.
  raftState.becomeFollower(term, leaderId);
  timers.stopHeartbeatTimer(); // in case we were leader a moment ago
  timers.resetElectionTimer(require('./requestVote').startElection);

  if (entry) {
    raftState.appendLogEntry(entry.command);
  }

  emitUpdate('status', raftState.getStatusSnapshot(NODE_ID));

  if (leaderCommitIndex > state.commitIndex) {
    raftState.updateCommitIndex(leaderCommitIndex);
    emitUpdate('tally', raftState.getTallySnapshot());
  }

  return { term: raftState.getState().currentTerm, success: true };
}

module.exports = {
  startLeaderHeartbeats,
  leaderAppendAndReplicate,
  handleAppendEntries,
};
