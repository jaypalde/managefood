const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

/**
 * Generates a QR payload for a food batch. The payload only ever encodes an
 * opaque batch code — never sensitive data — and the actual state transition
 * (pickup/delivery) is validated server-side against QRTransaction history,
 * so a photographed/duplicated QR image cannot be replayed twice for the
 * same action (see scanToken uniqueness + status checks in the routes).
 */
async function generateBatchQR(batchCode) {
  const payload = JSON.stringify({ type: 'KUMBHSETU_BATCH', batchCode });
  const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 300 });
  return dataUrl; // base64 PNG data URL, ready to render in <img src="...">
}

function newScanToken() {
  return uuidv4();
}

module.exports = { generateBatchQR, newScanToken };
