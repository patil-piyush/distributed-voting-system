// voteRoutes.js
//
// Client-facing routes, now behind real auth. A voter must have a
// valid JWT (from POST /auth/login) to cast a vote. voterId comes
// from the verified token, never from the request body, so a voter
// can't spoof someone else's identity.

const express = require('express');
const raftState = require('../state/raftState');
const appendEntries = require('../rpc/appendEntries');
const peerClient = require('../rpc/peerClient');
const { requireAuth } = require('../auth/authMiddleware');
const { CANDIDATES } = require('../data/candidates');
const { NODE_ID, PEERS } = require('../config/peers');

const router = express.Router();

router.post('/vote', requireAuth, async (req, res) => {
  const state = raftState.getState();
  const voterId = req.voter.voterId; // from the verified JWT, not the body
  const { candidateChoice } = req.body;

  const isValidCandidate = CANDIDATES.some((c) => c.id === candidateChoice);
  if (!candidateChorequestVoteice || !isValidCandidate) {
    return res.status(400).json({ error: 'candidateChoice must be a valid candidate id' });
  }

  if (state.role === raftState.ROLES.LEADER) {
    if (raftState.hasVoterVoted(voterId)) {
      return res.status(409).json({ error: 'this voter has already voted' });
    }
    const receivedByNode = req.body.receivedByNode || NODE_ID;
    await appendEntries.leaderAppendAndReplicate({ voterId, candidateChoice, receivedByNode });
    return res.json({ status: 'committed', handledBy: NODE_ID });
  }

  // Not the leader — forward to whoever we currently believe is,
  // carrying the original Authorization header so the leader can
  // verify the voter's identity itself.
  const leaderId = state.currentLeaderId;
  const leaderPeer = PEERS.find((p) => p.id === leaderId);

  if (!leaderPeer) {
    return res.status(503).json({ error: 'no known leader right now, try again shortly' });
  }

  console.log(`[${NODE_ID}] received vote request, forwarding to leader ${leaderId}`);
  const result = await peerClient.forwardVote(leaderPeer.url, { ...req.body, receivedByNode: NODE_ID }, req.headers.authorization);
  if (!result.ok) {
    return res.status(503).json({ error: 'leader unreachable, try again shortly' });
  }
  res.status(result.data && result.data.error ? 409 : 200).json(result.data);
});

router.get('/status', (req, res) => {
  const state = raftState.getState();
  res.json({
    nodeId: NODE_ID,
    role: state.role,
    currentTerm: state.currentTerm,
    currentLeaderId: state.currentLeaderId,
    logLength: state.log.length,
    commitIndex: state.commitIndex,
  });
});

router.get('/tally', (req, res) => {
  const state = raftState.getState();
  // Only count entries that are actually committed — an entry sitting
  // in the log but not yet committed hasn't been agreed on by a
  // majority yet, so it shouldn't count towards the result.
  const committedEntries = state.log.slice(0, state.commitIndex + 1);
  const tally = {};
  for (const entry of committedEntries) {
    const choice = entry.command.candidateChoice;
    tally[choice] = (tally[choice] || 0) + 1;
  }
  res.json(tally);
});

module.exports = router;
