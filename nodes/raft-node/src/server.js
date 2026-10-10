// server.js
//
// Entry point. This exact same file runs as all 5 nodes — the only
// difference between them is which .env.nodeN file was loaded
// (see package.json scripts), which sets NODE_ID/PORT/PEERS/JWT_SECRET.

const http = require('http');
const express = require('express');
const { NODE_ID, PORT } = require('./config/peers');
const raftState = require('./state/raftState');
const timers = require('./election/timers');
const requestVote = require('./rpc/requestVote');
const clusterRoutes = require('./routes/clusterRoutes');
const voteRoutes = require('./routes/voteRoutes');
const authRoutes = require('./routes/authRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const auditRoutes = require('./routes/auditRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { initSocket } = require('./realtime/socketServer');

const app = express();
app.use(express.json());

// handle cors
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// Routes are split into two categories:
// - Internal (node-to-node) routes under /rpc
// - Public (voter-facing) routes under /auth and /



// Internal, node-to-node only:
app.use('/rpc', clusterRoutes);
// Public / voter-facing:
app.use('/auth', authRoutes);
app.use('/', candidateRoutes);
app.use('/', voteRoutes);
// Diagnostic — no auth:
app.use('/audit', auditRoutes);
app.use('/admin', adminRoutes);

// Socket.io needs a raw http server, not just the Express app, since
// it upgrades the connection to a websocket.
const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[${NODE_ID}] started as ${raftState.getState().role} on port ${PORT}`);
  timers.resetElectionTimer(requestVote.startElection);
});
