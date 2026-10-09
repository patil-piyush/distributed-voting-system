export default function VoteActivityFeed({ activity }) {
  if (!activity || activity.length === 0) {
    return <p className="feed-empty">No vote activity yet — cast a vote to see replication in real time.</p>;
  }

  return (
    <ul className="activity-feed">
      {activity.map((entry, i) => {
        const direct = !entry.receivedByNode || entry.receivedByNode === entry.handledByNode;

        return (
          <li key={entry.committedAt + '-' + i} className={i === 0 ? 'feed-item latest' : 'feed-item'}>
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
          </li>
        );
      })}
    </ul>
  );
}
