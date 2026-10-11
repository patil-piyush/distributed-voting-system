import { useState, useEffect, useRef } from 'react';

export default function NodeStatus({
  nodeId,
  status,
  debugState,
  connected,
  leaderId,
  leaderLastLogIndex,
  onSelectNode,
}) {
  const [flash, setFlash] = useState(false);
  const prevLogLength = useRef(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const curLength = debugState?.lastLogIndex !== undefined ? debugState.lastLogIndex + 1 : status?.logLength;
  useEffect(() => {
    if (curLength !== undefined && prevLogLength.current !== null && curLength > prevLogLength.current) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(timer);
    }
    if (curLength !== undefined) prevLogLength.current = curLength;
  }, [curLength]);

  if (!connected) {
    return (
      <div className="node-card down" onClick={() => onSelectNode?.(nodeId)}>
        <div className="node-card-header">
          <strong>{nodeId}</strong>
          <span className="badge-down">DOWN</span>
        </div>
        <div className="node-card-body">
          <span className="node-down-msg">Unreachable / Stopped</span>
        </div>
      </div>
    );
  }

  const role = debugState?.role || status?.role || 'follower';
  const term = debugState?.term ?? status?.currentTerm ?? 0;
  const isLeader = role === 'leader';

  // Uptime formatting
  const uptimeSec = debugState?.uptimeSec ?? 0;
  const uptimeStr = `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`;

  // Heartbeat age
  let heartbeatStr = '—';
  if (isLeader) {
    heartbeatStr = 'active (sending)';
  } else if (debugState?.lastHeartbeatAgoMs !== null && debugState?.lastHeartbeatAgoMs !== undefined) {
    // Tick relative to client time
    const ms = Math.max(0, debugState.lastHeartbeatAgoMs + (now - (debugState._fetchedAt || now)));
    heartbeatStr = ms < 1000 ? `${Math.round(ms)}ms ago` : `${(ms / 1000).toFixed(1)}s ago`;
  }

  // Entries breakdown: "2 entries (1 vote + 1 no-op)"
  const totalEntries = debugState?.lastLogIndex !== undefined
    ? Math.max(0, debugState.lastLogIndex + 1)
    : (status?.logLength ?? 0);
  const voteCount = debugState?.voteCount ?? 0;
  const noopCount = Math.max(0, totalEntries - voteCount);
  const entriesLabel = `${totalEntries} entries (${voteCount} vote + ${noopCount} no-op)`;

  // Lag behind leader
  let lagStr = '0 behind';
  if (isLeader) {
    lagStr = 'leader';
  } else if (leaderLastLogIndex !== undefined && leaderLastLogIndex >= 0) {
    const myLast = debugState?.lastLogIndex !== undefined ? debugState.lastLogIndex : (status?.logLength ? status.logLength - 1 : -1);
    const lag = Math.max(0, leaderLastLogIndex - myLast);
    lagStr = `${lag} behind`;
  }

  // Persisted size
  const persistBytes = debugState?.persist?.bytes ?? 0;
  const persistStr = persistBytes > 1024 ? `${(persistBytes / 1024).toFixed(1)} KB` : `${persistBytes} B`;

  return (
    <div
      className={`node-card role-${role}${flash ? ' replication-flash' : ''}`}
      onClick={() => onSelectNode?.(nodeId)}
      title="Click to view detailed telemetry & log"
    >
      <div className="node-card-header">
        <strong className="node-id-title">{nodeId}</strong>
        <span className={`role-badge role-${role}`}>{role.toUpperCase()}</span>
      </div>

      <div className="node-card-body">
        <div className="node-meta-row">
          <span className="node-meta-label">Term:</span>
          <span className="node-meta-val">{term}</span>
          <span className="node-meta-label">Voted:</span>
          <span className="node-meta-val">{debugState?.votedFor || 'None'}</span>
        </div>

        <div className="node-meta-row">
          <span className="node-meta-label">Entries:</span>
          <span className="node-meta-val font-mono">{entriesLabel}</span>
        </div>

        <div className="node-meta-row">
          <span className="node-meta-label">Lag:</span>
          <span className={`node-meta-val ${lagStr !== '0 behind' && lagStr !== 'leader' ? 'text-amber' : ''}`}>
            {lagStr}
          </span>
          <span className="node-meta-label">Persist:</span>
          <span className="node-meta-val">{persistStr}</span>
        </div>

        <div className="node-meta-row">
          <span className="node-meta-label">Heartbeat:</span>
          <span className="node-meta-val font-mono">{heartbeatStr}</span>
        </div>

        <div className="node-meta-row">
          <span className="node-meta-label">Uptime:</span>
          <span className="node-meta-val">{uptimeStr}</span>
          {isLeader && debugState?.counters?.electionsWon !== undefined && (
            <>
              <span className="node-meta-label">Won:</span>
              <span className="node-meta-val">{debugState.counters.electionsWon}</span>
            </>
          )}
        </div>
      </div>
      <div className="node-card-footer">
        <span className="inspect-hint">Click for details →</span>
      </div>
    </div>
  );
}
