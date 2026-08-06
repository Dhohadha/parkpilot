const https = require('https');
const jwt = require('jsonwebtoken');

let publicKeysCache = null;
let cacheExpiration = 0;

const getFirebasePublicKeys = () => {
  return new Promise((resolve, reject) => {
    if (publicKeysCache && Date.now() < cacheExpiration) {
      return resolve(publicKeysCache);
    }

    https.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const keys = JSON.parse(data);
          const cacheControl = res.headers['cache-control'];
          let maxAge = 3600; // default 1 hour
          if (cacheControl) {
            const match = cacheControl.match(/max-age=(\d+)/);
            if (match) maxAge = parseInt(match[1], 10);
          }
          publicKeysCache = keys;
          cacheExpiration = Date.now() + (maxAge * 1000);
          resolve(keys);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
};

/**
 * Verifies a Firebase ID token.
 * @param {string} idToken The Firebase ID Token sent from the client.
 * @returns {Promise<object>} The decoded token payload.
 */
exports.verifyFirebaseToken = async (idToken) => {
  try {
    const decodedHeader = jwt.decode(idToken, { complete: true });
    if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
      throw new Error('Invalid token structure or missing kid');
    }

    const kid = decodedHeader.header.kid;
    const keys = await getFirebasePublicKeys();
    const publicKey = keys[kid];

    if (!publicKey) {
      throw new Error('Public key not found for kid');
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || 'parkpilot-512de';
    
    const decoded = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`
    });

    return decoded;
  } catch (error) {
    console.error('Firebase token verification failed:', error.message);
    throw error;
  }
};
