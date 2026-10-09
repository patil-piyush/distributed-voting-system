export default function LiveTally({ tally, candidates }) {
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(tally));

  return (
    <div className="tally">
      {candidates.map((c) => {
        const count = tally[c.id] || 0;
        const pct = Math.round((count / max) * 100);
        return (
          <div key={c.id} className="tally-row">
            <div className="tally-label">
              <span>{c.name}</span>
              <span>{count}</span>
            </div>
            <div className="tally-bar-track">
              <div className="tally-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      <div className="tally-total">Total committed votes: {total}</div>
    </div>
  );
}
