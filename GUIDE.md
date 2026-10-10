# Demo & Operations Guide

A step-by-step script for running the system and showing every edge
case to your evaluator. Follow it top to bottom — each section builds
on the one before it. Keep this file open on a second screen during
your demo.

---

## 0. Before you start

- Unzip the project, run `npm install` in the root, `nodes/raft-node`,
  and `dashboard` (see root README if you haven't already).
- Open **6 terminals**: 5 for the nodes, 1 for the dashboard. A 7th is
  handy for running curl/load-test commands without disturbing the
  others.
- Have this guide and the dashboard (http://localhost:5173, once
  started) both visible.

Using 5 separate terminals (not the single `npm run demo` command) is
deliberate — you need to Ctrl+C **one specific node** for the failover
demo later, which is only easy to do this way.

---

## 1. Start the cluster

In terminals 1-5:
```bash
cd nodes/raft-node
npm run start:node1     # terminal 1
npm run start:node2     # terminal 2
npm run start:node3     # terminal 3
npm run start:node4     # terminal 4
npm run start:node5     # terminal 5
```
Start all 5 within a couple of seconds of each other.

**What to point out:** each node logs `started as follower`, then
within ~300-600ms one of them logs `won election for term 1 —
becoming leader`. Say out loud: *"No one assigned this — it emerged
from a randomized-timeout race. Every node could have won; whichever
one's timer fired first did."*

**Sanity check:**
```bash
curl http://localhost:5001/status
```
Confirm exactly one node cluster-wide shows `"role":"leader"`, and all
5 agree on the same `currentTerm`.

---

## 2. Start the dashboard

Terminal 6:
```bash
cd dashboard
npm run dev
```
Open **http://localhost:5173**. The Node Status panel should show one
teal (leader) card and four gray (follower) cards, matching what you
just saw in the terminals.

---

## 3. Demo: a single vote, end to end

1. In the dashboard, log in as `voter1` / `pass1234`.
2. Cast a vote for any candidate.
3. Point out: the Live Tally panel updates immediately, and the
   confirmation message names which node actually handled the write.

**Say:** *"The dashboard picked a random node for this vote — if it
wasn't the leader, that node forwarded it internally. The voter never
needed to know or care which of the 5 nodes they hit."*

---

## 4. Demo: double-vote rejection

Try to vote again as `voter1` (log out first if you've added a logout
button, or just note it in terminal instead):
```bash
curl -X POST http://localhost:5001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"voterId":"voter1","password":"pass1234"}'
# copy the token from the response, then:
curl -X POST http://localhost:5002/vote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"candidateChoice":"B"}'
```
Expect: `{"error":"this voter has already voted"}` — note it's a
different node (`5002`) than the one they voted through the first
time, proving the check works cluster-wide, not just locally.

---

## 5. Demo: invalid login / invalid candidate

```bash
# wrong password
curl -X POST http://localhost:5001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"voterId":"voter1","password":"wrongpassword"}'
# -> {"error":"incorrect password"}

# unregistered voter
curl -X POST http://localhost:5001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"voterId":"not-a-real-voter","password":"pass1234"}'
# -> {"error":"voter not recognized"}

# valid login, but voting for a candidate that doesn't exist
curl -X POST http://localhost:5001/vote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <a fresh, unused token>" \
  -d '{"candidateChoice":"Z"}'
# -> {"error":"candidateChoice must be a valid candidate id"}
```

---

## 6. Demo: concurrency (your strongest evidence)

Terminal 7:
```bash
cd nodes/raft-node
npm run loadtest
```
This fires 30 simulated voters at once, each hitting a **randomly
chosen node** to log in and a **separately, randomly chosen node** to
vote through.

**Say:** *"This is the actual proof of the problem statement — votes
submitted concurrently, on different nodes, still converge to exactly
one correct, consistent result."* Point at the final line: all 5
nodes' tallies printed and confirmed identical.

---

## 7. Demo: leader failover (fault tolerance)

1. Check the dashboard's Node Status panel (or `curl .../status` on
   any node) to see who's currently leader — say it's `node3`.
2. Go to terminal 3 and press **Ctrl+C**.
3. Watch the dashboard: within roughly a second, a *different* node
   turns teal (new leader elected).
4. Prove it still works: cast one more vote through the dashboard —
   it should commit successfully with only 4 nodes alive.

**Say:** *"We just lost 20% of the cluster and it kept working
correctly, without anyone reconfiguring anything — this is the core
fault-tolerance guarantee Raft provides."*

