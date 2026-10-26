const { Schema, model, Types } = require('mongoose');

const mediaSchema = new Schema(
  {
    url: String,
    publicId: String,
    resourceType: String,
    name: String,
    size: Number,
    mimeType: String,
    duration: Number, // seconds (audio/video)
    width: Number,
    height: Number,
    thumbnail: String,
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversation: { type: Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: Types.ObjectId, ref: 'User', required: true },
    // One-to-one chats only (null in groups)
    recipient: { type: Types.ObjectId, ref: 'User', default: null, index: true },
    type: {
      type: String,
      // "system" = group events ("Ali added Sara")
      enum: ['text', 'image', 'video', 'audio', 'document', 'system'],
      default: 'text',
    },
    text: { type: String, default: '', maxlength: 8000 },
    media: { type: mediaSchema, default: null },
    replyTo: { type: Types.ObjectId, ref: 'Message', default: null },
    status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent', index: true },
    deliveredAt: Date,
    seenAt: Date,
    deletedForEveryone: { type: Boolean, default: false },
    deletedFor: [{ type: Types.ObjectId, ref: 'User' }],
    // Groups: who received / read the message (status turns delivered / seen when everyone has)
    deliveredTo: [{ type: Types.ObjectId, ref: 'User' }],
    readBy: [
      {
        _id: false,
        user: { type: Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
    // Reply to someone's Moment (shown as a small quote in the chat)
    momentRef: {
      type: new Schema({ momentId: Types.ObjectId, type: String, text: String, thumb: String }, { _id: false }),
      default: null,
    },
    // View Once: if true, the content is hidden in lists/previews and is only
    // revealed once per recipient via POST /messages/:id/view-once, after which
    // that recipient can never see it again (added to deletedFor for them).
    viewOnce: { type: Boolean, default: false },
    viewedOnceBy: [
      {
        _id: false,
        user: { type: Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
    // One reaction per user (tap the same emoji again to remove it, tap another to change it)
    reactions: [
      {
        _id: false,
        user: { type: Types.ObjectId, ref: 'User' },
        emoji: { type: String, maxlength: 16 },
        at: { type: Date, default: Date.now },
      },
    ],
    // Id generated on the device for optimistic UI de-duplication
    clientId: { type: String, index: true },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = model('Message', messageSchema);
