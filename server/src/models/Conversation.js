const { Schema, model, Types } = require('mongoose');

const conversationSchema = new Schema(
  {
    participants: [{ type: Types.ObjectId, ref: 'User', required: true }],
    // One-to-one: sorted "idA_idB" key so the same pair never gets two conversations.
    // Groups: "group_<random>" so the unique index never clashes.
    pairKey: { type: String, unique: true, index: true },
    isAI: { type: Boolean, default: false },
    lastMessage: { type: Types.ObjectId, ref: 'Message', default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    // userId -> date the user cleared this chat (messages before it are hidden for that user).
    // For groups this is also set when a member joins, so they don't see older history.
    clearedAt: { type: Map, of: Date, default: {} },

    // ---------- Groups ----------
    isGroup: { type: Boolean, default: false, index: true },
    name: { type: String, trim: true, maxlength: 60, default: '' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    avatar: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    admins: [{ type: Types.ObjectId, ref: 'User' }],
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

conversationSchema.statics.pairKeyFor = (a, b) => [String(a), String(b)].sort().join('_');

module.exports = model('Conversation', conversationSchema);
