#!/usr/bin/env bash
# Helper for manual cluster tests. Usage (from the repo root):
#   source scripts/cluster.sh
#   st                      # role / term / log / commit of every node
#   tally                   # committed tally as seen by every node
#   vote voter1 3 A         # voter1 votes for A through node3 (port 5003)
#   wipe node5              # delete node5's persisted state (node must be stopped)

PORTS="5001 5002 5003 5004 5005"

st() {
  for p in $PORTS; do
    printf "%s  " "$p"
    out=$(curl -s -m 1 "http://localhost:$p/status")
    if [ -z "$out" ]; then echo "DOWN"; else echo "$out"; fi
  done
}

tally() {
  for p in $PORTS; do
    printf "%s  " "$p"
    out=$(curl -s -m 1 "http://localhost:$p/tally")
    if [ -z "$out" ]; then echo "DOWN"; else echo "$out"; fi
  done
}

# Logs in through the first node that answers, then votes through node <n>.
vote() {
  voter="$1"; n="$2"; choice="$3"
  token=""
  for p in $PORTS; do
    token=$(curl -s -m 2 -X POST "http://localhost:$p/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"voterId\":\"$voter\",\"password\":\"pass1234\"}" \
      | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
    [ -n "$token" ] && break
  done
  if [ -z "$token" ]; then echo "login failed on every node"; return 1; fi
  curl -s -m 5 -w "  [HTTP %{http_code}]\n" -X POST "http://localhost:500$n/vote" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    -d "{\"candidateChoice\":\"$choice\"}"
}

# Run from the repo root. Node must be stopped first.
wipe() {
  rm -f "nodes/raft-node/data/$1.json" && echo "removed data for $1"
}