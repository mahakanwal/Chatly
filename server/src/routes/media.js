const router = require('express').Router();
const { singleFile } = require('../middleware/upload');
const { uploadBuffer, messageTypeFor } = require('../services/storage');

// POST /api/media/upload (multipart "file", optional "duration" for voice notes)
router.post('/upload', singleFile('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const mimeType = req.file.mimetype || 'application/octet-stream';
  try {
    const media = await uploadBuffer(req.file.buffer, { mimeType, originalName: req.file.originalname });
    const clientDuration = Number(req.body.duration);
    if (!media.duration && clientDuration > 0) media.duration = Math.round(clientDuration);

    res.json({ media, type: messageTypeFor(mimeType) });
  } catch (err) {
    // Never leave the request hanging: without this the app's upload times out
    // and shows a misleading "check your connection" alert while the real
    // cause (e.g. wrong Cloudinary keys) is only visible here.
    console.error('Media upload failed:', err.message);
    res.status(502).json({ message: `Media upload failed: ${err.message || 'storage error'}` });
  }
});

module.exports = router;
