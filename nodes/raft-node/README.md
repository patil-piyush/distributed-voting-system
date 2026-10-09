# raft-node

One codebase, run 5 times as 5 separate node instances (node1..node5),
each on its own port, forming a Raft consensus cluster.

See the root `README.md` for the full project overview and demo
script — this file covers just this backend package.

## Setup

```bash
npm install
```

## Running the cluster

Open 5 separate terminals, one command each:

```bash
npm run start:node1
npm run start:node2
npm run start:node3
npm run start:node4
npm run start:node5
```

## Verifying it works

Check status on any node:
```bash
curl http://localhost:5001/status
```
One node should show `"role":"leader"`, the other four `"role":"follower"`,
all agreeing on the same `currentTerm`.

Log in as a demo voter (30 seeded voters, `voter1`..`voter30`, all
password `pass1234`):
```bash
curl -X POST http://localhost:5001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"voterId":"voter1","password":"pass1234"}'
```
Copy the `token` from the response.

Cast a vote (hits any node — forwards to the leader if needed):
```bash
curl -X POST http://localhost:5003/vote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <paste token here>" \
  -d '{"candidateChoice":"A"}'
```

Trying to vote again with the same token should now be rejected:
```bash
# same command again -> {"error":"this voter has already voted"}
```

Check the tally agrees across every node:
```bash
curl http://localhost:5001/tally
curl http://localhost:5002/tally
curl http://localhost:5003/tally
curl http://localhost:5004/tally
curl http://localhost:5005/tally
```

## Load test (proves concurrent correctness)

With all 5 nodes running:
```bash
npm run loadtest
```
Simulates 30 voters hitting random nodes simultaneously, then
verifies all 5 nodes agree on the final tally.

## Testing failover

1. Note the current leader (`/status` on any node).
2. Ctrl+C that node's terminal.
3. Watch the other terminals — a new leader should be elected within
   roughly one election-timeout window.
4. `/status` on the remaining 4 should agree on the new leader and an
   incremented term.

## Known simplification: restarting a single node

If you kill and restart one node mid-test, it comes back with an
empty in-memory log — there's no catch-up mechanism for entries it
missed. Restart all 5 together for a clean test run. This is a
deliberate, documented scope decision for FA-1 (see root README).
