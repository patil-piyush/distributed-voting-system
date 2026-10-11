#!/bin/bash
set -e
sleep 2
LEADER=$(curl -s http://localhost:5001/status | jq -r .currentLeaderId)
if [ -z "$LEADER" ] || [ "$LEADER" == "null" ]; then
  LEADER=$(curl -s http://localhost:5002/status | jq -r .currentLeaderId)
fi
echo "Leader is $LEADER"
cd nodes/raft-node
npm run loadtest &
PID=$!
sleep 0.5
echo "Killing $LEADER..."
cd ../..
docker compose stop $LEADER
wait $PID || true
echo "Load test finished. Checking commitIndex vs logLength..."
for i in {1..5}; do
  if [ "node$i" != "$LEADER" ]; then
    STATUS=$(curl -s http://localhost:500$i/status)
    CL=$(echo $STATUS | jq -r .commitIndex)
    LL=$(echo $STATUS | jq -r .logLength)
    echo "node$i: commitIndex=$CL logLength=$LL"
    if [ "$CL" != "$((LL - 1))" ]; then
      echo "FAIL on node$i"
    fi
  fi
done
