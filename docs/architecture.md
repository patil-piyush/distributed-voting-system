# Architecture

## High-level design

Five identical Express node processes form a Raft cluster. Nodes
communicate peer-to-peer over HTTP — there is no central coordinator.
Leadership emerges from an election protocol and can move between
nodes at any time (e.g. after a failure). Voters (via the React
dashboard, or any HTTP client) can submit a vote to *any* of the 5
nodes; the node forwards it to the current leader if needed.

```
 Voter (browser)
      |
      v
 API on any of 5 nodes  --(if not leader)-->  forwards to current leader
      |
      v
 Leader node: appends vote to its log,
 replicates to all followers via AppendEntries RPC
      |
      v
 Once a MAJORITY of nodes acknowledge, the entry is committed
      |
      v
 Live tally + node status pushed to dashboard via Socket.io
```

## Low-level design — per-node data model

**RaftState (in-memory, per node):**
```
currentTerm: number
votedFor: string | null
role: "follower" | "candidate" | "leader"
log: LogEntry[]
commitIndex: number
votesReceived: Set<string>   // only while role === "candidate"
currentLeaderId: string | null
```

**LogEntry:**
```
term: number
index: number
command: { voterId, candidateChoice, receivedByNode }
```

`receivedByNode` records which node the voter's HTTP request originally
landed on — this may differ from the leader that committed the entry,
since non-leader nodes forward votes transparently.

## File responsibilities (nodes/raft-node/src)

| File | Responsibility |
|---|---|
| `config/peers.js` | Reads this node's identity and peer list from environment variables |
| `state/raftState.js` | Single source of truth for Raft state; all mutation goes through named functions |
| `election/timers.js` | Owns all setTimeout/setInterval usage — election timeout and leader heartbeat |
| `rpc/peerClient.js` | Outbound HTTP calls to peers, never throws on an unreachable peer |
| `rpc/requestVote.js` | Runs elections; answers other nodes' vote requests |
| `rpc/appendEntries.js` | Leader: sends heartbeats/replicates entries. Follower: processes them |
| `routes/clusterRoutes.js` | Internal node-to-node endpoints (`/rpc/request-vote`, `/rpc/append-entries`) |
| `routes/voteRoutes.js` | Voter-facing endpoints (`/vote`, `/status`, `/tally`) |
| `routes/authRoutes.js` | Voter login (`/auth/login`) |
| `routes/candidateRoutes.js` | Lists candidates on the ballot |
| `auth/authService.js` | Password check + JWT issue/verify |
| `auth/authMiddleware.js` | Protects `/vote` — requires a valid JWT |
| `data/voters.js` | Static, identical-on-every-node voter registry |
| `data/candidates.js` | Static, identical-on-every-node candidate list |
| `realtime/socketServer.js` | Socket.io wrapper — pushes live status, tally, and vote-activity events |
| `server.js` | Wires everything together, starts the election clock |

## Concurrency handling

Multiple voters can hit different nodes at the same instant. Two
things make this safe:

1. **Synchronous log append.** `raftState.appendLogEntry()` runs
   synchronously with no `await` before it — since Node.js is
   single-threaded, two overlapping `/vote` requests can't corrupt
   or overwrite each other's log index, because each request's
   synchronous code runs to completion before the event loop
   switches to the other.
2. **Double-vote guard.** Before appending, the leader scans its log
   for the voter's ID and rejects if already present (see
   `raftState.hasVoterVoted`).

## Storage & Catch-Up (FA-2)

- **Persistence:** Nodes save their core Raft state (`currentTerm`, `votedFor`, `log`, `commitIndex`) to a local JSON file in `${DATA_DIR}/${NODE_ID}.json`. The file is overwritten synchronously using a temporary file and atomic `fs.renameSync` upon every mutating change (e.g. appending a log entry, voting in an election, advancing commit index).
- **Log Catch-Up:** A node restarting after failure will automatically catch up. The leader tracks `nextIndex` and `matchIndex` for every follower. If an `AppendEntries` RPC is rejected by a follower, the leader decrements `nextIndex` for that follower and retries in the next heartbeat, stepping backwards through the log until it finds the point of divergence, truncates any conflicts, and forces the follower to replicate the missing entries up to the current tip.

## Advanced Consistency Mechanisms

1. **Election Log Up-to-Date Rule:** A node will reject a `RequestVote` RPC if the candidate's log is less up-to-date than its own (comparing the term of the last entry, and then the length of the log). This guarantees that a node lacking committed entries can never win an election, preserving safety across failovers.
2. **Causal Clocks:** A Lamport logical clock and Vector clock (`clock/clocks.js`) follow every vote event. The vector keys are node IDs. Clocks tick strictly on vote lifecycle events, not heartbeats.
3. **Cluster Audit:** An unauthenticated `GET /audit` endpoint pulls the committed log of every reachable node to compare against the highest `commitIndex` node, providing a cluster-wide view of consistency (and proving no node has diverged).
4. **Mutual Exclusion:** `mutex/ricartAgrawala.js` provides distributed locking for a shared resource (a results file). The implementation uses Lamport clocks to order concurrent requests. Since it relies on timeouts, it treats partitions as crashes and is unsafe under true network partitions.

## Known, deliberate simplifications (see also root README)

- Voter/candidate data is static, not distributed via consensus.
- No real SMS OTP (see root README for reasoning).
- No log compaction/snapshots.
- Static cluster membership.
