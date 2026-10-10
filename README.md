# Distributed Voting System

A fault-tolerant, distributed voting system built on a from-scratch implementation of the [Raft consensus algorithm](https://raft.github.io/). Five independent Node.js/Express processes form a peer-to-peer cluster that elects a leader, replicates every vote to a majority before committing it, and continues operating correctly even when up to two of the five nodes fail. A React dashboard connects to all five nodes simultaneously, providing real-time visibility into leader elections, vote replication, and result tallying — making the "distributed" part of the system observable during a live demo.

## Key Features

- **Leader election** — randomized election timeouts with no fixed coordinator; leadership emerges and migrates automatically on failure
- **Log replication with majority commit** — every vote is replicated to a quorum before being committed, guaranteeing consistency
- **Fault tolerance & automatic failover** — the cluster tolerates up to 2 node failures; a new leader is elected within ~1 second
- **Safety under minority partition** — the cluster refuses to commit anything without majority agreement, even if surviving nodes are reachable
- **JWT voter authentication** — voters log in with credentials, receive a signed JWT; voter identity comes from the token, not the request body
- **Double-vote prevention** — the leader checks the committed log before accepting a new vote, enforced cluster-wide regardless of which node the voter connects to
- **Vote forwarding** — voters can submit to any node; non-leader nodes transparently forward to the current leader
- **Live dashboard via WebSocket** — real-time node status (role/term/log length), live tally bar chart, and a Vote Activity Feed showing per-vote routing and replication
- **Replication flash** — node status cards briefly pulse when their log grows, making replication visually "ripple" across the cluster
- **Concurrent load test** — a bundled script fires 30 voters at random nodes simultaneously and verifies all 5 nodes converge on an identical tally

## Architecture

Five identical Express processes form a Raft cluster, communicating peer-to-peer over HTTP RPCs (`RequestVote` and `AppendEntries`). There is no central coordinator — leadership emerges from an election protocol and can move between nodes at any time. Voters submit votes to any node; if that node isn't the leader, it forwards the request (along with the voter's JWT) to whoever it believes the current leader is. The leader appends the vote to its log, replicates it to all followers in parallel, and commits it once a majority acknowledge. Live status, tally, and vote-activity events are pushed to the dashboard over Socket.io.

> For the full high-level and low-level design (state model, file responsibilities, concurrency handling), see [docs/architecture.md](docs/architecture.md).

## Tech Stack

### Backend (per node)

| Dependency | Purpose |
|---|---|
| Node.js + Express | HTTP server and routing |
| axios | Peer-to-peer RPC calls (RequestVote, AppendEntries, vote forwarding) |
| jsonwebtoken + bcryptjs | Voter authentication (JWT issue/verify, password hashing) |
| socket.io | Real-time push of status, tally, and vote-activity events |
| dotenv-cli | Per-node environment loading (`.env.node1` through `.env.node5`) |

### Frontend (dashboard)

| Dependency | Purpose |
|---|---|
| React 18 + Vite | UI framework and dev server |
| axios | API calls (login, vote, status, tally) |
| socket.io-client | Connects to all 5 nodes simultaneously for live updates |

## Project Structure

```
distributed-voting-system/
├── nodes/raft-node/                # Raft cluster backend (one codebase, run 5×)
│   ├── .env.node1 … .env.node5    # Per-node config: NODE_ID, PORT, PEERS, JWT_SECRET
│   ├── scripts/
│   │   └── loadTest.js             # 30-voter concurrent load test
│   └── src/
│       ├── server.js               # Wires everything together, starts election clock
│       ├── config/peers.js         # Reads node identity and peer list from env
│       ├── state/raftState.js      # Single source of truth: term, role, log, commitIndex
│       ├── election/timers.js      # Election timeout + leader heartbeat intervals
│       ├── rpc/
│       │   ├── requestVote.js      # Election protocol (start/respond to elections)
│       │   ├── appendEntries.js    # Leader replication + follower processing
│       │   └── peerClient.js       # Outbound HTTP to peers (never throws on failure)
│       ├── routes/
│       │   ├── voteRoutes.js       # /vote, /status, /tally (voter-facing)
│       │   ├── authRoutes.js       # /auth/login
│       │   ├── candidateRoutes.js  # /candidates
│       │   └── clusterRoutes.js    # /rpc/request-vote, /rpc/append-entries (internal)
│       ├── auth/
│       │   ├── authService.js      # Password check + JWT issue/verify
│       │   └── authMiddleware.js   # Protects /vote — requires valid JWT
│       ├── data/
│       │   ├── voters.js           # Static voter registry (voter1..voter30)
│       │   └── candidates.js       # Static candidate list (A, B, C)
│       └── realtime/
│           └── socketServer.js     # Socket.io: pushes status, tally, vote-activity events
│
├── dashboard/                      # React + Vite frontend
│   └── src/
│       ├── App.jsx                 # Main component: auth, voting, state management
│       ├── App.css                 # Dark-theme styling, animations
│       ├── api.js                  # Axios helpers for all backend endpoints
│       ├── socket.js               # Connects to all 5 nodes' Socket.io servers
│       ├── main.jsx                # React entry point
│       └── components/
│           ├── NodeStatus.jsx      # Per-node role/term/log card with replication flash
│           ├── LiveTally.jsx       # Bar chart of committed vote counts
│           └── VoteActivityFeed.jsx # Scrolling log of per-vote routing and replication
│
├── docs/
│   ├── architecture.md             # High/low-level design document
│   └── syllabus-mapping.md         # Maps syllabus topics to specific code
│
├── GUIDE.md                        # Step-by-step demo script for evaluation
├── package.json                    # Root: `npm run demo` (concurrently) + `npm run loadtest`
└── README.md                       # ← you are here
```

