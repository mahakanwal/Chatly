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