---

## 8. Demo: minority partition (safety under failure)

Continuing from step 7 (4 nodes alive), kill **2 more**:
```bash
# in two more terminals, Ctrl+C two more nodes, leaving only 2 alive
```
Now try to vote:
```bash
curl -X POST http://localhost:500X/vote \
  -H "Authorization: Bearer <token>" \
  -d '{"candidateChoice":"A"}'
```
(use the port of one of your 2 surviving nodes)

Expect: it never succeeds — either `"no known leader right now"` or a
connection issue, because 2 nodes can never reach a majority of 5
(need 3). No leader should stably emerge between just the 2 survivors.

**Say:** *"This is the safety property, not a bug — the system
refuses to commit anything without majority agreement, even though 2
nodes are alive and reachable. Committing here would risk an
inconsistent result if the other 3 come back."*

---

## 9. Demo: Cluster Audit

With the cluster running and votes cast, click the **"Run cluster audit"** button in the dashboard's audit panel.
- This queries all 5 nodes simultaneously to retrieve their committed logs.
- It compares the logs up to the highest contiguous commit index.
- It proves mathematically that despite distributed execution, the replicated state machine model works: every node has the exact same sequence of committed votes in the exact same order.

---

## 10. Demo: Causal Clocks & Concurrency

1. Run the concurrent load test (`npm run loadtest`).
2. Open the dashboard and look at the **Vote Activity Feed**. You will see `L:<lamport_ts>` and a compact vector clock `{n1:x, n2:y, ...}` for each vote.
3. Click two different feed items to select them.
4. The **Causality Analysis** panel will appear. It compares the two vector clocks and determines if one happened BEFORE the other, AFTER, or if they were CONCURRENT.
5. Notice that votes fired from the concurrent load test will frequently be evaluated as **CONCURRENT**, demonstrating true distributed concurrency.

---

## 11. Demo: Ricart-Agrawala Mutual Exclusion

1. Scroll down to the **Ricart-Agrawala Mutual Exclusion** panel in the dashboard.
2. Click the **"Publish results from ALL 5 nodes at once"** button.
3. The dashboard issues 5 simultaneous POST requests to all 5 nodes.
4. Watch the timeline: all nodes broadcast a `REQUEST`, but they gracefully queue up using Lamport timestamps as the tie-breaker.
5. The panel will display "Mutual exclusion held" and show the `ENTER` and `EXIT` events for each node happening completely sequentially, with zero overlap.
6. Verify the shared file locally: `curl -s http://localhost:5001/admin/mutex-log` will show a strictly alternating BEGIN/END sequence with no interleaved lines.

---

## 12. Demo: Follower catch-up & Persistence

1. Stop node3 (using `docker compose stop node3` or Ctrl+C).
2. Cast a vote using the dashboard or curl. The cluster continues to work (4 nodes).
3. Restart node3 (`docker compose start node3`).
4. Watch node3's log file or status panel. It immediately receives an `AppendEntries` payload from the leader with the missing vote, updates its `nextIndex`, and replicates the missing entry automatically.
5. **Persistence**: Stop the ENTIRE cluster (`docker compose stop` or Ctrl-C everything). Restart it. The node statuses will instantly load their log lengths and the `Cluster Audit` will still pass, proving all votes survived the complete cluster crash.

---

## 13. Shutting everything down

- Stop the docker containers (`npm run docker:down`) or Ctrl+C in all manual terminals.
- To wipe the persistent state and start fresh: `npm run docker:reset`.

---

## Quick reference: what each demo step proves

| Step | Proves |
|---|---|
| 1 — startup | Leader election (randomized timeout, no central coordinator) |
| 3 — single vote | RPC, forwarding, replication, commit-on-majority |
| 4 — double vote | Log-based integrity check, cluster-wide |
| 5 — invalid input | Auth boundary, input validation |
| 6 — load test | Concurrency handled correctly across nodes (core problem statement claim) |
| 7 — failover | Fault tolerance, re-election |
| 8 — partition | Safety property — no commit without majority |
| 9 — cluster audit | Global State consistency |
| 10 — causal clocks | Logical/Vector clocks and concurrent event detection |
| 11 — mutual exclusion | Distributed locks via Ricart-Agrawala |
| 12 — persistence | Replicated State Machine durability and catch-up |

If you only have time for a short demo, steps **1, 6, 7, 10, and 11** are
the ones that matter most for FA-2.
