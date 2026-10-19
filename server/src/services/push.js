const User = require('../models/User');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Sends an Expo push notification to every device the user is logged in on. */
async function sendPush(user, { title, body, data }) {
  const tokens = (user.pushTokens || []).filter((t) => /^Expo(nent)?PushToken\[.+\]$/.test(t));
  if (!tokens.length) return;

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    channelId: 'messages',
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const json = await res.json();
    // Remove tokens for uninstalled apps
    const invalid = [];
    (json.data || []).forEach((ticket, i) => {
      if (ticket.status === 'error' && ticket.details && ticket.details.error === 'DeviceNotRegistered') {
        invalid.push(tokens[i]);
      }
    });
    if (invalid.length) {
      await User.updateOne({ _id: user._id }, { $pull: { pushTokens: { $in: invalid } } });
    }
  } catch (err) {
    console.warn('Push send failed:', err.message);
  }
}

module.exports = { sendPush };
