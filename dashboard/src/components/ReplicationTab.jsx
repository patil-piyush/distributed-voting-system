export default function ReplicationTab({ nodes, debugStates, connected, statuses }) {
  // Find highest log index across all reachable nodes
  let maxLogIndex = 0;
  for (const node of nodes) {
    const ds = debugStates[node.id];
    if (ds && ds.lastLogIndex !== undefined && ds.lastLogIndex > maxLogIndex) {
      maxLogIndex = ds.lastLogIndex;
    }
  }

  // Last 20 indices window
  const windowSize = 20;
  const startIdx = Math.max(0, maxLogIndex - windowSize + 1);
  const indices = [];
  for (let i = startIdx; i <= maxLogIndex; i++) {
    indices.push(i);
  }

  // Identify leader node
  const leaderNode = nodes.find((n) => connected[n.id] && debugStates[n.id]?.role === 'leader');
  const leaderState = leaderNode ? debugStates[leaderNode.id] : null;

  return (
    <div className="replication-tab">
      <div className="panel">
        <div className="panel-header-row">
          <div>
            <h2>Log Alignment Grid</h2>
            <p className="tab-sub">
              Visualizes log alignment across all nodes (last {indices.length} entries). Notice cells fill in from missing to committed during catch-up!
            </p>
          </div>
          <div className="grid-legend">
            <span className="legend-item">
              <span className="cell-sample cell-committed" /> Present & Committed
            </span>
            <span className="legend-item">
              <span className="cell-sample cell-uncommitted" /> Present & Uncommitted
            </span>
            <span className="legend-item">
              <span className="cell-sample cell-missing" /> Missing / Behind
            </span>
          </div>
        </div>

        <div className="log-grid-container">
          <table className="log-grid-table">
            <thead>
              <tr>
                <th className="node-col-header">Node</th>
                {indices.map((idx) => (
                  <th key={idx} className="idx-col-header">
                    #{idx}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => {
                const isConn = connected[node.id];
                const ds = debugStates[node.id];
                const role = ds?.role || statuses[node.id]?.role || (isConn ? 'follower' : 'down');
                const lastIdx = ds?.lastLogIndex ?? (statuses[node.id]?.logLength ? statuses[node.id].logLength - 1 : -1);
                const commitIdx = ds?.commitIndex ?? statuses[node.id]?.commitIndex ?? -1;

                return (
                  <tr key={node.id} className={`grid-node-row ${!isConn ? 'row-down' : ''}`}>
                    <td className="node-label-cell">
                      <strong>{node.id}</strong>
                      <span className={`mini-badge badge-${isConn ? role : 'down'}`}>
                        {isConn ? role : 'DOWN'}
                      </span>
                    </td>
                    {indices.map((idx) => {
                      if (!isConn) {
                        return (
                          <td key={idx} className="grid-cell cell-missing" title={`${node.id} is DOWN`}>
                            <span className="cell-inner">—</span>
                          </td>
                        );
                      }

                      const hasEntry = idx <= lastIdx;
                      const isCommitted = hasEntry && idx <= commitIdx;
                      let cellClass = 'cell-missing';
                      let statusText = 'Missing';

                      if (isCommitted) {
                        cellClass = 'cell-committed';
                        statusText = 'Committed';
                      } else if (hasEntry) {
                        cellClass = 'cell-uncommitted';
                        statusText = 'Uncommitted';
                      }

                      // Check kind if available
                      const entryInfo = ds?.logTail?.find((e) => e.index === idx);
                      const kind = entryInfo?.kind ? (entryInfo.kind === 'noop' ? '∅' : 'V') : '';

                      return (
                        <td
                          key={idx}
                          className={`grid-cell ${cellClass}`}
                          title={`${node.id} #${idx}: ${statusText}${entryInfo ? ` (${entryInfo.kind})` : ''}`}
                        >
                          <span className="cell-inner">{kind || (hasEntry ? '✓' : '·')}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leader Replication Table */}
      <div className="panel replication-leader-panel">
        <div className="panel-header-row">
          <h2>Leader Replication Status (nextIndex / matchIndex / lag)</h2>
          {leaderNode && (
            <span className="leader-indicator">
              Active Leader: <strong>{leaderNode.id}</strong> (Term {leaderState?.term ?? 0})
            </span>
          )}
        </div>

        {!leaderNode || !leaderState?.replication ? (
          <div className="empty-state">
            {leaderNode ? 'Collecting replication metadata…' : 'No active leader elected. Election in progress.'}
          </div>
        ) : (
          <div className="replication-table-wrap">
            <table className="replication-table">
              <thead>
                <tr>
                  <th>Follower</th>
                  <th>Status</th>
                  <th>Match Index</th>
                  <th>Next Index</th>
                  <th>Lag Behind Leader</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(leaderState.replication).map(([peerId, rep]) => {
                  const isPeerConn = connected[peerId];
                  const lag = rep.lag ?? 0;
                  const maxLag = Math.max(1, maxLogIndex);
                  const lagPercent = Math.min(100, Math.round((lag / maxLag) * 100));

                  return (
                    <tr key={peerId}>
                      <td>
                        <strong>{peerId}</strong>
                      </td>
                      <td>
                        <span className={`status-pill ${isPeerConn ? 'pill-in-sync' : 'pill-down'}`}>
                          {isPeerConn ? 'Connected' : 'DOWN'}
                        </span>
                      </td>
                      <td className="font-mono">{rep.matchIndex ?? '—'}</td>
                      <td className="font-mono">{rep.nextIndex ?? '—'}</td>
                      <td>
                        <div className="lag-bar-container">
                          <div
                            className={`lag-bar-fill ${lag === 0 ? 'lag-zero' : 'lag-behind'}`}
                            style={{ width: `${Math.max(6, Math.min(100, lagPercent + (lag > 0 ? 15 : 0)))}%` }}
                          />
                          <span className="lag-bar-text">
                            {lag === 0 ? '0 entries (in sync)' : `${lag} entries behind`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
