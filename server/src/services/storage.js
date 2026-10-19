const { v2: cloudinary } = require('cloudinary');
const config = require('../config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

function resourceTypeFor(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  // Cloudinary stores audio under the "video" resource type
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return 'video';
  return 'raw';
}

function messageTypeFor(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

/** Uploads a buffer to Cloudinary and returns the media object stored on messages. */
function uploadBuffer(buffer, { mimeType, originalName, folder = 'chatly/media' }) {
  const resourceType = resourceTypeFor(mimeType);
  const options = { folder, resource_type: resourceType };
  if (resourceType === 'raw' && originalName) {
    // Keep extension so documents download with the correct type
    const safe = originalName.replace(/[^\w.\-]/g, '_');
    options.public_id = `${Date.now()}_${safe}`;
  }

  return new Promise((resolve, reject) => {
    // Cloudinary can hang forever on bad credentials (no callback, no error).
    // Never leave the request hanging: fail fast with a clear message instead.
    const timer = setTimeout(() => {
      reject(new Error('Storage upload timed out — check Cloudinary credentials in server/.env'));
    }, 30000);
    const done = (err, media) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(media);
    };
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return done(err);
      const media = {
        url: result.secure_url,
        publicId: result.public_id,
        resourceType,
        name: originalName || '',
        size: result.bytes,
        mimeType,
        duration: result.duration ? Math.round(result.duration) : undefined,
        width: result.width,
        height: result.height,
      };
      if (resourceType === 'video' && mimeType.startsWith('video/')) {
        media.thumbnail = cloudinary.url(result.public_id, {
          resource_type: 'video',
          format: 'jpg',
          transformation: [{ start_offset: 0, width: 480, crop: 'limit' }],
        });
      }
      done(null, media);
    });
    stream.on('error', (err) => done(err));
    stream.end(buffer);
  });
}

async function destroy(publicId, resourceType = 'image') {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.warn('Cloudinary delete failed:', err.message);
  }
}

module.exports = { uploadBuffer, destroy, messageTypeFor };
