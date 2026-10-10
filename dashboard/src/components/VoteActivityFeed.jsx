import { useState } from 'react';
import { formatVector } from '../clock';
import CausalityPanel from './CausalityPanel.jsx';

export default function VoteActivityFeed({ activity }) {
  const [selected, setSelected] = useState([]);

  if (!activity || activity.length === 0) {
    return <p className="feed-empty">No vote activity yet — cast a vote to see replication in real time.</p>;
  }

  function toggleSelect(item) {
    if (selected.includes(item)) {
      setSelected(selected.filter((i) => i !== item));
    } else {
      if (selected.length < 2) {
        setSelected([...selected, item]);
      } else {
        setSelected([selected[1], item]);
      }
    }
  }

  return (
    <>
      {selected.length === 2 && (
        <CausalityPanel selectedItems={selected} onClear={() => setSelected([])} />
      )}
      <ul className="activity-feed">
        {activity.map((entry, i) => {
          const direct = !entry.receivedByNode || entry.receivedByNode === entry.handledByNode;
          const isSelected = selected.includes(entry);
          
          let className = 'feed-item';
          if (i === 0) className += ' latest';
          if (isSelected) className += ' selected';

          return (
            <li key={entry.committedAt + '-' + i} className={className} onClick={() => toggleSelect(entry)}>
              <span className="feed-voter">{entry.voterId}</span>
              {' voted '}
              <span className="feed-candidate">{entry.candidateChoice}</span>
              {direct ? (
                <>
                  {' — handled directly by '}
                  <span className="feed-node">{entry.handledByNode}</span>
                  {' (leader)'}
                </>
              ) : (
                <>
                  {' — received by '}
                  <span className="feed-node">{entry.receivedByNode}</span>
                  {', committed by '}
                  <span className="feed-node">{entry.handledByNode}</span>
                </>
              )}
              {' — replicated '}
              <span className="feed-acks">{entry.acks}/{entry.clusterSize}</span>
              
              {entry.receivedClock && (
                <div className="feed-clocks">
                  <span>Recv [L:{entry.receivedClock.lamport} {formatVector(entry.receivedClock.vector)}]</span>
                  {' → '}
                  <span>App [L:{entry.appendClock?.lamport} {formatVector(entry.appendClock?.vector)}]</span>
                  {' → '}
                  <span>Com [L:{entry.commitClock?.lamport} {formatVector(entry.commitClock?.vector)}]</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {selected.length > 0 && selected.length < 2 && (
        <p className="causality-hint">Select one more vote to compare causality.</p>
      )}
    </>
  );
}
