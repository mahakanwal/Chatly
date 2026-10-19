const { Schema, model, Types } = require('mongoose');

/** User reports for moderation (required by App Store / Play Store for chat apps). */
const reportSchema = new Schema(
  {
    reporter: { type: Types.ObjectId, ref: 'User', required: true },
    reported: { type: Types.ObjectId, ref: 'User', required: true },
    conversation: { type: Types.ObjectId, ref: 'Conversation' },
    reason: { type: String, maxlength: 500, default: '' },
    status: { type: String, enum: ['open', 'reviewed', 'actioned'], default: 'open' },
  },
  { timestamps: true }
);

module.exports = model('Report', reportSchema);
