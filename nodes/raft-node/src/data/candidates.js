// candidates.js
//
// The list of candidates on the ballot. Static and identical on
// every node at boot — this is deliberately NOT replicated through
// Raft, because who's running is decided before the election starts,
// same as a real ballot is finalized before voting opens.

const CANDIDATES = [
  { id: 'A', name: 'Candidate A' },
  { id: 'B', name: 'Candidate B' },
  { id: 'C', name: 'Candidate C' },
];

module.exports = { CANDIDATES };
