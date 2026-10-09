// socketServer.js
//
// Each node runs its own Socket.io server attached to its own HTTP
// server. The dashboard connects to all 5 independently (see
// dashboard/src/socket.js) so it can show live node health even
// while leadership is changing.

const { Server } = require('socket.io');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });
  return io;
}

// Safe to call even before initSocket() has run (e.g. during early
// startup) — it just silently does nothing until the server exists.
function emitUpdate(event, payload) {
  if (io) io.emit(event, payload);
}

module.exports = { initSocket, emitUpdate };
