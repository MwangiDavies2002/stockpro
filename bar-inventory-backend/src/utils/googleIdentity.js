const crypto = require('crypto');

let keysCache = { keys: [], expiresAt: 0 };

async function googleSigningKeys() {
  if (keysCache.expiresAt > Date.now() && keysCache.keys.length) return keysCache.keys;
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw Object.assign(new Error('Google identity verification is temporarily unavailable'), { status: 503 });
  const body = await response.json();
  if (!Array.isArray(body.keys)) throw Object.assign(new Error('Google identity keys are unavailable'), { status: 503 });
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 300);
  keysCache = { keys: body.keys, expiresAt: Date.now() + Math.max(60, Math.min(maxAge, 3600)) * 1000 };
  return keysCache.keys;
}

async function verifyGoogleCredential(credential) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw Object.assign(new Error('Google sign-in is not configured'), { status: 503 });
  const token = String(credential || '');
  if (token.length > 16384) throw Object.assign(new Error('Google credential is too large'), { status: 401 });
  const parts = token.split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Google credential is invalid'), { status: 401 });
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error('Google credential is invalid'), { status: 401 });
  }
  if (header.alg !== 'RS256' || !header.kid) throw Object.assign(new Error('Google credential uses an unsupported signature'), { status: 401 });
  const key = (await googleSigningKeys()).find((item) => item.kid === header.kid && item.kty === 'RSA');
  if (!key) {
    keysCache.expiresAt = 0;
    const refreshed = await googleSigningKeys();
    if (!refreshed.some((item) => item.kid === header.kid)) throw Object.assign(new Error('Google credential signature is invalid'), { status: 401 });
  }
  const signingKey = (await googleSigningKeys()).find((item) => item.kid === header.kid && item.kty === 'RSA');
  const validSignature = signingKey && crypto.verify(
    'RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
    crypto.createPublicKey({ key: signingKey, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url')
  );
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const authorizedPartyValid = audiences.length <= 1 || claims.azp === audience;
  if (!validSignature || !audiences.includes(audience) || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
      !authorizedPartyValid || !Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now || Number(claims.exp) > now + 3600 ||
      !Number.isFinite(Number(claims.iat)) || Number(claims.iat) > now + 60 ||
      (claims.nbf !== undefined && (!Number.isFinite(Number(claims.nbf)) || Number(claims.nbf) > now)) ||
      claims.email_verified !== true || !claims.email || !claims.sub) {
    throw Object.assign(new Error('Google credential could not be verified'), { status: 401 });
  }
  return { sub: String(claims.sub), email: String(claims.email).trim().toLowerCase(), name: String(claims.name || '').trim() };
}

module.exports = { verifyGoogleCredential };
