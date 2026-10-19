const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    phone: { type: String, unique: true, sparse: true, index: true },
    name: { type: String, trim: true, maxlength: 50, default: '' },
    about: { type: String, trim: true, maxlength: 140, default: 'Available' },
    avatar: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    isBot: { type: Boolean, default: false },
    online: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    pushTokens: { type: [String], default: [] },
    blocked: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isDeleted: { type: Boolean, default: false },

    // ---------- Settings ----------
    // Chat wallpaper: '' = default, 'color:#RRGGBB' = solid colour, otherwise an image URL
    wallpaper: { type: String, default: '' },
    wallpaperPublicId: { type: String, default: '' },
    // Privacy
    hideLastSeen: { type: Boolean, default: false },
    readReceipts: { type: Boolean, default: true },
    // Notifications
    notifyMessages: { type: Boolean, default: true },
    notifyGroups: { type: Boolean, default: true },
    notifyMoments: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/** Profile other people see. Respects "hide last seen & online". */
userSchema.methods.toPublic = function toPublic() {
  if (this.isDeleted) {
    return { _id: this._id, phone: '', name: 'Deleted account', about: '', avatar: '', isBot: false, isDeleted: true, online: false, lastSeen: null };
  }
  const hidden = !this.isBot && Boolean(this.hideLastSeen);
  return {
    _id: this._id,
    phone: this.isBot ? '' : this.phone,
    name: this.name,
    about: this.about,
    avatar: this.avatar,
    isBot: this.isBot,
    online: this.isBot ? true : hidden ? false : this.online,
    lastSeen: hidden ? null : this.lastSeen,
    lastSeenHidden: hidden,
  };
};

/** Full profile + settings, only ever sent to the account owner. */
userSchema.methods.toSelf = function toSelf() {
  return {
    ...this.toPublic(),
    online: this.online,
    lastSeen: this.lastSeen,
    wallpaper: this.wallpaper || '',
    hideLastSeen: Boolean(this.hideLastSeen),
    readReceipts: this.readReceipts !== false,
    notifyMessages: this.notifyMessages !== false,
    notifyGroups: this.notifyGroups !== false,
    notifyMoments: Boolean(this.notifyMoments),
  };
};

module.exports = model('User', userSchema);
