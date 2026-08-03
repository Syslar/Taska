import rateLimit from 'express-rate-limit';

/**
 * apiLimiter — Applied to all /api/v1 routes.
 * Allows 100 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
});

/**
 * authLimiter — Applied to /api/v1/auth routes.
 * Strict: 10 attempts per 15 minutes. Prevents brute-force login attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
});

/**
 * paymentLimiter — Applied to /api/v1/payments routes.
 * Very strict: 20 requests per hour. Prevents payment abuse.
 */
export const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Payment rate limit exceeded. Try again in 1 hour.' },
});
