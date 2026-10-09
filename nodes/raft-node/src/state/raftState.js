// raftState.js
//
// This is the single source of truth for this node's Raft state.
// Nothing outside this file should ever mutate `state` directly —
// always go through the functions exported below. That's what keeps
// things predictable when multiple RPCs arrive close together and
// could otherwise race to read-modify-write the same fields.

const ROLES = {
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
};

const state = {
  currentTerm: 0,
  votedFor: null,        // node id we voted for in the current term
  role: ROLES.FOLLOWER,   // every node starts as a follower
  log: [],                // array of { term, index, command }
  commitIndex: -1,        // highest log index known to be committed
  votesReceived: new Set(), // only meaningful while role === CANDIDATE
  currentLeaderId: null,   // best-known leader, used to forward client votes
};

function getState() {
  return state;
}

// Move to follower. Called whenever we see a higher term from
// anyone (a RequestVote or AppendEntries carrying term > currentTerm),
// or when a candidate discovers a legitimate current leader.
function becomeFollower(term, leaderId = null) {
  if (term > state.currentTerm) {
    state.currentTerm = term;
    state.votedFor = null; // a new term means we haven't voted in it yet
  }
  state.role = ROLES.FOLLOWER;
  state.votesReceived = new Set();
  if (leaderId) state.currentLeaderId = leaderId;
}

// Move to candidate: bump our own term, vote for ourselves, forget
// any previously known leader (we're now trying to replace them).
function becomeCandidate(selfId) {
  state.currentTerm += 1;
  state.role = ROLES.CANDIDATE;
  state.votedFor = selfId;
  state.votesReceived = new Set([selfId]);
  state.currentLeaderId = null;
}

// Move to leader. Only ever called right after winning a majority.
function becomeLeader(selfId) {
  state.role = ROLES.LEADER;
  state.currentLeaderId = selfId;
}

function recordVoteGranted(voterId) {
  state.votesReceived.add(voterId);
}

function hasMajority(clusterSize) {
  const majority = Math.floor(clusterSize / 2) + 1;
  return state.votesReceived.size >= majority;
}

// Decide whether to grant a vote to a candidate that's asking for one.
function canGrantVote(candidateTerm, candidateId) {
  if (candidateTerm < state.currentTerm) return false;
  if (state.votedFor === null || state.votedFor === candidateId) return true;
  return false;
}

function recordVote(candidateId) {
  state.votedFor = candidateId;
}

// Scans the FULL log (not just committed entries) so a voter can't
// double-submit while an earlier entry is still awaiting commit. The
// trade-off: if that earlier entry never actually commits (e.g. the
// leader crashes before replication finishes), this voter is stuck
// unable to resubmit. Acceptable, documented simplification for FA-1.
function hasVoterVoted(voterId) {
  return state.log.some((entry) => entry.command.voterId === voterId);
}

function appendLogEntry(command) {
  const entry = {
    term: state.currentTerm,
    index: state.log.length,
    command,
  };
  state.log.push(entry);
  return entry;
}

function updateCommitIndex(index) {
  if (index > state.commitIndex) {
    state.commitIndex = index;
  }
}

// Shared shape used by both the /status REST route and the Socket.io
// "status" event, so the dashboard sees identical data either way.
function getStatusSnapshot(nodeId) {
  return {
    nodeId,
    role: state.role,
    currentTerm: state.currentTerm,
    currentLeaderId: state.currentLeaderId,
    logLength: state.log.length,
    commitIndex: state.commitIndex,
  };
}

// Shared shape used by both the /tally REST route and the Socket.io
// "tally" event. Only counts COMMITTED entries — an entry sitting in
// the log but not yet agreed on by a majority shouldn't count yet.
function getTallySnapshot() {
  const committedEntries = state.log.slice(0, state.commitIndex + 1);
  const tally = {};
  for (const entry of committedEntries) {
    const choice = entry.command.candidateChoice;
    tally[choice] = (tally[choice] || 0) + 1;
  }
  return tally;
}

module.exports = {
  ROLES,
  getState,
  becomeFollower,
  becomeCandidate,
  becomeLeader,
  recordVoteGranted,
  hasMajority,
  canGrantVote,
  recordVote,
  appendLogEntry,
  updateCommitIndex,
  hasVoterVoted,
  getStatusSnapshot,
  getTallySnapshot,
};
