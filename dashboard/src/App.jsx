import { useEffect, useState } from 'react';
import { NODES, login, getCandidates, castVote, getStatus, getTally } from './api';
import { connectAllSockets } from './socket';
import NodeStatus from './components/NodeStatus.jsx';
import LiveTally from './components/LiveTally.jsx';
import VoteActivityFeed from './components/VoteActivityFeed.jsx';

export default function App() {
  const [voterId, setVoterId] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [connected, setConnected] = useState({});
  const [tally, setTally] = useState({});
  const [message, setMessage] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [voteActivity, setVoteActivity] = useState(() => {
    try {
      const stored = localStorage.getItem('voteActivity');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  useEffect(() => {
    getCandidates().then(setCandidates).catch(() => {});

    NODES.forEach((n) => {
      getStatus(n.url)
        .then((s) => {
          setStatuses((prev) => ({ ...prev, [n.id]: s }));
          setConnected((prev) => ({ ...prev, [n.id]: true }));
        })
        .catch(() => setConnected((prev) => ({ ...prev, [n.id]: false })));
    });

    getTally(NODES[0].url).then(setTally).catch(() => {});

    const disconnect = connectAllSockets({
      onStatus: (nodeId, data) => {
        setStatuses((prev) => ({ ...prev, [nodeId]: data }));
        setConnected((prev) => ({ ...prev, [nodeId]: true }));
      },
      onTally: (data) => setTally(data),
      onDisconnect: (nodeId) => setConnected((prev) => ({ ...prev, [nodeId]: false })),
      onVoteActivity: (data) =>
        setVoteActivity((prev) => {
          const updated = [data, ...prev].slice(0, 20);
          localStorage.setItem('voteActivity', JSON.stringify(updated));
          return updated;
        }),
    });

    return disconnect;
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setMessage('');
    try {
      const t = await login(voterId, password);
      setToken(t);
    } catch (err) {
      setMessage(err.response?.data?.error || 'login failed');
    }
  }

  async function handleVote(candidateId) {
    setMessage('');
    try {
      const result = await castVote(token, candidateId);
      setMessage(`Vote cast via ${result.viaNode} — status: ${result.status || result.error}`);
      if (result.status === 'committed') setHasVoted(true);
    } catch (err) {
      setMessage(err.response?.data?.error || 'vote failed');
    }
  }

  function handleLogout() {
    setToken(null);
    setHasVoted(false);
    setMessage('');
  }

  const leaderId = Object.values(statuses).find((s) => s?.role === 'leader')?.nodeId;

  return (
    <div className="app">
      <header>
        <h1>Distributed Voting System</h1>
        <p className="subtitle">
          Raft consensus across 5 nodes{leaderId ? ` — current leader: ${leaderId}` : ''}
        </p>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Node Status</h2>
          <div className="node-grid">
            {NODES.map((n) => (
              <NodeStatus
                key={n.id}
                nodeId={n.id}
                status={statuses[n.id]}
                connected={connected[n.id]}
              />
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Live Tally</h2>
          <LiveTally tally={tally} candidates={candidates} />
        </div>
      </section>

      <section className="panel activity-panel">
        <h2>Vote Activity Feed</h2>
        <VoteActivityFeed activity={voteActivity} />
      </section>

      <section className="panel voter-panel">
        {!token ? (
          <form onSubmit={handleLogin}>
            <h2>Voter Login</h2>
            <input
              placeholder="Voter ID (e.g. voter1)"
              value={voterId}
              onChange={(e) => setVoterId(e.target.value)}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit">Login</button>
          </form>
        ) : (
          <div>
            <div className="vote-header">
              <h2>{hasVoted ? 'Thanks for voting' : 'Cast Your Vote'}</h2>
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
            {!hasVoted && (
              <div className="candidate-buttons">
                {candidates.map((c) => (
                  <button key={c.id} onClick={() => handleVote(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {message && <p className="message">{message}</p>}
      </section>

      <footer>
        <p>Demo voter accounts: voter1..voter30, password: pass1234</p>
      </footer>
    </div>
  );
}
