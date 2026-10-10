import { useState } from 'react';
import { publishResults, NODES } from '../api';

export default function MutexPanel({ events }) {
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');

  async function handlePublishAll() {
    setPublishing(true);
    setMessage('Firing 5 simultaneous publish requests...');
    
    try {
      await Promise.all(NODES.map(n => publishResults(n.url).catch(err => ({ error: err.message }))));
      setMessage('All nodes completed publication requests.');
    } catch (err) {
      setMessage('Error during publication.');
    } finally {
      setPublishing(false);
    }
  }

  // Check for overlaps: 
  // An overlap occurs if an ENTER event is seen while another node is already in ENTER state 
  // (has not seen an EXIT event).
  let heldBy = null;
  let overlapping = false;
  
  const sortedEvents = [...events].reverse(); // oldest first to analyze overlap
  for (const e of sortedEvents) {
    if (e.event === 'ENTER') {
      if (heldBy && heldBy !== e.node) {
        overlapping = true;
      }
      heldBy = e.node;
    } else if (e.event === 'EXIT') {
      if (heldBy === e.node) {
        heldBy = null;
      }
    }
  }

  return (
    <div className="mutex-panel">
      <div className="mutex-header">
        <h2>Ricart-Agrawala Mutual Exclusion</h2>
        <button className="mutex-btn" onClick={handlePublishAll} disabled={publishing}>
          {publishing ? 'Publishing...' : 'Publish results from ALL 5 nodes at once'}
        </button>
      </div>
      
      {message && <p className="mutex-message">{message}</p>}

      <div className={`mutex-status ${overlapping ? 'mutex-danger' : 'mutex-safe'}`}>
        {events.length === 0 ? 'Waiting for events...' :
         overlapping ? 'DANGER: Overlapping critical sections detected!' : 'Mutual exclusion held'}
      </div>

      <ul className="mutex-timeline">
        {events.map((e, i) => (
          <li key={i} className={`mutex-item mutex-${e.event.toLowerCase()}`}>
            <span className="mutex-time">{new Date(e.at).toLocaleTimeString()}</span>
            <span className="mutex-node">{e.node}</span>
            <span className="mutex-action">{e.event}</span>
            <span className="mutex-lamport">Lamport: {e.ts}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
