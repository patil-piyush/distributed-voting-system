import { useState } from 'react';

const CATEGORIES = {
  ALL: 'all',
  ELECTIONS: 'elections',
  LEADERSHIP: 'leadership',
  COMMITS: 'commits',
  CATCHUP: 'catch-up',
  FAILURES: 'failures',
};

function getEventCategory(type) {
  if (['electionStarted', 'vote-granted', 'vote-denied'].includes(type)) return 'elections';
  if (['leader-elected', 'stepped-down'].includes(type)) return 'leadership';
  if (['commit-advanced', 'vote-200', 'vote-activity'].includes(type)) return 'commits';
  if (['catch-up', 'append-received'].includes(type)) return 'catch-up';
  if (['append-failed', 'node-disconnected', 'vote-409'].includes(type)) return 'failures';
  return 'other';
}

function getEventBadgeClass(type) {
  if (type === 'leader-elected') return 'badge-leader';
  if (['electionStarted', 'stepped-down'].includes(type)) return 'badge-candidate';
  if (['commit-advanced', 'vote-200'].includes(type)) return 'badge-commit';
  if (type === 'catch-up') return 'badge-catchup';
  if (['append-failed', 'node-disconnected', 'vote-409'].includes(type)) return 'badge-fail';
  if (type === 'node-connected') return 'badge-connected';
  return 'badge-neutral';
}

function formatDetail(item) {
  const { type, detail, term } = item;
  switch (type) {
    case 'electionStarted':
      return `Started election for Term ${term}`;
    case 'leader-elected':
      return `Won majority votes and became LEADER for Term ${term}`;
    case 'stepped-down':
      return `Stepped down to follower (Term ${detail?.toTerm ?? term})`;
    case 'vote-granted':
      return `Granted vote to candidate ${detail?.candidateId || 'peer'}`;
    case 'vote-denied':
      return `Denied vote request from candidate ${detail?.candidateId || 'peer'}`;
    case 'commit-advanced':
      return `Advanced commit index to #${detail?.commitIndex}`;
    case 'catch-up':
      return `Caught up ${detail?.count ?? detail?.entriesCount ?? 0} log entries from ${detail?.leaderId || 'leader'}${detail?.truncated ? ' (log truncated)' : ''}`;
    case 'append-received':
      return `Received ${detail?.count} log entries from leader ${detail?.leaderId || ''}`;
    case 'append-failed':
      return `AppendEntries RPC to ${detail?.peerId} failed (peer may be offline)`;
    case 'vote-200':
      return `Vote by ${detail?.voterId || 'voter'} for candidate ${detail?.choice || ''} committed (HTTP 200)`;
    case 'vote-202':
      return `Vote by ${detail?.voterId || 'voter'} appended but pending quorum (HTTP 202)`;
    case 'vote-409':
      return `Rejected duplicate vote by ${detail?.voterId || 'voter'} (HTTP 409)`;
    case 'vote-forwarded':
      return `Forwarded voter request to leader ${detail?.leaderId || ''}`;
    case 'node-started':
      return `Node booted up on port ${detail?.port || ''}`;
    case 'node-connected':
      return `Node reconnected to dashboard websocket`;
    case 'node-disconnected':
      return `Node websocket disconnected (node down / stopped)`;
    default:
      return typeof detail === 'string' ? detail : JSON.stringify(detail || {});
  }
}

export default function EventsTab({ events, onClearEvents, leadershipHistory = {} }) {
  const [filter, setFilter] = useState(CATEGORIES.ALL);

  const filteredEvents = events.filter((ev) => {
    if (filter === CATEGORIES.ALL) return true;
    const cat = getEventCategory(ev.type);
    return cat === filter;
  });

  const sortedTerms = Object.keys(leadershipHistory)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="events-tab">
      {/* Leadership History Strip */}
      <div className="panel leadership-strip-panel">
        <div className="panel-header-row">
          <h2>Leadership History by Term</h2>
          <span className="tab-sub">Tracks which node held leadership across terms</span>
        </div>
        {sortedTerms.length === 0 ? (
          <div className="empty-state">No leadership transitions recorded yet.</div>
        ) : (
          <div className="leadership-segments">
            {sortedTerms.map((term, idx) => (
              <div key={term} className="leadership-segment">
                <span className="term-num">Term {term}</span>
                <span className="leader-node-pill">{leadershipHistory[term]}</span>
                {idx < sortedTerms.length - 1 && <span className="arrow-next">→</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cluster Events Timeline */}
      <div className="panel timeline-panel">
        <div className="panel-header-row">
          <div>
            <h2>Cluster Events Timeline</h2>
            <span className="tab-sub">
              Live broadcast events from Raft state transitions and connection monitors ({events.length}/100)
            </span>
          </div>
          <button className="clear-btn" onClick={onClearEvents} title="Clear event history">
            Clear Timeline
          </button>
        </div>

        {/* Filter chips */}
        <div className="filter-chips">
          {Object.entries(CATEGORIES).map(([label, val]) => (
            <button
              key={val}
              className={`chip ${filter === val ? 'chip-active' : ''}`}
              onClick={() => setFilter(val)}
            >
              {label.toLowerCase()}
            </button>
          ))}
        </div>

        {filteredEvents.length === 0 ? (
          <div className="empty-state">No events matching filter &ldquo;{filter}&rdquo;.</div>
        ) : (
          <div className="timeline-list">
            {filteredEvents.map((ev, i) => {
              const timeStr = ev.at ? new Date(ev.at).toLocaleTimeString() : '—';
              return (
                <div key={i} className="timeline-item">
                  <span className="timeline-time font-mono">{timeStr}</span>
                  <span className="timeline-node font-mono">{ev.nodeId}</span>
                  <span className={`timeline-badge ${getEventBadgeClass(ev.type)}`}>
                    {ev.type}
                  </span>
                  <span className="timeline-desc">{formatDetail(ev)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
