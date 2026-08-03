import { Request, Response, NextFunction } from 'express';
import { createVerify } from 'crypto';
import { AppError } from '../utils/errors';

/**
 * authenticate — Middleware that validates the Clerk JWT from the
 * Authorization header using the JWKS public key stored in JWKS_PUBLIC_KEY env var.
 *
 * No extra npm packages needed — uses Node's built-in crypto module.
 * The public key comes directly from your Clerk project's .env.
 *
 * Rejects immediately with 401 if:
 *   - Authorization header is missing
 *   - Token is invalid, expired, or signature mismatch
 *
 * Usage: router.get('/me', authenticate, asyncHandler(getMe));
 */
function decodeBase64Url(str: string): string {
  // Convert base64url to base64
  return str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - (str.length % 4)) % 4, '=');
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Missing or invalid Authorization header', 401));
  }

  const token = authHeader.split(' ')[1];
  const publicKey = process.env.JWKS_PUBLIC_KEY;

  if (!publicKey) {
    return next(new AppError('Server auth configuration error: JWKS_PUBLIC_KEY missing.', 500));
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed JWT');

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify the signature using the RSA public key
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    const signatureBuffer = Buffer.from(decodeBase64Url(signatureB64), 'base64');
    const isValid = verifier.verify(publicKey, signatureBuffer);

    if (!isValid) {
      return next(new AppError('Invalid token signature', 401));
    }

    // Decode and validate the payload
    const payload = JSON.parse(Buffer.from(decodeBase64Url(payloadB64), 'base64').toString('utf8'));

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return next(new AppError('Token has expired', 401));
    }

    // Attach the Clerk userId (sub claim) to the request object
    if (!payload.sub) {
      return next(new AppError('Token missing user identity', 401));
    }

    req.user = { id: payload.sub };
    next();
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401));
  }
}

