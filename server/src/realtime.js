/** Shared access to the Socket.IO server from REST routes. */
let io = null;

function setIO(instance) {
  io = instance;
}

function room(userId) {
  return `user:${String(userId)}`;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(room(userId)).emit(event, payload);
}

function isOnline(userId) {
  if (!io) return false;
  const r = io.sockets.adapter.rooms.get(room(userId));
  return Boolean(r && r.size > 0);
}

function disconnectUser(userId) {
  if (io) io.in(room(userId)).disconnectSockets(true);
}

module.exports = { setIO, room, emitToUser, isOnline, disconnectUser };
