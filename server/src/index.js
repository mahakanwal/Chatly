const config = require('./config');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const { requireAuth } = require('./middleware/auth');
const { initSocket } = require('./socket');
const { getBotUser } = require('./services/ai');
const User = require('./models/User');
const { startMomentCleanup } = require('./services/moments');

const app = express();
app.set('trust proxy', 1); // Render / Railway sit behind a proxy
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/', (req, res) => res.json({ name: 'Chatly API', status: 'ok' }));
app.get('/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', requireAuth, require('./routes/users'));
app.use('/api/conversations', requireAuth, require('./routes/conversations'));
app.use('/api/messages', requireAuth, require('./routes/messages'));
app.use('/api/media', requireAuth, require('./routes/media'));
app.use('/api/calls', requireAuth, require('./routes/calls'));
app.use('/api/groups', requireAuth, require('./routes/groups').router);
app.use('/api/moments', requireAuth, require('./routes/moments'));
app.use('/api/channels', requireAuth, require('./routes/channels'));
app.use('/api/communities', requireAuth, require('./routes/communities'));

app.use((req, res) => res.status(404).json({ message: 'Not found' }));
// Express 5 forwards async errors here
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: 'Something went wrong. Please try again.' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6,
  pingInterval: 20000,
  pingTimeout: 20000,
});
initSocket(io);

async function start() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');
  // Quick check so wrong Cloudinary keys show up at startup, not on the first upload
  const { v2: cloudinary } = require('cloudinary');
  try {
    await cloudinary.api.ping();
    console.log('Cloudinary OK');
  } catch (e) {
    console.error('Cloudinary FAILED:', (e.error && e.error.message) || e.message);
  }
  // After a restart nobody is connected yet
  await User.updateMany({ online: true, isBot: false }, { $set: { online: false, lastSeen: new Date() } });
  await getBotUser();
  startMomentCleanup();
  console.log(config.agora.appId ? `Agora calls: ON (${config.agora.appCertificate ? 'token mode' : 'testing mode, no token'})` : 'Agora calls: AGORA_APP_ID not set on the server (app falls back to its own App ID)');
  server.listen(config.port, () => console.log(`API running on port ${config.port}`));
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
