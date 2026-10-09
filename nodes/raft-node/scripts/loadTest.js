// loadTest.js
//
// Simulates many voters casting votes CONCURRENTLY, each hitting a
// randomly chosen node for login and a (possibly different) randomly
// chosen node to vote through. This is the direct proof of the
// problem statement's core claim: votes cast on different nodes are
// handled correctly and consistently by the cluster working together.
//
// Run with: npm run loadtest   (from nodes/raft-node)
// Make sure all 5 nodes are already running first.

const axios = require('axios');

const NODES = [
  'http://localhost:5001',
  'http://localhost:5002',
  'http://localhost:5003',
  'http://localhost:5004',
  'http://localhost:5005',
];

const VOTER_COUNT = 30; // must be <= VOTER_COUNT in src/data/voters.js
const CANDIDATES = ['A', 'B', 'C'];
const PASSWORD = 'pass1234';

function randomNode() {
  return NODES[Math.floor(Math.random() * NODES.length)];
}

function randomCandidate() {
  return CANDIDATES[Math.floor(Math.random() * CANDIDATES.length)];
}

async function castVote(voterId) {
  const loginNode = randomNode();
  const loginRes = await axios.post(`${loginNode}/auth/login`, {
    voterId,
    password: PASSWORD,
  });
  const token = loginRes.data.token;

  // Deliberately re-roll the node for voting — this is what proves
  // the "different voters on different nodes" scenario, since login
  // and vote can land on two different nodes entirely.
  const voteNode = randomNode();
  const candidateChoice = randomCandidate();

  const voteRes = await axios.post(
    `${voteNode}/vote`,
    { candidateChoice },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return { voterId, loginNode, voteNode, candidateChoice, result: voteRes.data };
}

async function main() {
  console.log(`Simulating ${VOTER_COUNT} concurrent voters across ${NODES.length} nodes...\n`);

  const voterIds = Array.from({ length: VOTER_COUNT }, (_, i) => `voter${i + 1}`);

  // Promise.allSettled fires every request in parallel — this is the
  // actual concurrency test, not a sequential loop.
  const results = await Promise.allSettled(voterIds.map((id) => castVote(id)));

  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      succeeded += 1;
      console.log(`OK   ${r.value.voterId} -> voted "${r.value.candidateChoice}" via ${r.value.voteNode}`);
    } else {
      failed += 1;
      const msg = r.reason.response?.data?.error || r.reason.message;
      console.log(`FAIL ${msg}`);
    }
  }

  console.log(`\n${succeeded} succeeded, ${failed} failed.\n`);

  console.log('Fetching tally from every node to confirm consistency...\n');
  const tallies = await Promise.all(
    NODES.map((url) => axios.get(`${url}/tally`).then((r) => ({ url, tally: r.data })))
  );
  for (const t of tallies) {
    console.log(`${t.url} ->`, t.tally);
  }

  const serialized = tallies.map((t) => JSON.stringify(t.tally));
  const allMatch = serialized.every((s) => s === serialized[0]);
  console.log(`\nAll 5 nodes agree on the tally: ${allMatch ? 'YES — consensus held under concurrent load.' : 'NO — investigate!'}`);
}

main().catch((err) => {
  console.error('Load test failed to run:', err.message);
});
