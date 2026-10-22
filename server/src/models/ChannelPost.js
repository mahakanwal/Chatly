const { Schema, model, Types } = require('mongoose');

const channelPostSchema = new Schema(
  {
    channel: { type: Types.ObjectId, ref: 'Channel', required: true, index: true },
    author: { type: Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image', 'video'], default: 'text' },
    text: { type: String, default: '', maxlength: 4000 },
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
    reactions: [
      {
        _id: false,
        user: { type: Types.ObjectId, ref: 'User' },
        emoji: { type: String, maxlength: 16 },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

channelPostSchema.index({ channel: 1, createdAt: -1 });

module.exports = model('ChannelPost', channelPostSchema);
