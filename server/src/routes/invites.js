const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Channel = require('../models/Channel');
const Community = require('../models/Community');
const User = require('../models/User');
const { createGroupMessage } = require('../services/messages');
const { emitToUser } = require('../realtime');
const communities = require('./communities');

/**
 * Invite links for groups, channels and communities.
 *   code      : G... (group)  C... (channel)  M... (community)
 *   share link: <server>/join/<code>  -> small web page with an "Open in Chatly" button (chatly://join/<code>)
 * Anyone with the link can preview it and join. Admins can reset a link, which kills the old one.
 */
const MAX_GROUP_MEMBERS = 256;
const MAX_PENDING_REQUESTS = 200;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PREFIX = { group: 'G', channel: 'C', community: 'M' };
const TYPE_BY_PREFIX = { G: 'group', C: 'channel', M: 'community' };
const MODELS = { group: Conversation, channel: Channel, community: Community };

function newCode(type) {
  let code = PREFIX[type];
  for (const b of crypto.randomBytes(10)) code += ALPHABET[b % ALPHABET.length];
  return code;
}

const isAdmin = (doc, userId) => (doc.admins || []).some((a) => String(a._id || a) === String(userId));

function links(req, code) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const base = (process.env.PUBLIC_URL || `${proto}://${req.get('host')}`).replace(/\/+$/, '');
  return { code, link: `${base}/join/${code}`, deepLink: `chatly://join/${code}` };
}

async function findByCode(code) {
  const type = TYPE_BY_PREFIX[String(code || '')[0]];
  if (!type || !/^[A-Za-z0-9]{8,20}$/.test(code)) return null;
  const filter = { inviteCode: code };
  if (type === 'group') filter.isGroup = true;
  const doc = await MODELS[type].findOne(filter);
  return doc ? { type, doc } : null;
}

function preview(type, doc, userId) {
  const me = String(userId);
  const has = (list) => (list || []).some((x) => String(x._id || x) === me);
  if (type === 'group') {
    return {
      type, id: doc._id, name: doc.name, description: doc.description, avatar: doc.avatar,
      memberCount: (doc.participants || []).length, isMember: has(doc.participants),
      requiresApproval: doc.joinApproval !== false,
      isPending: (doc.joinRequests || []).some((r) => String(r.user) === me),
    };
  }
  if (type === 'channel') return { type, id: doc._id, name: doc.name, description: doc.description, avatar: doc.avatar, memberCount: (doc.followers || []).length, isMember: has(doc.followers) };
  return { type, id: doc._id, name: doc.name, description: doc.description, avatar: doc.avatar, memberCount: (doc.members || []).length, isMember: has(doc.members) };
}

async function loadForOwnerActions(req, res) {
  const { type, id } = req.params;
  if (!MODELS[type] || !mongoose.isValidObjectId(id)) {
    res.status(404).json({ message: 'Not found' });
    return null;
  }
  const filter = { _id: id };
  if (type === 'group') filter.isGroup = true;
  const doc = await MODELS[type].findOne(filter);
  if (!doc) {
    res.status(404).json({ message: 'Not found' });
    return null;
  }
  const me = String(req.user._id);
  const member =
    type === 'group' ? (doc.participants || []).some((p) => String(p) === me)
      : type === 'community' ? (doc.members || []).some((m) => String(m) === me)
        : true; // channels are public to everyone
  if (!member && !isAdmin(doc, me)) {
    res.status(404).json({ message: 'Not found' });
    return null;
  }
  // Groups: only admins can hand out the link (same as WhatsApp)
  if (type === 'group' && !isAdmin(doc, me)) {
    res.status(403).json({ message: 'Only group admins can share the invite link' });
    return null;
  }
  return doc;
}

async function ensureCode(type, doc) {
  if (doc.inviteCode) return doc.inviteCode;
  for (let i = 0; i < 5; i++) {
    const code = newCode(type);
    try {
      doc.inviteCode = code;
      await doc.save();
      return code;
    } catch (err) {
      if (!(err && err.code === 11000)) throw err; // collision: try another code
    }
  }
  throw new Error('Could not create an invite code');
}

