import { useState } from 'react';
import LiveTally from './LiveTally.jsx';
import VoteActivityFeed from './VoteActivityFeed.jsx';

export default function VoteTab({
  nodes,
  token,
  candidates,
  tally,
  voteActivity,
  responseCounts,
  onLogin,
  onVote,
  onLogout,
  message,
  hasVoted,
}) {
  const [voterId, setVoterId] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onLogin(voterId, password);
  }

  // Calculate per-node received vs committed stats from voteActivity
  const nodeStats = {};
  for (const n of nodes) {
    nodeStats[n.id] = { received: 0, committed: 0 };
  }
  for (const act of voteActivity) {
    if (act.receivedByNode && nodeStats[act.receivedByNode]) {
      nodeStats[act.receivedByNode].received += 1;
    }
    if (act.handledByNode && nodeStats[act.handledByNode]) {
      nodeStats[act.handledByNode].committed += 1;
    }
  }

  const maxVal = Math.max(1, ...Object.values(nodeStats).flatMap((s) => [s.received, s.committed]));

  return (
    <div className="vote-tab">
      {/* Top row: Voter Action and HTTP Response Counters */}
      <div className="grid-2col">
        {/* Voter Panel */}
        <div className="panel voter-panel">
          {!token ? (
            <form onSubmit={handleSubmit} className="voter-form">
              <h2>Voter Authentication</h2>
              <p className="tab-sub">Login with demo accounts (voter1..voter30, password: pass1234)</p>
              <div className="form-group">
                <input
                  id="voter-id-input"
                  placeholder="Voter ID (e.g. voter1)"
                  value={voterId}
                  onChange={(e) => setVoterId(e.target.value)}
                  required
                />
                <input
                  id="voter-pwd-input"
                  placeholder="Password (e.g. pass1234)"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button id="voter-login-btn" type="submit" className="login-btn">
                Authenticate & Vote
              </button>
            </form>
          ) : (
            <div>
              <div className="vote-header">
                <h2>{hasVoted ? 'Vote Submitted' : 'Cast Your Ballot'}</h2>
                <button className="logout-btn" onClick={onLogout}>
                  Switch Voter
                </button>
              </div>
              {!hasVoted ? (
                <div className="candidate-buttons">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      id={`vote-btn-${c.id}`}
                      className="candidate-vote-btn"
                      onClick={() => onVote(c.id)}
                    >
                      Vote {c.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="vote-success-banner">
                  ✓ Ballot successfully processed and committed by cluster quorum!
                </div>
              )}
            </div>
          )}
          {message && <p className="action-message">{message}</p>}
        </div>

        {/* HTTP Response Counters */}
        <div className="panel response-counters-panel">
          <h2>Client Response Codes</h2>
          <p className="tab-sub">Real-time HTTP responses received by client voters</p>
          <div className="response-counters-grid">
            <div className="resp-card resp-200">
              <span className="resp-code">HTTP 200</span>
              <span className="resp-name">Committed</span>
              <span className="resp-count">{responseCounts['200'] ?? 0}</span>
            </div>
            <div className="resp-card resp-202">
              <span className="resp-code">HTTP 202</span>
              <span className="resp-name">Pending Quorum</span>
              <span className="resp-count">{responseCounts['202'] ?? 0}</span>
            </div>
            <div className="resp-card resp-409">
              <span className="resp-code">HTTP 409</span>
              <span className="resp-name">Already Voted</span>
              <span className="resp-count">{responseCounts['409'] ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle row: Per-Node Bar Chart and Live Tally */}
      <div className="grid-2col">
        {/* Per-Node Received vs Committed Bar Chart (Pure CSS/SVG) */}
        <div className="panel chart-panel">
          <div className="panel-header-row">
            <div>
              <h2>Per-Node Vote Flow</h2>
              <p className="tab-sub">Requests Received (routed) vs Committed by Leader</p>
            </div>
            <div className="chart-legend">
              <span className="legend-chip">
                <span className="chip-color chip-received" /> Received
              </span>
              <span className="legend-chip">
                <span className="chip-color chip-committed" /> Committed
              </span>
            </div>
          </div>

          <div className="bar-chart-container">
            {nodes.map((node) => {
              const stat = nodeStats[node.id] || { received: 0, committed: 0 };
              const recvHeight = Math.max(4, Math.round((stat.received / maxVal) * 110));
              const commHeight = Math.max(4, Math.round((stat.committed / maxVal) * 110));

              return (
                <div key={node.id} className="bar-column">
                  <div className="bar-pair">
                    <div className="bar-track">
                      <span className="bar-num">{stat.received}</span>
                      <div
                        className="bar-fill bar-fill-recv"
                        style={{ height: `${recvHeight}px` }}
                        title={`${node.id} received ${stat.received} vote requests`}
                      />
                    </div>
                    <div className="bar-track">
                      <span className="bar-num">{stat.committed}</span>
                      <div
                        className="bar-fill bar-fill-comm"
                        style={{ height: `${commHeight}px` }}
                        title={`${node.id} committed ${stat.committed} votes as leader`}
                      />
                    </div>
                  </div>
                  <span className="bar-label">{node.id}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Tally */}
        <div className="panel tally-panel">
          <h2>Live Cluster Tally</h2>
          <LiveTally tally={tally} candidates={candidates} />
        </div>
      </div>

      {/* Bottom row: Vote Activity Feed */}
      <div className="panel activity-panel">
        <h2>Vote Activity Feed & Causal Clocks</h2>
        <VoteActivityFeed activity={voteActivity} />
      </div>
    </div>
  );
}
