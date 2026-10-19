const { startCall, acceptCall, declineCall, cancelCall, endCall } = require('./services/calls');

/** Real-time call signaling. All handlers run for the authenticated socket user. */
function registerCallHandlers(socket) {
  const userId = () => socket.data.userId;

  const fail = (err) => ({ ok: false, message: (err && err.message) || 'Call failed' });

  // { calleeId, callType } -> ack { ok, call } | { ok:false, message }
  socket.on('call:invite', async ({ calleeId, callType } = {}, ack) => {
    try {
      // req.user is not set on sockets; fetch the caller fresh for block lists
      const User = require('./models/User');
      const caller = await User.findById(userId()).select('blocked name phone');
      if (!caller) return ack && ack(fail(new Error('Not authenticated')));
      const call = await startCall(caller, calleeId, callType);
      if (ack) ack({ ok: true, call });
    } catch (err) {
      if (ack) ack(fail(err));
    }
  });

  socket.on('call:accept', async ({ callId } = {}) => {
    try {
      await acceptCall(userId(), callId);
    } catch (err) {
      socket.emit('call:error', { message: err.message || 'Could not accept the call' });
    }
  });

  socket.on('call:decline', async ({ callId } = {}) => {
    try {
      await declineCall(userId(), callId);
    } catch {
      // callee hung up on a dead call; nothing to do
    }
  });

  socket.on('call:cancel', async ({ callId } = {}) => {
    try {
      await cancelCall(userId(), callId);
    } catch {
      // nothing to do
    }
  });

  socket.on('call:end', async ({ callId } = {}) => {
    try {
      await endCall(userId(), callId);
    } catch {
      // nothing to do
    }
  });
}

module.exports = { registerCallHandlers };
