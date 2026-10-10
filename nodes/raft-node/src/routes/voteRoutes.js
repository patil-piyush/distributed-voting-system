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
const clocks = require('../clock/clocks');

// Set of configured peer ids, used to validate the x-forwarded-by-node
// header so a voter can't spoof receivedByNode or receivedClock.
const peerIdSet = new Set(PEERS.map((p) => p.id));

const router = express.Router();

router.post('/vote', requireAuth, async (req, res) => {
  const state = raftState.getState();
  const voterId = req.voter.voterId; // from the verified JWT, not the body
  const { candidateChoice } = req.body;

  const isValidCandidate = CANDIDATES.some((c) => c.id === candidateChoice);
  if (!candidateChoice || !isValidCandidate) {
    return res.status(400).json({ error: 'candidateChoice must be a valid candidate id' });
  }

  if (state.role === raftState.ROLES.LEADER) {
    if (raftState.hasVoterVoted(voterId)) {
      return res.status(409).json({ error: 'this voter has already voted' });
    }

    // Determine receivedByNode and receivedClock. Trust the forwarding
    // peer's values ONLY if x-forwarded-by-node names a configured peer;
    // otherwise the request came directly from a voter.
    const forwardedBy = req.headers['x-forwarded-by-node'];
    let receivedByNode;
    let receivedClock;

    if (forwardedBy && peerIdSet.has(forwardedBy) && req.body.receivedClock) {
      // Trusted internal forward — merge the follower's clock.
      receivedByNode = req.body.receivedByNode;
      receivedClock = clocks.onReceive(req.body.receivedClock);
    } else {
      // Direct voter request — tick our own clock.
      receivedByNode = NODE_ID;
      receivedClock = clocks.localEvent();
    }

    const appendClock = clocks.localEvent();
    const replResult = await appendEntries.leaderAppendAndReplicate({
      voterId, candidateChoice, receivedByNode, receivedClock, appendClock,
    });
    if (replResult.committed) {
      return res.status(200).json({ status: 'committed', handledBy: NODE_ID });
    } else {
      return res.status(202).json({ 
        status: 'pending', 
        handledBy: NODE_ID, 
        note: 'entry appended; majority not reachable yet - it will commit automatically once a majority acknowledges' 
      });
    }
  }

  // Not the leader — tick clock on receipt, then forward with the
  // clock snapshot and our identity so the leader can merge it.
  const receivedClock = clocks.localEvent();

  const leaderId = state.currentLeaderId;
  const leaderPeer = PEERS.find((p) => p.id === leaderId);

  if (!leaderPeer) {
    return res.status(503).json({ error: 'no known leader right now, try again shortly' });
  }

  console.log(`[${NODE_ID}] received vote request, forwarding to leader ${leaderId}`);
  const result = await peerClient.forwardVote(
    leaderPeer.url,
    { ...req.body, receivedByNode: NODE_ID, receivedClock },
    req.headers.authorization
  );
  if (!result.ok) {
    return res.status(503).json({ error: 'leader unreachable, try again shortly' });
  }
  res.status(result.status).json(result.data);
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

// Returns the node's current logical clock snapshot (no tick).
router.get('/clock', (req, res) => {
  res.json(clocks.snapshot());
});

module.exports = router;

