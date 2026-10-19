const { default: OpenAI, toFile } = require('openai');
const config = require('../config');
const User = require('../models/User');
const Message = require('../models/Message');
const { emitToUser } = require('../realtime');
const { createAndDispatch } = require('./messages');

const ai = config.ai;
const openai = new OpenAI({ apiKey: ai.apiKey, baseURL: ai.baseURL });

/** Downloads an image (resized by Cloudinary) and returns a base64 data URL.
 *  Data URLs work with OpenAI, Gemini and Groq alike. */
async function imageDataUrl(url) {
  const resized = url.includes('/image/upload/') ? url.replace('/image/upload/', '/image/upload/w_1024,c_limit,q_auto,f_jpg/') : url;
  const res = await fetch(resized);
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

const HISTORY_LIMIT = 20;
let botUserCache = null;

/** Returns the single AI assistant user, creating it on first run. */
async function getBotUser() {
  if (botUserCache) return botUserCache;
  let bot = await User.findOne({ isBot: true });
  if (!bot) {
    bot = await User.create({
      isBot: true,
      name: ai.assistantName,
      about: 'Your personal AI assistant. Ask me anything.',
      online: true,
    });
  }
  botUserCache = bot;
  return bot;
}

async function transcribe(url) {
  if (!ai.transcribeModel) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const file = await toFile(buffer, 'voice.m4a');
    const result = await openai.audio.transcriptions.create({ file, model: ai.transcribeModel });
    return result.text || null;
  } catch (err) {
    console.warn('Transcription failed:', err.message);
    return null;
  }
}

async function toOpenAIMessage(msg, botId) {
  const role = String(msg.sender) === String(botId) ? 'assistant' : 'user';

  if (role === 'assistant') return { role, content: msg.text || '' };

  switch (msg.type) {
    case 'image': {
      if (!ai.vision) {
        return { role, content: `(The user sent a photo${msg.text ? ` with caption: ${msg.text}` : ''}. You cannot see images, say so politely.)` };
      }
      try {
        const parts = [];
        if (msg.text) parts.push({ type: 'text', text: msg.text });
        parts.push({ type: 'image_url', image_url: { url: await imageDataUrl(msg.media.url) } });
        return { role, content: parts };
      } catch (err) {
        console.warn('Image load failed:', err.message);
        return { role, content: '(The user sent a photo that could not be loaded.)' };
      }
    }
    case 'audio': {
      const text = await transcribe(msg.media.url);
      return { role, content: text ? `(Voice message) ${text}` : '(The user sent a voice message that could not be transcribed.)' };
    }
    case 'video':
      return { role, content: `(The user sent a video${msg.text ? ` with caption: ${msg.text}` : ''}. You cannot watch videos.)` };
    case 'document':
      return { role, content: `(The user sent a file named "${msg.media && msg.media.name}". You cannot open files.)` };
    default:
      return { role, content: msg.text || '' };
  }
}

/** Generates and sends the AI reply for the latest messages in a conversation. */
async function replyToUser(conversation, user) {
  const bot = await getBotUser();
  const convId = String(conversation._id);

  emitToUser(user._id, 'typing', { conversationId: convId, userId: String(bot._id), isTyping: true });

  try {
    const cleared = conversation.clearedAt && conversation.clearedAt.get(String(user._id));
    const query = {
      conversation: conversation._id,
      deletedForEveryone: false,
      deletedFor: { $ne: user._id },
    };
    if (cleared) query.createdAt = { $gt: cleared };

    const recent = await Message.find(query).sort({ createdAt: -1 }).limit(HISTORY_LIMIT).lean();
    recent.reverse();

    // Only send the latest photo / voice note to keep replies fast and within free-tier limits
    const history = [];
    for (let i = 0; i < recent.length; i += 1) {
      const m = recent[i];
      const isLatest = i === recent.length - 1;
      if (m.type === 'audio' && !isLatest) {
        history.push({ role: 'user', content: '(Earlier voice message)' });
      } else if (m.type === 'image' && !isLatest) {
        history.push({ role: 'user', content: `(Earlier photo${m.text ? `: ${m.text}` : ''})` });
      } else {
        history.push(await toOpenAIMessage(m, bot._id));
      }
    }

    const completion = await openai.chat.completions.create({
      model: ai.model,
      messages: [
        {
          role: 'system',
          content:
            `You are ${ai.assistantName}, a helpful assistant inside a chat app. ` +
            `You are talking with ${user.name || 'the user'}. Reply like a chat message: clear, friendly and concise. ` +
            'Reply in the same language the user writes in (including Roman Urdu). Use plain text, no markdown headings.',
        },
        ...history,
      ],
    });

    const text = (completion.choices[0].message.content || '').trim() || 'Sorry, I could not generate a reply.';
    await createAndDispatch({ conversation, sender: bot, recipient: user, type: 'text', text });
  } catch (err) {
    console.error('AI reply failed:', err.message);
    await createAndDispatch({
      conversation,
      sender: bot,
      recipient: user,
      type: 'text',
      text: 'Sorry, I am having trouble replying right now. Please try again in a moment.',
    });
  } finally {
    emitToUser(user._id, 'typing', { conversationId: convId, userId: String(bot._id), isTyping: false });
  }
}

module.exports = { getBotUser, replyToUser };
