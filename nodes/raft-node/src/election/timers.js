// timers.js
//
// Centralizes all setTimeout/setInterval usage. Nothing else in the
// codebase should touch raw timers directly — this keeps the
// election-timeout and heartbeat logic in one predictable place.

let electionTimer = null;
let heartbeatTimer = null;

const MIN_ELECTION_TIMEOUT_MS = 150;
const MAX_ELECTION_TIMEOUT_MS = 300;
const HEARTBEAT_INTERVAL_MS = 50;

function randomElectionTimeout() {
  return (
    MIN_ELECTION_TIMEOUT_MS +
    Math.random() * (MAX_ELECTION_TIMEOUT_MS - MIN_ELECTION_TIMEOUT_MS)
  );
}

// Call this whenever we receive a valid heartbeat, grant a vote, or
// start up — anything that means "someone else is legitimately
// handling leadership right now, don't start an election."
// The randomized duration is what prevents every node from becoming
// a candidate at exactly the same moment.
function resetElectionTimer(onTimeout) {
  if (electionTimer) clearTimeout(electionTimer);
  electionTimer = setTimeout(onTimeout, randomElectionTimeout());
}

function stopElectionTimer() {
  if (electionTimer) clearTimeout(electionTimer);
  electionTimer = null;
}

// Only the leader runs this. Fires much more frequently than the
// election timeout so followers never time out while we're alive.
function startHeartbeatTimer(onTick) {
  stopHeartbeatTimer();
  heartbeatTimer = setInterval(onTick, HEARTBEAT_INTERVAL_MS);
  onTick(); // send the first heartbeat immediately, don't wait a full interval
}

function stopHeartbeatTimer() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

module.exports = {
  resetElectionTimer,
  stopElectionTimer,
  startHeartbeatTimer,
  stopHeartbeatTimer,
};
