# FA-2 Updates

This document summarizes the changes made to the system between the FA-1 and FA-2 evaluation periods.

## What's New

1. **Docker Compose & Containerization**
   - The entire cluster and dashboard are now orchestrated using Docker Compose (`docker-compose.yml`).
   - The backend timeouts (election timeouts, heartbeat, RPC) are now extracted into `config/peers.js` and configurable via `.env` or Compose environment variables, enabling the system to run cleanly in a containerized network.
   - Replaced manual 6-terminal startup with a single `npm run docker:up` command.

2. **Persistence and Automatic Catch-Up**
   - **Persistence**: Core Raft state (`currentTerm`, `votedFor`, `log`, `commitIndex`) is now persisted atomically to a local JSON file via a temporary file + `fs.renameSync` swap.
   - **Catch-up Mechanism**: The leader now actively tracks `nextIndex` and `matchIndex` per follower. When a node restarts and misses entries, the leader automatically rewinds the log backwards to find the divergence point and streams the missing entries. 

3. **Election Up-to-Date Rule**
   - Implemented Raft's log safety property: a node will reject a candidate's `RequestVote` if the candidate's log is less up-to-date (by last entry term and log length). This strictly prevents nodes missing committed entries from hijacking leadership.

4. **Logical & Vector Clocks (Causality)**
   - Added `src/clock/clocks.js` implementing Lamport and Vector clocks.
   - Clocks strictly tick on vote lifecycle events (receipt, append, commit) and are attached to the entry. Clocks skip heartbeats to stay meaningful.
   - The dashboard includes a new **Causality Panel** that evaluates vectors between two votes to determine if they are concurrent or strictly ordered (`before`/`after`).

5. **Cluster Consistency Audit**
   - Introduced a `GET /audit` endpoint and corresponding dashboard panel.
   - This endpoint acts as a global state collector, pulling committed logs from all reachable nodes and running a mathematical comparison across the cluster to prove no node has diverged from the leader.

6. **Ricart-Agrawala Mutual Exclusion**
   - Implemented distributed locking for a shared resource (`src/mutex/ricartAgrawala.js`).
   - The admin dashboard button issues simultaneous publish requests across all nodes. The nodes gracefully coordinate using Ricart-Agrawala and Lamport timestamps as tie-breakers to ensure zero overlap of critical sections when writing to the shared `results-publication.log` file.

## Known Limitations

We are transparent about the deliberate scoping choices for this implementation:

- **No log compaction/snapshots**: The persistent log will grow indefinitely. In a production Raft implementation, logs are compacted periodically.
- **Static cluster membership**: The cluster expects exactly the 5 nodes configured in `.env`/Compose. Dynamic node addition/removal is not implemented.
- **In-memory voter registry**: The system still uses a static list of hardcoded voters.
- **Partition vulnerability in Ricart-Agrawala**: The mutex implementation treats unresponsive peers as crashed. In a true network partition, separated quorums could both acquire the lock. (Raft itself remains safe under partitions, but the mutex does not).
- **Crash-fault tolerance only**: The implementation guards against node crashes/network drops. It assumes no Byzantine faults (nodes actively attempting to corrupt the log).
