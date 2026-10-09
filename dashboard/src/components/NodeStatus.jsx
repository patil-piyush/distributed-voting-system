import { useEffect, useRef, useState } from 'react';

export default function NodeStatus({ nodeId, status, connected }) {
  const prevLogLength = useRef(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (status && prevLogLength.current !== null && status.logLength > prevLogLength.current) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(timer);
    }
    if (status) prevLogLength.current = status.logLength;
  }, [status?.logLength]);

  // Also update ref when not flashing (covers the initial render)
  useEffect(() => {
    if (status) prevLogLength.current = status.logLength;
  }, [status?.logLength]);

  if (!connected || !status) {
    return (
      <div className="node-card down">
        <strong>{nodeId}</strong>
        <span className="role">unreachable</span>
      </div>
    );
  }

  return (
    <div className={`node-card role-${status.role}${flash ? ' replication-flash' : ''}`}>
      <strong>{nodeId}</strong>
      <span className="role">{status.role}</span>
      <span className="detail">term {status.currentTerm}</span>
      <span className="detail">log {status.logLength} · committed {status.commitIndex + 1}</span>
    </div>
  );
}
