const multer = require('multer');
const config = require('../config');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

/** Wraps multer so size errors return a clean JSON message. */
function singleFile(field = 'file') {
  const handler = upload.single(field);
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: `File is too large (max ${Math.round(config.maxUploadBytes / 1048576)} MB)` });
      }
      return res.status(400).json({ message: err.message });
    });
}

module.exports = { singleFile };
