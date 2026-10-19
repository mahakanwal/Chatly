/**
 * Agora RTC token builder (AccessToken2, version "007") with no extra dependency.
 * Same algorithm as Agora's official `agora-token` package (RtcTokenBuilder.buildTokenWithUid).
 * Only needed when your Agora project uses "Secure mode" (App ID + App Certificate).
 */
const crypto = require('crypto');
const zlib = require('zlib');

const VERSION = '007';
const SERVICE_RTC = 1;
const PRIVILEGE_JOIN_CHANNEL = 1;
const PRIVILEGE_PUBLISH_AUDIO = 2;
const PRIVILEGE_PUBLISH_VIDEO = 3;
const PRIVILEGE_PUBLISH_DATA = 4;

const uint16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const uint32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const bytes = (buf) => Buffer.concat([uint16(buf.length), buf]);
const str = (s) => bytes(Buffer.from(String(s), 'utf8'));
const mapUint32 = (map) => {
  const keys = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b);
  return Buffer.concat([uint16(keys.length), ...keys.map((k) => Buffer.concat([uint16(k), uint32(map[k])]))]);
};
const hmac = (key, message) => crypto.createHmac('sha256', key).update(message).digest();

/**
 * @param {string} appId
 * @param {string} appCertificate
 * @param {string} channelName
 * @param {number} uid  0 = any uid may use the token
 * @param {number} expireSeconds token + privilege lifetime in seconds
 */
function buildRtcToken(appId, appCertificate, channelName, uid = 0, expireSeconds = 3600) {
  const issueTs = Math.floor(Date.now() / 1000);
  const salt = crypto.randomInt(1, 99999999);

  const privileges = {
    [PRIVILEGE_JOIN_CHANNEL]: expireSeconds,
    [PRIVILEGE_PUBLISH_AUDIO]: expireSeconds,
    [PRIVILEGE_PUBLISH_VIDEO]: expireSeconds,
    [PRIVILEGE_PUBLISH_DATA]: expireSeconds,
  };
  const service = Buffer.concat([uint16(SERVICE_RTC), mapUint32(privileges), str(channelName), str(uid === 0 ? '' : String(uid))]);

  const signingInfo = Buffer.concat([str(appId), uint32(issueTs), uint32(expireSeconds), uint32(salt), uint16(1), service]);

  let signing = hmac(uint32(issueTs), Buffer.from(appCertificate, 'utf8'));
  signing = hmac(uint32(salt), signing);
  const signature = hmac(signing, signingInfo);

  const content = Buffer.concat([bytes(signature), signingInfo]);
  return VERSION + zlib.deflateSync(content).toString('base64');
}

module.exports = { buildRtcToken };
