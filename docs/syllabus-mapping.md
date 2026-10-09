# Syllabus Concept Mapping (FA-1: Unit 1 & 2)

## Unit 1 — Introduction to Distributed Systems

| Topic | Where it's demonstrated |
|---|---|
| Definition & goals of DS | Fault tolerance (cluster survives up to 2 node failures), transparency (a voter never needs to know which of 5 nodes they're talking to), scalability (cluster size isn't hardcoded — `PEERS.length` drives every quorum calculation) |
| Types of distributed systems | This is a **replicated state machine** — every node maintains an identical copy of the same committed log |
| Architectures | Hybrid: **peer-to-peer** among the 5 raft nodes (no fixed master; leadership is elected and can move) + **client-server** between voters and the cluster |
| Design issues | Concurrency (multiple voters hitting different nodes simultaneously — see `docs/architecture.md`, "Concurrency handling"), heterogeneity (nodes are independent processes, could run on different machines), fault handling (election on leader death) |
| Middleware | The Raft RPC layer (`rpc/peerClient.js`, `rpc/requestVote.js`, `rpc/appendEntries.js`) hides node-to-node complexity from the application logic above it |
| Overview / Distributed multimedia systems | Out of scope for this project — noted explicitly as a scoping decision, not an oversight |

## Unit 2 — Communication

| Topic | Where it's demonstrated |
|---|---|
| Fundamentals of communication | Every node-to-node call is a request/response pair over HTTP with an explicit timeout (`peerClient.js`, 50ms) and graceful failure handling — nothing assumes a peer is reachable |
| Remote Procedure Call (RPC) | `RequestVote` and `AppendEntries` — a node calls a "remote procedure" on a peer and receives a structured response, exactly the RPC pattern |
| Message-oriented communication | Heartbeats and log-replication messages are fanned out to all peers without blocking on any single one (`Promise.allSettled` in `sendAppendEntriesToAll`) |
| Stream-oriented communication | Live tally, node-status, and vote-activity updates are pushed continuously to the dashboard over Socket.io (`realtime/socketServer.js`, `dashboard/src/socket.js`) rather than polled — the Vote Activity Feed shows per-vote routing and replication in real time |
| Peer-to-peer (P2P) messaging | The 5-node cluster is genuinely P2P — identical code on every node, no fixed coordinator, leadership emerges and can shift |
| WebRTC | Considered and deliberately descoped — not needed to demonstrate the core consensus/communication concepts; noted as a possible FA-2 extension (e.g. a live video feed of a polling location) |

## How to demonstrate each row live

See "Demo script for your evaluation" in the root `README.md` — it
walks through leader election, a single vote, the concurrent
load-test, double-vote rejection, and failover, in an order that
naturally hits every row above.