## Prerequisites

- **Node.js** v18 or later
- **npm** (bundled with Node.js)

No databases, Docker, or external services required — everything runs locally.

## Setup

```bash
# Clone or unzip the project
git clone <repo-url> distributed-voting-system
cd distributed-voting-system

# Install root dependencies (concurrently)
npm install

# Install backend dependencies
cd nodes/raft-node
npm install

# Install frontend dependencies
cd ../../dashboard
npm install

cd ..
```

## Running with Docker (Recommended)

You can run the entire cluster (5 nodes + dashboard) using Docker Compose.

### Commands
- **Start cluster:** `npm run docker:up` (or `docker compose up --build`)
- **Stop cluster:** `npm run docker:down`
- **Wipe persisted data:** `npm run docker:reset`
- **View logs:** `npm run docker:logs`

### Ports
- node1..node5: `5001`..`5005`
- dashboard: `5173` (http://localhost:5173)

### Simulating Failures
Stop a single node to observe leader election and failover:
\`\`\`bash
docker compose stop node3
\`\`\`
Start the node again to see it rejoin and automatically catch up its log:
\`\`\`bash
docker compose start node3
\`\`\`

## Running Locally (Without Docker)

### Option A: One-command demo

From the project root:

```bash
npm run demo
```

This launches all 5 nodes and the dashboard in a single terminal using `concurrently`, each with a color-coded prefix (`node1` through `node5`, `dashboard`). Open **http://localhost:5173** for the dashboard.

> Best for a quick check. For failover testing, use Option B instead — you can't kill individual nodes easily from a single process.

### Option B: Manual multi-terminal setup (recommended for evaluation)

Open **6 terminals**. In terminals 1–5, start each node:

```bash
# Terminal 1
cd nodes/raft-node
npm run start:node1
```

```bash
# Terminal 2
cd nodes/raft-node
npm run start:node2
```

```bash
# Terminal 3
cd nodes/raft-node
npm run start:node3
```

```bash
# Terminal 4
cd nodes/raft-node
npm run start:node4
```

```bash
# Terminal 5
cd nodes/raft-node
npm run start:node5
```

In terminal 6, start the dashboard:

```bash
cd dashboard
npm run dev
```

Open **http://localhost:5173**. Within ~1 second of starting the nodes, one will win an election and become leader — visible as the teal card in the Node Status panel.

### Port assignments

| Process | Port |
|---|---|
| node1 | 5001 |
| node2 | 5002 |
| node3 | 5003 |
| node4 | 5004 |
| node5 | 5005 |
| dashboard | 5173 |

## Verifying It Works

A quick curl-based smoke test after the cluster is running:

```bash
# 1. Check cluster status — exactly one node should show "role":"leader"
curl http://localhost:5001/status

# 2. Log in as voter1
curl -X POST http://localhost:5001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"voterId":"voter1","password":"pass1234"}'
# → {"token":"eyJ..."}

# 3. Cast a vote (replace <token> with the JWT from step 2)
curl -X POST http://localhost:5002/vote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"candidateChoice":"A"}'
# → {"status":"committed","handledBy":"node1"}

# 4. Check the tally on any node
curl http://localhost:5003/tally
# → {"A":1}
```

Note: step 3 deliberately hits a *different* node (5002) than the one used to log in (5001) — the vote is forwarded to the leader transparently.

## Running the Load Test

```bash
cd nodes/raft-node
npm run loadtest
```

This script:
1. Logs in 30 voters (`voter1`–`voter30`), each hitting a **randomly chosen node**
2. Fires all 30 vote requests concurrently, each through a **separately, randomly chosen node**
3. Queries all 5 nodes' `/tally` endpoints and verifies they report identical results

A passing run confirms that concurrent votes submitted to different nodes are replicated, committed, and counted consistently — the core claim of the system.

> **Note:** The load test uses the same voter accounts as the dashboard. If you've already voted as some accounts via the UI, run a fresh cluster first (stop all nodes, restart).

## Demo / Evaluation Script

A detailed, step-by-step walkthrough — covering leader election, single votes, concurrency, double-vote rejection, failover, and minority partition safety — is in **[GUIDE.md](GUIDE.md)**.

Follow it top to bottom during your evaluation. Each step maps to specific syllabus topics documented in [docs/syllabus-mapping.md](docs/syllabus-mapping.md).

## Known Limitations

These are deliberate scope decisions, not bugs — each is documented in the architecture doc with reasoning:

| Limitation | Reasoning |
|---|---|
| **No log compaction/snapshots** | The log grows indefinitely; fine for a demo, but a real Raft implementation would compact the log periodically. |
| **Static cluster membership** | Nodes are fixed at startup; no dynamic adding or removing of nodes during runtime. |
| **In-memory voter registry** | Voters are loaded from a static list; no persistent registration process. |
| **RA assumes crash faults, not partitions** | The Ricart-Agrawala implementation treats timeouts as crash faults. It is unsafe under network partitions. |
| **Crash-fault tolerance only (no Byzantine faults)** | Raft protects against crash failures, not malicious nodes (Byzantine faults). |
| **No real SMS/OTP integration** — JWT + password authentication only | A real SMS gateway adds cost and external dependency risk with no course benefit. |

## Project Documentation

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | High-level and low-level design: cluster topology, per-node state model, file responsibilities, concurrency handling |
| [docs/syllabus-mapping.md](docs/syllabus-mapping.md) | Maps each Unit 1 & 2 syllabus topic to the specific code and demo steps that demonstrate it |
| [GUIDE.md](GUIDE.md) | Step-by-step demo script for evaluation: startup, voting, load test, failover, partition safety |

---

*Academic project for a Distributed Systems course (FA-1/FA-2).*
