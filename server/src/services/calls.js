const mongoose = require('mongoose');
const Call = require('../models/Call');
const User = require('../models/User');
const { emitToUser, isOnline } = require('../realtime');

const RING_TIMEOUT_MS = 45 * 1000;

// userId -> callId for calls that are still ringing or active (busy detection)
const liveCalls = new Map();
// callId -> timeout handle for the unanswered-call timer
const ringTimers = new Map();

const USER_FIELDS = '_id name avatar phone isBot';

function serializeCall(call) {
  const c = call.toObject ? call.toObject() : call;
  const person = (u) => (u && u._id ? { _id: u._id, name: u.name, avatar: u.avatar, phone: u.phone } : { _id: u });
  return {
    _id: c._id,
    caller: person(c.caller),
    callee: person(c.callee),
    callType: c.callType,
    status: c.status,
    durationSec: c.durationSec || 0,
    createdAt: c.createdAt,
    acceptedAt: c.acceptedAt,
    endedAt: c.endedAt,
  };
}

function clearRingTimer(callId) {
  const t = ringTimers.get(String(callId));
  if (t) {
    clearTimeout(t);
    ringTimers.delete(String(callId));
  }
}

function untrack(call) {
  clearRingTimer(call._id);
  liveCalls.delete(String(call.caller._id || call.caller));
  liveCalls.delete(String(call.callee._id || call.callee));
}

async function loadCall(callId, userId) {
  if (!mongoose.isValidObjectId(callId)) return null;
  const call = await Call.findById(callId).populate('caller', USER_FIELDS).populate('callee', USER_FIELDS);
  if (!call) return null;
  const me = String(userId);
  if (String(call.caller._id) !== me && String(call.callee._id) !== me) return null;
  return call;
}

/** Caller starts a call. Returns the call; throws { status, message } on failure. */
async function startCall(caller, calleeId, callType = 'audio') {
  if (!mongoose.isValidObjectId(calleeId)) throw { status: 400, message: 'Invalid contact' };
  if (String(calleeId) === String(caller._id)) throw { status: 400, message: 'You cannot call yourself' };
  const type = callType === 'video' ? 'video' : 'audio';

  const callee = await User.findById(calleeId).select(`${USER_FIELDS} isDeleted blocked`);
  if (!callee || callee.isDeleted || callee.isBot) throw { status: 404, message: 'Contact not available' };
  if ((caller.blocked || []).some((id) => String(id) === String(callee._id))) {
    throw { status: 403, message: 'Unblock this contact to call them' };
  }
  if ((callee.blocked || []).some((id) => String(id) === String(caller._id))) {
    throw { status: 403, message: 'You cannot call this contact' };
  }
  if (liveCalls.has(String(callee._id)) || liveCalls.has(String(caller._id))) {
    throw { status: 409, message: 'Already in a call' };
  }

  // Don't ring offline contacts: the caller gets immediate feedback instead
  // of ringing into the void for 45 seconds.
  if (!isOnline(callee._id)) {
    throw { status: 404, message: 'This contact is offline' };
  }

  const call = await Call.create({ caller: caller._id, callee: callee._id, callType: type });
  await call.populate('caller', USER_FIELDS);
  await call.populate('callee', USER_FIELDS);

  liveCalls.set(String(caller._id), String(call._id));
  liveCalls.set(String(callee._id), String(call._id));

  const payload = serializeCall(call);
  emitToUser(callee._id, 'call:incoming', payload);

  ringTimers.set(
    String(call._id),
    setTimeout(async () => {
      try {
        const c = await Call.findById(call._id);
        if (!c || c.status !== 'ringing') return;
        c.status = 'missed';
        c.endedAt = new Date();
        await c.save();
        untrack(c);
        emitToUser(c.caller, 'call:timeout', { callId: String(c._id) });
        emitToUser(c.callee, 'call:missed', { callId: String(c._id) });
      } catch (e) {
        console.error('call timeout', e.message);
      }
    }, RING_TIMEOUT_MS)
  );

  return payload;
}

/** Callee accepts. Emits call:accepted to the caller. */
async function acceptCall(userId, callId) {
  const call = await loadCall(callId, userId);
  if (!call || call.status !== 'ringing') throw { status: 404, message: 'Call is no longer available' };
  if (String(call.callee._id) !== String(userId)) throw { status: 403, message: 'Not your call to accept' };
  call.status = 'active';
  call.acceptedAt = new Date();
  await call.save();
  clearRingTimer(call._id);
  emitToUser(call.caller._id, 'call:accepted', serializeCall(call));
  return serializeCall(call);
}

/** Callee declines a ringing call. */
async function declineCall(userId, callId) {
  const call = await loadCall(callId, userId);
  if (!call || call.status !== 'ringing') throw { status: 404, message: 'Call is no longer available' };
  if (String(call.callee._id) !== String(userId)) throw { status: 403, message: 'Not your call' };
  call.status = 'declined';
  call.endedAt = new Date();
  await call.save();
  untrack(call);
  emitToUser(call.caller._id, 'call:declined', { callId: String(call._id) });
  return true;
}

/** Caller cancels while it is still ringing. */
async function cancelCall(userId, callId) {
  const call = await loadCall(callId, userId);
  if (!call || call.status !== 'ringing') throw { status: 404, message: 'Call is no longer available' };
  if (String(call.caller._id) !== String(userId)) throw { status: 403, message: 'Not your call' };
  call.status = 'cancelled';
  call.endedAt = new Date();
  await call.save();
  untrack(call);
  emitToUser(call.callee._id, 'call:cancelled', { callId: String(call._id) });
  return true;
}

/** Either side ends an active call. */
async function endCall(userId, callId) {
  const call = await loadCall(callId, userId);
  if (!call) throw { status: 404, message: 'Call not found' };
  const me = String(userId);
  // Caller hanging up while ringing = cancel
  if (call.status === 'ringing' && String(call.caller._id) === me) return cancelCall(userId, callId);
  if (call.status !== 'active') throw { status: 404, message: 'Call already ended' };
  call.status = 'ended';
  call.endedAt = new Date();
  const base = call.acceptedAt || call.createdAt;
  call.durationSec = Math.max(0, Math.round((call.endedAt - base) / 1000));
  await call.save();
  untrack(call);
  const other = String(call.caller._id) === me ? call.callee._id : call.caller._id;
  emitToUser(other, 'call:ended', serializeCall(call));
  return serializeCall(call);
}

/** Recent calls for the history tab. */
async function callHistory(userId, limit = 50) {
  const calls = await Call.find({ $or: [{ caller: userId }, { callee: userId }] })
    .populate('caller', USER_FIELDS)
    .populate('callee', USER_FIELDS)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();
  const me = String(userId);
  return calls.map((c) => {
    const iAmCaller = String(c.caller._id) === me;
    const peer = iAmCaller ? c.callee : c.caller;
    return {
      _id: c._id,
      peer: peer && peer._id ? { _id: peer._id, name: peer.name, avatar: peer.avatar, phone: peer.phone } : null,
      direction: iAmCaller ? 'outgoing' : 'incoming',
      callType: c.callType,
      status: c.status,
      durationSec: c.durationSec || 0,
      createdAt: c.createdAt,
    };
  });
}

module.exports = { startCall, acceptCall, declineCall, cancelCall, endCall, callHistory, serializeCall };
