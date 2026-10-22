const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(date) {
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);
}

/** 4:09 pm */
export function formatTime(value) {
  const d = new Date(value);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

function shortDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Time shown in the chat list */
export function formatListTime(value) {
  if (!value) return '';
  const d = new Date(value);
  const diff = daysAgo(d);
  if (diff === 0) return formatTime(d);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return WEEKDAYS[d.getDay()];
  return shortDate(d);
}

/** Separator inside a chat: Today / Yesterday / Monday / 12 October 2026 */
export function formatDayLabel(value) {
  const d = new Date(value);
  const diff = daysAgo(d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return WEEKDAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function formatLastSeen(value) {
  if (!value) return 'offline';
  const d = new Date(value);
  const diff = daysAgo(d);
  if (diff === 0) return `last seen today at ${formatTime(d)}`;
  if (diff === 1) return `last seen yesterday at ${formatTime(d)}`;
  return `last seen ${shortDate(d)}`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export function messagePreview(msg) {
  if (!msg) return '';
  if (msg.deleted) return 'This message was deleted';
  switch (msg.type) {
    case 'image':
      return msg.text ? `Photo: ${msg.text}` : 'Photo';
    case 'video':
      return msg.text ? `Video: ${msg.text}` : 'Video';
    case 'audio':
      return 'Voice message';
    case 'document':
      return (msg.media && msg.media.name) || 'Document';
    default:
      if (msg.momentRef && msg.text) return `Moment reply: ${msg.text}`;
      return msg.text || '';
  }
}

export function makeClientId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const STATUS_RANK = { failed: -1, pending: 0, sent: 1, delivered: 2, seen: 3 };

/** Never move a tick backwards (e.g. a late REST response after a "seen" socket event). */
export function maxStatus(a, b) {
  return (STATUS_RANK[a] ?? 0) >= (STATUS_RANK[b] ?? 0) ? a : b;
}

/** "Just now", "5 minutes ago", "3 hours ago", "Yesterday, 4:09 pm" — used for Moments */
export function formatAgo(value) {
  if (!value) return '';
  const d = new Date(value);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 12) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const diff = daysAgo(d);
  if (diff === 0) return `Today, ${formatTime(d)}`;
  if (diff === 1) return `Yesterday, ${formatTime(d)}`;
  return `${shortDate(d)}, ${formatTime(d)}`;
}
