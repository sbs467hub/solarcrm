import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is not set');
  return new TextEncoder().encode(s);
}

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Extracts and verifies the Bearer token from the request.
 * On failure writes a 401 response and returns null.
 */
export async function authenticate(req, res) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Brak autoryzacji' });
    return null;
  }
  const token = header.slice(7);
  try {
    return await verifyToken(token);
  } catch {
    res.status(401).json({ error: 'Token wygasł lub jest nieprawidłowy' });
    return null;
  }
}
