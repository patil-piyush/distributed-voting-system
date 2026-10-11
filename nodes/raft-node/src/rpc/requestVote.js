// requestVote.js
//
// Two responsibilities live here:
//   1. startElection()      - what WE do when our timer fires
//   2. handleRequestVote()  - how we respond when SOMEONE ELSE asks
//                             us for our vote

const raftState = require('../state/raftState');
const timers = require('../election/timers');
const peerClient = require('./peerClient');
const { emitUpdate } = require('../realtime/socketServer');
const { NODE_ID, PEERS } = require('../config/peers');
const metrics = require('../telemetry/metrics');

// Called when the election timer fires: we haven't heard from a
// leader recently, so we try to become one ourselves.
async function startElection() {
  raftState.becomeCandidate(NODE_ID);
  const state = raftState.getState();
  const electionTerm = state.currentTerm; // remember which term THIS election is for
  console.log(`[${NODE_ID}] election timeout — starting election for term ${electionTerm}`);
  metrics.inc('electionsStarted'); metrics.event('electionStarted', { term: electionTerm });
  emitUpdate('status', raftState.getStatusSnapshot(NODE_ID));

  // Reset our own timer too — if this election doesn't resolve
  // (e.g. a split vote where no one gets a majority), we need to be
  // able to try again after another randomized wait.
  timers.resetElectionTimer(startElection);

  const lastLogIndex = state.log.length - 1;
  const lastLogTerm = lastLogIndex >= 0 ? state.log[lastLogIndex].term : 0;

  const requests = PEERS.map((peer) =>
    peerClient
      .sendRequestVote(peer.url, {
        term: state.currentTerm,
        candidateId: NODE_ID,
        lastLogIndex,
        lastLogTerm,
      })
      .then((result) => ({ peer, result }))
  );

  const responses = await Promise.allSettled(requests);

  // Guard against a stale/overlapping election: bail out if we're no
  // longer a candidate, OR if the term has moved on since we started
  // (e.g. we already stepped down or started a newer election).
  const afterResponses = raftState.getState();
  if (afterResponses.role !== raftState.ROLES.CANDIDATE || afterResponses.currentTerm !== electionTerm) {
    return;
  }

  for (const settled of responses) {
    if (settled.status !== 'fulfilled') continue;
    const { peer, result } = settled.value;
    if (!result.ok) continue; // peer unreachable — just skip it, not an error

    const { term, voteGranted } = result.data;

    if (term > raftState.getState().currentTerm) {
      // Someone out there is on a later term than us — we lost this
      // race, step down immediately.
      raftState.becomeFollower(term);
      metrics.setLeaderSinceTerm(null); metrics.event('stepped-down', { toTerm: term });
      emitUpdate('status', raftState.getStatusSnapshot(NODE_ID));
      timers.resetElectionTimer(startElection);
      return;
    }

    if (voteGranted) {
      raftState.recordVoteGranted(peer.id);
    }
  }

  const clusterSize = PEERS.length + 1; // +1 for self
  if (
    raftState.getState().role === raftState.ROLES.CANDIDATE &&
    raftState.getState().currentTerm === electionTerm &&
    raftState.hasMajority(clusterSize)
  ) {
    raftState.becomeLeader(NODE_ID);
    raftState.initLeaderState(PEERS.map(p => p.id));
    raftState.appendLogEntry({ type: 'noop' });
    console.log(`[${NODE_ID}] won election for term ${raftState.getState().currentTerm} — becoming leader`);
    metrics.inc('electionsWon'); metrics.setLeaderSinceTerm(raftState.getState().currentTerm); metrics.event('leader-elected', { term: raftState.getState().currentTerm });
    emitUpdate('status', raftState.getStatusSnapshot(NODE_ID));
    timers.stopElectionTimer();
    // appendEntries.js owns starting the heartbeat timer. Required
    // here (not at the top of the file) to avoid a circular
    // require, since appendEntries.js also requires this file.
    require('./appendEntries').startLeaderHeartbeats();
  }
}

// Called by the /rpc/request-vote route when another node asks us
// for our vote in its election.
function handleRequestVote({ term, candidateId, lastLogIndex, lastLogTerm }) {
  const state = raftState.getState();

  if (term > state.currentTerm) {
    raftState.becomeFollower(term);
    metrics.setLeaderSinceTerm(null); metrics.event('stepped-down', { toTerm: term });
  }

  const granted = raftState.canGrantVote(term, candidateId, lastLogIndex, lastLogTerm);

  if (granted) {
    raftState.recordVote(candidateId);
    metrics.inc('votesGranted'); metrics.event('vote-granted', { candidateId, term });
    // Granting a vote means we trust someone else is handling this
    // election right now — reset our own timer so we don't also
    // start a competing one.
    timers.resetElectionTimer(startElection);
  } else {
    metrics.inc('votesDenied'); metrics.event('vote-denied', { candidateId, term });
  }

  return { term: raftState.getState().currentTerm, voteGranted: granted };
}

module.exports = { startElection, handleRequestVote };