async function addGroupMember(doc, user, text) {
  const uid = String(user._id);
  if (!(doc.participants || []).some((p) => String(p) === uid)) {
    doc.participants.push(user._id);
    doc.clearedAt.set(uid, new Date()); // new members do not see older messages
  }
  doc.joinRequests = (doc.joinRequests || []).filter((r) => String(r.user) !== uid);
  await doc.save();
  await createGroupMessage({ conversation: doc, sender: user, system: true, text });
  doc.participants.forEach((p) => emitToUser(p, 'group:updated', { conversationId: String(doc._id) }));
}

// GET /api/invites/for/:type/:id -> the link for a group / channel / community
router.get('/for/:type/:id', async (req, res) => {
  const doc = await loadForOwnerActions(req, res);
  if (!doc) return;
  const code = await ensureCode(req.params.type, doc);
  const out = links(req, code);
  if (req.params.type === 'group') {
    out.joinApproval = doc.joinApproval !== false;
    out.pendingCount = (doc.joinRequests || []).length;
  }
  res.json(out);
});

// POST /api/invites/for/:type/:id/reset -> new code, old link stops working (admins only)
router.post('/for/:type/:id/reset', async (req, res) => {
  const doc = await loadForOwnerActions(req, res);
  if (!doc) return;
  if (!isAdmin(doc, req.user._id)) return res.status(403).json({ message: 'Only admins can reset the link' });
  doc.inviteCode = undefined;
  await doc.save();
  const code = await ensureCode(req.params.type, doc);
  res.json(links(req, code));
});

// GET /api/invites/:code -> who is inviting me to what
router.get('/:code', async (req, res) => {
  const found = await findByCode(req.params.code);
  if (!found) return res.status(404).json({ message: 'This invite link is invalid or has been reset' });
  res.json({ invite: preview(found.type, found.doc, req.user._id) });
});

// POST /api/invites/:code/join
router.post('/:code/join', async (req, res) => {
  const found = await findByCode(req.params.code);
  if (!found) return res.status(404).json({ message: 'This invite link is invalid or has been reset' });
  const { type, doc } = found;
  const me = req.user._id;
  const meStr = String(me);

  if (type === 'group') {
    if ((doc.participants || []).some((p) => String(p) === meStr)) return res.json({ type, id: doc._id, joined: false });
    if ((doc.participants || []).length >= MAX_GROUP_MEMBERS) return res.status(400).json({ message: 'This group is full' });

    const name = req.user.name || req.user.username || 'Someone';
    if (doc.joinApproval !== false) {
      // An admin has to approve first: store a request instead of adding the person
      if (!(doc.joinRequests || []).some((r) => String(r.user) === meStr)) {
        if ((doc.joinRequests || []).length >= MAX_PENDING_REQUESTS) {
          return res.status(400).json({ message: 'This group has too many pending requests. Try again later.' });
        }
        doc.joinRequests.push({ user: me, at: new Date() });
        await doc.save();
        (doc.admins || []).forEach((a) => emitToUser(a, 'group:join-request', { conversationId: String(doc._id) }));
      }
      return res.json({ type, id: doc._id, joined: false, pending: true });
    }
    await addGroupMember(doc, req.user, `${name} joined using the group invite link`);
    return res.json({ type, id: doc._id, joined: true });
  }

  if (type === 'channel') {
    const following = (doc.followers || []).some((f) => String(f) === meStr);
    if (!following) {
      doc.followers.push(me);
      await doc.save();
    }
    return res.json({ type, id: doc._id, joined: !following });
  }

  const isMember = (doc.members || []).some((m) => String(m) === meStr);
  if (!isMember) {
    doc.members.push(me);
    await doc.save();
    await communities.addToGroups(doc, me);
  }
  return res.json({ type, id: doc._id, joined: !isMember });
});

// ---------- Join requests (groups) ----------
async function loadGroupAsAdmin(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Not found' });
    return null;
  }
  const doc = await Conversation.findOne({ _id: req.params.id, isGroup: true });
  if (!doc || !isAdmin(doc, req.user._id)) {
    res.status(doc ? 403 : 404).json({ message: doc ? 'Only group admins can do this' : 'Not found' });
    return null;
  }
  return doc;
}

