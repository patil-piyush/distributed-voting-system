// clusterRoutes.js
//
// These routes are only ever called by OTHER NODES, never by
// voters or the dashboard directly. Kept deliberately dumb — all
// the actual logic lives in rpc/requestVote.js and rpc/appendEntries.js.

const express = require('express');
const requestVote = require('../rpc/requestVote');
const appendEntries = require('../rpc/appendEntries');

const router = express.Router();

router.post('/request-vote', (req, res) => {
  const result = requestVote.handleRequestVote(req.body);
  res.json(result);
});

router.post('/append-entries', (req, res) => {
  const result = appendEntries.handleAppendEntries(req.body);
  res.json(result);
});

const ricartAgrawala = require('../mutex/ricartAgrawala');

router.post('/ra-request', (req, res) => {
  ricartAgrawala.handleReceiveRequest(req.body.from, req.body.ts);
  res.json({ ok: true });
});

router.post('/ra-reply', (req, res) => {
  ricartAgrawala.handleReceiveReply(req.body.from);
  res.json({ ok: true });
});

module.exports = router;
