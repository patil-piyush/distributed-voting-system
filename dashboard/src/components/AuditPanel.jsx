import { useState } from 'react';
import axios from 'axios';
import { NODES } from '../api';

// Tries each node in order until one responds to GET /audit.
async function fetchAudit() {
  for (const node of NODES) {
    try {
      const res = await axios.get(`${node.url}/audit`, { timeout: 3000 });
      return res.data;
    } catch {
      continue;
    }
  }
  throw new Error('All nodes unreachable');
}

export default function AuditPanel() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function runAudit() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAudit();
      setResult(data);
    } catch (err) {
      setError(err.message || 'Audit failed');
    } finally {
      setLoading(false);
    }
  }

  function statusLabel(node) {
    if (!node.reachable) return 'unreachable';
    return node.inSync ? 'in sync' : 'diverged';
  }

  function statusClass(node) {
    if (!node.reachable) return 'audit-unreachable';
    return node.inSync ? 'audit-in-sync' : 'audit-diverged';
  }

  return (
    <div>
      <div className="audit-header">
        <h2>Cluster Consistency Audit</h2>
        <button
          id="run-audit-btn"
          className="audit-btn"
          onClick={runAudit}
          disabled={loading}
        >
          {loading ? 'Running…' : 'Run Cluster Audit'}
        </button>
      </div>

      {error && <p className="audit-error">{error}</p>}

      {result && (
        <>
          <div className={`audit-banner ${result.consistent ? 'audit-banner-ok' : 'audit-banner-warn'}`}>
            {result.consistent
              ? `✓ Cluster consistent — all ${result.reachableCount} reachable nodes agree up to index ${result.comparedUpToIndex}`
              : `⚠ Inconsistency detected — compared up to index ${result.comparedUpToIndex}`}
          </div>

          <table className="audit-table">
            <thead>
              <tr>
                <th>Node</th>
                <th>Reachable</th>
                <th>Role</th>
                <th>Term</th>
                <th>Log</th>
                <th>Commit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.nodes.map((node) => (
                <tr key={node.nodeId} className={statusClass(node)}>
                  <td>{node.nodeId}</td>
                  <td>{node.reachable ? 'yes' : 'no'}</td>
                  <td>{node.role ?? '—'}</td>
                  <td>{node.term ?? '—'}</td>
                  <td>{node.logLength ?? '—'}</td>
                  <td>{node.commitIndex ?? '—'}</td>
                  <td className="audit-status-cell">
                    {statusLabel(node)}
                    {node.firstDivergenceIndex !== null && node.firstDivergenceIndex !== undefined && (
                      <span className="audit-diverge-idx"> (at index {node.firstDivergenceIndex})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="audit-timestamp">Audited at {new Date(result.auditedAt).toLocaleTimeString()}</p>
        </>
      )}
    </div>
  );
}
