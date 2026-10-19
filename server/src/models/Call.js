const { Schema, model, Types } = require('mongoose');

const callSchema = new Schema(
  {
    caller: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    callee: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    callType: { type: String, enum: ['audio', 'video'], default: 'audio' },
    status: {
      type: String,
      enum: ['ringing', 'active', 'ended', 'declined', 'cancelled', 'missed'],
      default: 'ringing',
      index: true,
    },
    acceptedAt: { type: Date },
    endedAt: { type: Date },
    durationSec: { type: Number, default: 0 },
  },
  { timestamps: true }
);

callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ callee: 1, createdAt: -1 });

module.exports = model('Call', callSchema);
