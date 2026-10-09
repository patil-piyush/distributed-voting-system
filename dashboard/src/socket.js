import { io } from 'socket.io-client';
import { NODES } from './api';

// Connects to ALL 5 nodes at once — this is what lets the dashboard
// show live node health independently of who's currently leader, and
// pick up tally updates from whichever node reports first.
export function connectAllSockets({ onStatus, onTally, onDisconnect, onVoteActivity }) {
  const sockets = NODES.map((node) => {
    const socket = io(node.url, {
      transports: ['websocket'],
      reconnectionDelay: 500,
    });
    socket.on('status', (data) => onStatus(node.id, data));
    socket.on('tally', (data) => onTally(data));
    socket.on('vote-activity', (data) => onVoteActivity?.(data));
    socket.on('disconnect', () => onDisconnect(node.id));
    return socket;
  });

  return () => sockets.forEach((s) => s.disconnect());
}
