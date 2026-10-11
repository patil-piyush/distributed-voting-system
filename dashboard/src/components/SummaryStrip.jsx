import { useState, useEffect } from 'react';

export default function SummaryStrip({ leaderId, term, reachableCount, totalNodes = 5, totalVotes = 0, lastElectionAt }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hasQuorum = reachableCount >= Math.floor(totalNodes / 2) + 1;
  const downCount = totalNodes - reachableCount;

  let healthLabel = 'Healthy';
  let healthClass = 'health-healthy';
  if (!hasQuorum) {
    healthLabel = 'No quorum';
    healthClass = 'health-no-quorum';
  } else if (downCount > 0) {
    healthLabel = `Degraded (${downCount} down)`;
    healthClass = 'health-degraded';
  }

  const turnoutPct = Math.round((totalVotes / 30) * 100);

  let electionElapsed = '—';
  if (lastElectionAt) {
    const sec = Math.max(0, Math.floor((now - lastElectionAt) / 1000));
    if (sec < 60) {
      electionElapsed = `${sec}s ago`;
    } else {
      const min = Math.floor(sec / 60);
      const remSec = sec % 60;
      electionElapsed = `${min}m ${remSec}s ago`;
    }
  }

  return (
    <div className="summary-strip">
      <div className="summary-item">
        <span className="summary-label">Leader & Term</span>
        <span className="summary-value">
          {leaderId ? (
            <>
              <span className="summary-leader-chip">{leaderId}</span>
              <span className="summary-sub">Term {term ?? 0}</span>
            </>
          ) : (
            <span className="summary-muted">No leader</span>
          )}
        </span>
      </div>

      <div className="summary-item">
        <span className="summary-label">Quorum Status</span>
        <span className="summary-value">
          {reachableCount}/{totalNodes} reachable
          <span className={`summary-sub ${hasQuorum ? 'text-teal' : 'text-danger'}`}>
            ({hasQuorum ? 'majority available: yes' : 'majority available: no'})
          </span>
        </span>
      </div>

      <div className="summary-item">
        <span className="summary-label">Cluster Health</span>
        <span className="summary-value">
          <span className={`health-chip ${healthClass}`}>
            <span className="health-dot" />
            {healthLabel}
          </span>
        </span>
      </div>

      <div className="summary-item">
        <span className="summary-label">Turnout</span>
        <span className="summary-value">
          {totalVotes} / 30
          <span className="summary-sub">({turnoutPct}%)</span>
        </span>
      </div>

      <div className="summary-item">
        <span className="summary-label">Time Since Election</span>
        <span className="summary-value">{electionElapsed}</span>
      </div>
    </div>
  );
}
