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

## Unit III — Synchronization and Election

| Topic | Where it's demonstrated |
|---|---|
| Physical clock synchronization | **Not implemented**. Raft deliberately avoids wall-clock comparisons across nodes. It relies purely on logical terms and local, randomized timeouts. |
| Logical clocks | **Implemented** via Lamport logical timestamps (`src/clock/clocks.js`), attached to every vote event. |
| Vector clocks | **Implemented**. A vector clock array tracking every node's progress is included in vote events, allowing the dashboard's causality panel to determine if events were concurrent, before, or after. |
| Global state | **Implemented** via Cluster Audit (`GET /audit`). A state collection plus consistency check of the committed log (not marker-based Chandy-Lamport). |
| Election algorithms | **Implemented**. Uses Raft's randomized-timeout election with log up-to-date restrictions. *Compared to Bully/Ring*: Bully/Ring only pick a coordinator, without majority quorums or replicated log protections. |
| Mutual exclusion | **Implemented** via Ricart-Agrawala (`src/mutex/ricartAgrawala.js`) protecting a shared filesystem resource across all 5 nodes. |
| Beacon protocol | **Implemented**. The Raft leader sends periodic empty `AppendEntries` RPCs as liveness beacons (heartbeats). |

## Unit IV — Advanced Distributed Systems Concepts

| Topic | Where it's demonstrated |
|---|---|
| Distributed web-based system | **Implemented**. This entire project is a distributed REST + WebSocket web application. |
| Docker & Container Orchestration | **Implemented**. The 5 nodes and dashboard run via Docker Compose. *Mapping*: Compose `services` ≈ K8s Deployments/StatefulSets; Docker networking ≈ K8s Services; Docker volumes ≈ K8s PersistentVolumeClaims. Kubernetes itself stores cluster state in etcd, which uses Raft—the exact algorithm running in this project. |
| Serverless | **Discussion only**. Stateless short-lived functions do not fit a stateful consensus protocol like Raft which requires continuous peer communication and persistent logs. |
| Blockchain / DLT | **Discussion only**. Our replicated log is a permissioned, crash-fault-tolerant distributed ledger, but uses no cryptographic hash chaining or proof-of-work/stake. |
| Distributed file systems, Hadoop, Cloudflare, AWS, Megaport | **[TO BE WRITTEN BY AUTHOR]** |

## How to demonstrate each row live

See "Demo script for your evaluation" in **[GUIDE.md](../GUIDE.md)** — it
walks through leader election, single votes, the concurrent load-test,
failovers, cluster audits, causal clocks, and mutual exclusion, naturally
hitting the topics above.
