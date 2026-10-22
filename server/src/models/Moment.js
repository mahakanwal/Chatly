const { Schema, model, Types } = require('mongoose');

/**
 * Moments: photo / video / text updates that disappear after 24 hours.
 * Visible to the people the owner has a one-to-one chat with.
 */
const momentSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['text', 'image', 'video'], required: true },
    text: { type: String, default: '', maxlength: 700 },
    bgColor: { type: String, default: '#E8473F' },
    media: {
      type: new Schema(
        {
          url: String,
          publicId: String,
          resourceType: String,
          duration: Number,
          width: Number,
          height: Number,
          thumbnail: String,
        },
        { _id: false }
      ),
      default: null,
    },
    // WhatsApp-style Status Likes: a private heart like, NOT a chat message.
    // Who liked is shown next to that viewer's name in the owner's viewers list.
    likes: [{ type: Types.ObjectId, ref: 'User' }],
    // One reaction per viewer (same toggle rule as message reactions)
    reactions: [
      {
        _id: false,
        user: { type: Types.ObjectId, ref: 'User' },
        emoji: { type: String, maxlength: 16 },
        at: { type: Date, default: Date.now },
      },
    ],
    viewers: [
      {
        _id: false,
        user: { type: Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

momentSchema.index({ user: 1, createdAt: 1 });

module.exports = model('Moment', momentSchema);
