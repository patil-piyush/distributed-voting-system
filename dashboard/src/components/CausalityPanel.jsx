import { compareVectors } from '../clock';

export default function CausalityPanel({ selectedItems, onClear }) {
  if (selectedItems.length !== 2) return null;

  const [a, b] = selectedItems;
  const relation = compareVectors(a.receivedClock?.vector, b.receivedClock?.vector);
  
  let relationText;
  if (relation === 'before') {
    relationText = `${a.voterId}'s vote happened BEFORE ${b.voterId}'s vote`;
  } else if (relation === 'after') {
    relationText = `${a.voterId}'s vote happened AFTER ${b.voterId}'s vote`;
  } else if (relation === 'equal') {
    relationText = `Both votes happened at the exact same logical time (equal)`;
  } else if (relation === 'concurrent') {
    relationText = `Votes were CONCURRENT — neither happened before the other`;
  } else {
    relationText = 'Missing clock data';
  }

  const logOrderText = a.index < b.index 
    ? `${a.voterId}'s vote committed first (index ${a.index} vs ${b.index})`
    : `${b.voterId}'s vote committed first (index ${b.index} vs ${a.index})`;

  return (
    <div className="causality-panel">
      <div className="causality-header">
        <h3>Causality Analysis</h3>
        <button onClick={onClear} className="clear-btn">Clear</button>
      </div>
      
      <div className="causality-result">
        <p className={`relation relation-${relation}`}>{relationText}</p>
        <p className="log-order">Raft Log Order: {logOrderText}</p>
      </div>
    </div>
  );
}
