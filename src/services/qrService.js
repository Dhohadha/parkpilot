const crypto = require('crypto');

const SECRET_KEY = process.env.QR_SECRET || 'parkpilot_sparktank_super_secret_key_2026';

/**
 * Generate a cryptographically signed QR token payload
 */

function generateQRToken(sessionId, slotNumber, lotCode) {
  const nonce = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();
  const payloadStr = `${sessionId}:${slotNumber}:${lotCode}:${timestamp}:${nonce}`;
  
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadStr)
    .digest('hex');

  const tokenObj = {
    sessionId,
    slotNumber,
    lotCode,
    timestamp,
    nonce,
    sig: signature
  };

  const rawToken = Buffer.from(JSON.stringify(tokenObj)).toString('base64url');
  return { token: rawToken, signature };
}

/**
 * Validate incoming QR token scanned by Security
 */
function validateQRToken(tokenString) {
  try {
    const jsonStr = Buffer.from(tokenString, 'base64url').toString('utf8');
    const tokenObj = JSON.parse(jsonStr);

    const { sessionId, slotNumber, lotCode, timestamp, nonce, sig } = tokenObj;

    const payloadStr = `${sessionId}:${slotNumber}:${lotCode}:${timestamp}:${nonce}`;
    const expectedSig = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(payloadStr)
      .digest('hex');

    if (sig !== expectedSig) {
      return { valid: false, reason: 'Invalid signature - suspected tampered QR code' };
    }

    return { valid: true, payload: tokenObj };
  } catch (err) {
    return { valid: false, reason: 'Malformed QR token format' };
  }
}

module.exports = {
  generateQRToken,
  validateQRToken
};
