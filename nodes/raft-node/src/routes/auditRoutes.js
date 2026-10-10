// auditRoutes.js
//
// Cluster consistency audit routes. No auth required — these are
// diagnostic endpoints for verifying that all reachable nodes agree
// on committed log entries up to their shared minimum commitIndex.

const express = require('express');
const axios = require('axios');
const raftState = require('../state/raftState');
const { NODE_ID, PORT, PEERS } = require('../config/peers');

const router = express.Router();

// GET /audit/local — returns this node's committed entries in a
// compact tuple format for comparison by the cluster-wide audit.
router.get('/local', (req, res) => {
  const state = raftState.getState();
  const committed = [];
  for (let i = 0; i <= state.commitIndex && i < state.log.length; i++) {
    const e = state.log[i];
    if (e.command.type === 'noop') continue;
    committed.push([e.index, e.term, e.command.voterId, e.command.candidateChoice]);
  }
  res.json({
    nodeId: NODE_ID,
    role: state.role,
    currentTerm: state.currentTerm,
    logLength: state.log.length,
    commitIndex: state.commitIndex,
    committed,
  });
});

// GET /audit — collects /audit/local from every node (self + peers),
// compares committed entries up to the shared minimum commitIndex,
// and reports per-node sync status.
router.get('/', async (req, res) => {
  const AUDIT_TIMEOUT_MS = 800;

  // Collect local state first (always reachable).
  const state = raftState.getState();
  const localCommitted = [];
  for (let i = 0; i <= state.commitIndex && i < state.log.length; i++) {
    const e = state.log[i];
    if (e.command.type === 'noop') continue;
    localCommitted.push([e.index, e.term, e.command.voterId, e.command.candidateChoice]);
  }

  const selfSnapshot = {
    nodeId: NODE_ID,
    reachable: true,
    role: state.role,
    term: state.currentTerm,
    logLength: state.log.length,
    commitIndex: state.commitIndex,
    committed: localCommitted,
  };

  // Fetch /audit/local from every peer in parallel.
  const peerResults = await Promise.allSettled(
    PEERS.map(async (peer) => {
      const resp = await axios.get(`${peer.url}/audit/local`, { timeout: AUDIT_TIMEOUT_MS });
      return {
        nodeId: peer.id,
        reachable: true,
        role: resp.data.role,
        term: resp.data.currentTerm,
        logLength: resp.data.logLength,
        commitIndex: resp.data.commitIndex,
        committed: resp.data.committed,
      };
    })
  );

  // Build the full list of node snapshots.
  const snapshots = [selfSnapshot];
  for (const result of peerResults) {
    if (result.status === 'fulfilled') {
      snapshots.push(result.value);
    } else {
      // Peer was unreachable — extract its id from the request URL.
      const failedPeer = PEERS[peerResults.indexOf(result)];
      snapshots.push({
        nodeId: failedPeer.id,
        reachable: false,
        role: null,
        term: null,
        logLength: null,
        commitIndex: null,
        committed: null,
      });
    }
  }

  // Compare only reachable nodes.
  const reachable = snapshots.filter((s) => s.reachable);
  const reachableCount = reachable.length;

  if (reachableCount === 0) {
    return res.json({
      consistent: false,
      comparedUpToIndex: -1,
      reachableCount: 0,
      auditedAt: new Date().toISOString(),
      nodes: snapshots.map(({ committed, ...rest }) => ({ ...rest, inSync: false, firstDivergenceIndex: null })),
    });
  }

  // The comparison window is 0..minCommit across all reachable nodes.
  const minCommit = Math.min(...reachable.map((s) => s.commitIndex));

  // Use the node with the highest commitIndex as the reference.
  const reference = reachable.reduce((a, b) => (a.commitIndex >= b.commitIndex ? a : b));

  let consistent = true;
  const nodeResults = snapshots.map((snap) => {
    // Strip the committed array from the response — it can be large.
    const { committed, ...info } = snap;

    if (!snap.reachable) {
      return { ...info, inSync: false, firstDivergenceIndex: null };
    }

    // Compare this node's committed entries against the reference
    // up to minCommit.
    let divergeIdx = null;
    for (let i = 0; i <= minCommit; i++) {
      const refEntry = reference.committed[i];
      const nodeEntry = committed[i];
      if (
        !nodeEntry ||
        !refEntry ||
        nodeEntry[0] !== refEntry[0] ||
        nodeEntry[1] !== refEntry[1] ||
        nodeEntry[2] !== refEntry[2] ||
        nodeEntry[3] !== refEntry[3]
      ) {
        divergeIdx = i;
        break;
      }
    }

    const inSync = divergeIdx === null;
    if (!inSync) consistent = false;

    return { ...info, inSync, firstDivergenceIndex: divergeIdx };
  });

  res.json({
    consistent,
    comparedUpToIndex: minCommit,
    reachableCount,
    auditedAt: new Date().toISOString(),
    nodes: nodeResults,
  });
});

module.exports = router;
