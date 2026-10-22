const { Schema, model, Types } = require('mongoose');

/**
 * Communities: a named collection of groups. Joining a community adds you to
 * all of its groups (as a new member, so you do not see older history);
 * leaving removes you from those groups too. The groups themselves stay
 * intact when a community is deleted — only the link is removed.
 */
const communitySchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 60, required: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    avatar: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    owner: { type: Types.ObjectId, ref: 'User', required: true },
    admins: [{ type: Types.ObjectId, ref: 'User' }],
    members: [{ type: Types.ObjectId, ref: 'User' }],
    groups: [{ type: Types.ObjectId, ref: 'Conversation' }],
  },
  { timestamps: true }
);

module.exports = model('Community', communitySchema);
