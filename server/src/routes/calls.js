const router = require('express').Router();
const mongoose = require('mongoose');
const Call = require('../models/Call');
const config = require('../config');
const { callHistory } = require('../services/calls');
const { buildRtcToken } = require('../services/agoraToken');

// GET /api/calls?limit=50 -> recent calls (both directions), newest first
router.get('/', async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  res.json({ calls: await callHistory(req.user._id, limit) });
});

async function loadMyCall(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Call not found' });
    return null;
  }
  const call = await Call.findById(req.params.id)
    .populate('caller', '_id name avatar phone')
    .populate('callee', '_id name avatar phone');
  const me = String(req.user._id);
  if (!call || !call.caller || !call.callee || (String(call.caller._id) !== me && String(call.callee._id) !== me)) {
    res.status(404).json({ message: 'Call not found' });
    return null;
  }
  return call;
}

// GET /api/calls/:id/token -> what the app needs to join the Agora channel for this call
router.get('/:id/token', async (req, res) => {
  const call = await loadMyCall(req, res);
  if (!call) return;
  if (!['ringing', 'active'].includes(call.status)) return res.status(410).json({ message: 'This call has ended' });

  const channel = String(call._id);
  const { appId, appCertificate } = config.agora;
  // No certificate = Agora project in "Testing mode" (App ID only): join with a null token
  const token = appId && appCertificate ? buildRtcToken(appId, appCertificate, channel, 0, 3600) : null;
  res.json({ appId: appId || null, channel, uid: 0, token });
});

// GET /api/calls/:id -> single call (used when opening from a push notification)
router.get('/:id', async (req, res) => {
  const call = await loadMyCall(req, res);
  if (!call) return;
  res.json({
    call: {
      _id: call._id,
      caller: call.caller,
      callee: call.callee,
      callType: call.callType,
      status: call.status,
      createdAt: call.createdAt,
    },
  });
});

module.exports = router;
