const { Schema, model, Types } = require('mongoose');

/**
 * Channels: broadcast-only. Only the owner / admins can post; everyone else
 * follows and reacts. (WhatsApp-style: followers cannot reply in the channel.)
 */
const channelSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 60, required: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    avatar: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    owner: { type: Types.ObjectId, ref: 'User', required: true },
    admins: [{ type: Types.ObjectId, ref: 'User' }],
    followers: [{ type: Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = model('Channel', channelSchema);
