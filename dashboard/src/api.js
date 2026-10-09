import axios from 'axios';

// The 5 nodes in the cluster. Update these if you change ports.
export const NODES = [
  { id: 'node1', url: 'http://localhost:5001' },
  { id: 'node2', url: 'http://localhost:5002' },
  { id: 'node3', url: 'http://localhost:5003' },
  { id: 'node4', url: 'http://localhost:5004' },
  { id: 'node5', url: 'http://localhost:5005' },
];

// Login can hit ANY node — the voter registry is static and
// identical everywhere, so it doesn't need to go through the leader.
export async function login(voterId, password) {
  const node = NODES[Math.floor(Math.random() * NODES.length)];
  const res = await axios.post(`${node.url}/auth/login`, { voterId, password });
  return res.data.token;
}

export async function getCandidates() {
  const res = await axios.get(`${NODES[0].url}/candidates`);
  return res.data;
}

// Deliberately picks a RANDOM node to vote through — this is what
// demonstrates the problem statement's claim that a voter shouldn't
// need to know or care which node they're talking to.
export async function castVote(token, candidateChoice) {
  const node = NODES[Math.floor(Math.random() * NODES.length)];
  const res = await axios.post(
    `${node.url}/vote`,
    { candidateChoice },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return { ...res.data, viaNode: node.id };
}

export async function getStatus(nodeUrl) {
  const res = await axios.get(`${nodeUrl}/status`);
  return res.data;
}

export async function getTally(nodeUrl) {
  const res = await axios.get(`${nodeUrl}/tally`);
  return res.data;
}