// GET /api/invites/group/:id/requests -> people waiting for approval
router.get('/group/:id/requests', async (req, res) => {
  const doc = await loadGroupAsAdmin(req, res);
  if (!doc) return;
  const ids = (doc.joinRequests || []).map((r) => r.user);
  const people = ids.length ? await User.find({ _id: { $in: ids } }).select('name username avatar about') : [];
  const byId = new Map(people.map((u) => [String(u._id), u]));
  const requests = (doc.joinRequests || [])
    .filter((r) => byId.has(String(r.user)))
    .map((r) => ({ user: byId.get(String(r.user)).toPublic ? byId.get(String(r.user)).toPublic() : byId.get(String(r.user)), at: r.at }));
  res.json({ requests });
});

// POST /api/invites/group/:id/requests/:userId/approve
router.post('/group/:id/requests/:userId/approve', async (req, res) => {
  const doc = await loadGroupAsAdmin(req, res);
  if (!doc) return;
  const uid = String(req.params.userId);
  if (!(doc.joinRequests || []).some((r) => String(r.user) === uid)) return res.status(404).json({ message: 'This request no longer exists' });
  if ((doc.participants || []).length >= MAX_GROUP_MEMBERS) return res.status(400).json({ message: 'This group is full' });
  const person = await User.findById(uid).select('name username');
  if (!person) {
    doc.joinRequests = doc.joinRequests.filter((r) => String(r.user) !== uid);
    await doc.save();
    return res.status(404).json({ message: 'This account no longer exists' });
  }
  const name = person.name || person.username || 'Someone';
  await addGroupMember(doc, person, `${name} was approved to join by ${req.user.name || 'an admin'}`);
  res.json({ ok: true, pendingCount: doc.joinRequests.length });
});

// POST /api/invites/group/:id/requests/:userId/reject
router.post('/group/:id/requests/:userId/reject', async (req, res) => {
  const doc = await loadGroupAsAdmin(req, res);
  if (!doc) return;
  const uid = String(req.params.userId);
  doc.joinRequests = (doc.joinRequests || []).filter((r) => String(r.user) !== uid);
  await doc.save();
  res.json({ ok: true, pendingCount: doc.joinRequests.length });
});

// PUT /api/invites/group/:id/approval { required: true|false }
router.put('/group/:id/approval', async (req, res) => {
  const doc = await loadGroupAsAdmin(req, res);
  if (!doc) return;
  doc.joinApproval = Boolean(req.body.required);
  await doc.save();
  res.json({ joinApproval: doc.joinApproval, pendingCount: (doc.joinRequests || []).length });
});

// ---------- Public landing page: GET /join/:code ----------
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function landing(req, res) {
  const code = String(req.params.code || '');
  let found = null;
  try {
    found = await findByCode(code);
  } catch {
    found = null;
  }
  const appName = process.env.APP_NAME || 'Chatly';
  const what = found ? { group: 'group', channel: 'channel', community: 'community' }[found.type] : '';
  const title = found ? `Join “${esc(found.doc.name)}”` : 'Invite link not valid';
  const sub = found ? `You have been invited to a ${what} on ${esc(appName)}.` : 'This link is invalid or has been reset by an admin. Ask for a new one.';
  const button = found ? `<a class="btn" href="chatly://join/${esc(code)}">Open in ${esc(appName)}</a>
      <p class="hint">Do not have the app yet? Install ${esc(appName)}, open it, tap <b>New chat → Join with invite link</b> and paste this code:</p>
      <div class="code">${esc(code)}</div>` : '';
  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - ${esc(appName)}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0F1418;color:#F4F6F8;font-family:Arial,Helvetica,sans-serif}
  .card{max-width:380px;margin:24px;padding:32px 26px;background:#171C21;border-radius:20px;text-align:center}
  h1{font-size:22px;margin:0 0 10px}
  p{color:#B9BEC6;line-height:1.5;margin:0 0 20px}
  .btn{display:inline-block;background:#E8473F;color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px}
  .hint{font-size:13px;margin:26px 0 10px}
  .code{font-family:'Courier New',monospace;font-size:20px;letter-spacing:2px;background:#1F262D;border-radius:12px;padding:12px;user-select:all}
</style></head><body><div class="card"><h1>${title}</h1><p>${sub}</p>${button}</div></body></html>`);
}

module.exports = router;
module.exports.landing = landing;