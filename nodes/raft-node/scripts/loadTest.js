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

  return { voterId, loginNode, voteNode, candidateChoice, result: voteRes.data, status: voteRes.status };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`Simulating ${VOTER_COUNT} concurrent voters across ${NODES.length} nodes...\n`);

  console.log('Fetching initial tally before testing...');
  let initialTallyTotal = 0;
  try {
    const r = await axios.get(`${NODES[0]}/tally`);
    initialTallyTotal = Object.values(r.data).reduce((sum, val) => sum + val, 0);
  } catch (err) {
    console.log('Failed to fetch initial tally, assuming 0.');
  }

  const voterIds = Array.from({ length: VOTER_COUNT }, (_, i) => `voter${i + 1}`);
  const results = await Promise.allSettled(voterIds.map((id) => castVote(id)));

  let succeeded = 0;
  let pending = 0;
  let failed = 0;
  
  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.status === 200) {
        succeeded += 1;
        console.log(`OK   ${r.value.voterId} -> voted "${r.value.candidateChoice}" via ${r.value.voteNode}`);
      } else if (r.value.status === 202) {
        pending += 1;
        console.log(`PEND ${r.value.voterId} -> voted "${r.value.candidateChoice}" via ${r.value.voteNode} (pending)`);
      } else {
        failed += 1;
        console.log(`FAIL ${r.value.voterId} -> returned ${r.value.status}`);
      }
    } else {
      failed += 1;
      const msg = r.reason.response?.data?.error || r.reason.message;
      console.log(`FAIL ${msg}`);
    }
  }

  console.log(`\n${succeeded} committed (200), ${pending} pending (202), ${failed} failed.\n`);

  console.log('Polling /tally from every node to confirm consistency (up to 5s)...\n');
  
  let tallies = [];
  let allMatch = false;
  
  for (let i = 0; i < 17; i++) { // 17 * 300ms ≈ 5s
    tallies = await Promise.all(
      NODES.map(async (url) => {
        try {
          const r = await axios.get(`${url}/tally`);
          return { url, tally: r.data };
        } catch (err) {
          return { url, tally: null };
        }
      })
    );
    
    const serialized = tallies.map((t) => JSON.stringify(t.tally));
    allMatch = serialized.every((s) => s === serialized[0]) && tallies.every(t => t.tally !== null);
    
    if (allMatch) {
      break;
    }
    
    await sleep(300);
  }

  for (const t of tallies) {
    console.log(`${t.url} ->`, t.tally);
  }

  console.log(`\nAll 5 nodes agree on the tally: ${allMatch ? 'YES — consensus held under concurrent load.' : 'NO — investigate!'}`);

  const finalTally = tallies[0].tally || {};
  const totalVotes = Object.values(finalTally).reduce((sum, val) => sum + val, 0);
  const diffVotes = totalVotes - initialTallyTotal;
  
  console.log(`Total votes counted in this run (diff): ${diffVotes} (Final: ${totalVotes}, Initial: ${initialTallyTotal})`);
  console.log(`HTTP 200 responses: ${succeeded}`);
  
  if (diffVotes === succeeded) {
    console.log('SUCCESS: sum of votes exactly matches number of 200 responses.');
  } else {
    console.log('WARNING: sum of votes does not match number of 200 responses.');
  }
}

main().catch((err) => {
  console.error('Load test failed to run:', err.message);
});
