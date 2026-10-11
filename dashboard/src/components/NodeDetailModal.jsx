export default function NodeDetailModal({ node, onClose }) {
  if (!node) return null;

  const { nodeId, debugState, connected } = node;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3>{nodeId} State & Telemetry</h3>
            <span className={`node-badge badge-${connected ? (debugState?.role || 'follower') : 'down'}`}>
              {connected ? (debugState?.role || 'follower') : 'DOWN'}
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!connected || !debugState ? (
          <div className="empty-state">Node is unreachable or stopped.</div>
        ) : (
          <div className="modal-body">
            {/* Meta row */}
            <div className="modal-meta-grid">
              <div className="meta-item">
                <span className="meta-label">Term</span>
                <span className="meta-val">{debugState.term ?? '—'}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Voted For</span>
                <span className="meta-val">{debugState.votedFor || 'None'}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Uptime</span>
                <span className="meta-val">
                  {debugState.uptimeSec !== undefined
                    ? `${Math.floor(debugState.uptimeSec / 60)}m ${debugState.uptimeSec % 60}s`
                    : '—'}
                </span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Mutex State</span>
                <span className="meta-val">{debugState.mutex || 'RELEASED'}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Persisted File</span>
                <span className="meta-val">
                  {debugState.persist?.bytes !== undefined
                    ? `${debugState.persist.bytes} B`
                    : '—'}
                </span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Lamport Clock</span>
                <span className="meta-val">{debugState.clock?.lamport ?? 0}</span>
              </div>
            </div>

            {/* Vector Clock snapshot */}
            <div className="modal-section">
              <h4>Vector Clock Snapshot</h4>
              <div className="vector-clock-row">
                {Object.entries(debugState.clock?.vector || {}).map(([nid, val]) => (
                  <span key={nid} className="vector-chip">
                    <strong>{nid}:</strong> {val}
                  </span>
                ))}
              </div>
            </div>

            {/* Counters */}
            <div className="modal-section">
              <h4>Telemetry Counters</h4>
              <div className="counters-grid">
                {Object.entries(debugState.counters || {}).map(([k, v]) => (
                  <div key={k} className="counter-cell">
                    <span className="counter-name">{k}</span>
                    <span className="counter-num">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Log Tail (last 25 entries) */}
            <div className="modal-section">
              <h4>Recent Log Entries (Tail 25)</h4>
              {(!debugState.logTail || debugState.logTail.length === 0) ? (
                <div className="empty-state">Log is empty.</div>
              ) : (
                <div className="log-table-wrap">
                  <table className="log-tail-table">
                    <thead>
                      <tr>
                        <th>Idx</th>
                        <th>Term</th>
                        <th>Kind</th>
                        <th>Voter</th>
                        <th>Choice</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debugState.logTail.map((entry) => (
                        <tr
                          key={entry.index}
                          className={entry.committed ? 'log-row-committed' : 'log-row-uncommitted'}
                        >
                          <td>#{entry.index}</td>
                          <td>T{entry.term}</td>
                          <td>
                            <span className={`kind-tag kind-${entry.kind}`}>
                              {entry.kind}
                            </span>
                          </td>
                          <td>{entry.voterId || '—'}</td>
                          <td>{entry.choice || '—'}</td>
                          <td>
                            <span className={`status-pill ${entry.committed ? 'pill-committed' : 'pill-uncommitted'}`}>
                              {entry.committed ? 'committed' : 'uncommitted'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
