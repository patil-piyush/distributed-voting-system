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

## 9. Restarting after the partition demo (known limitation)

Don't try to bring back just 1-2 nodes and continue testing — a
restarted node comes back with an **empty log**, and there's no
catch-up mechanism yet (documented in `docs/architecture.md` as a
deliberate FA-1 scope decision). For a clean state:

1. Stop every remaining node (Ctrl+C in each terminal).
2. Restart all 5 together (step 1 again).

If asked about this in evaluation, the honest answer is: *"Full Raft
handles this with log consistency checks and a catch-up mechanism —
we scoped that out for FA-1 and documented it explicitly; it's a
natural FA-2 extension."*

---

## 10. Shutting everything down

- Ctrl+C in each of the 5 node terminals.
- Ctrl+C in the dashboard terminal.
- Nothing persists to disk — next run starts completely fresh.

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

If you only have time for a short demo, steps **1, 3, 6, and 7** are
the four that matter most.
