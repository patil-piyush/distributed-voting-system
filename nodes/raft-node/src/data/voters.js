// voters.js
//
// The eligible-voter registry. Static and identical on every node at
// boot — like candidates.js, this is deliberately NOT replicated
// through Raft. Registering new voters mid-election is out of scope;
// eligibility is decided beforehand, same as a real electoral roll.
//
// Generated programmatically so the load-test script has plenty of
// distinct voters to simulate concurrent traffic with. Every demo
// voter shares one password for convenience — fine for a college
// demo, would obviously be per-voter in a real system.

const bcrypt = require('bcryptjs');

const VOTER_COUNT = 30;
const DEMO_PASSWORD = 'pass1234';

const RAW_VOTERS = Array.from({ length: VOTER_COUNT }, (_, i) => ({
  voterId: `voter${i + 1}`,
  name: `Demo Voter ${i + 1}`,
  password: DEMO_PASSWORD,
}));

const VOTERS = RAW_VOTERS.map((v) => ({
  voterId: v.voterId,
  name: v.name,
  passwordHash: bcrypt.hashSync(v.password, 8),
}));

function findVoter(voterId) {
  return VOTERS.find((v) => v.voterId === voterId);
}

module.exports = { VOTERS, findVoter };
