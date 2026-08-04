import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import { AppError } from './utils/errors';
import { logger } from './utils/logger';

// Route imports
import authRouter      from './routes/auth';
import profilesRouter  from './routes/profiles';
import dashboardRouter from './routes/dashboard';
import tasksRouter     from './routes/tasks';
import walletRouter    from './routes/wallet';

export const app = express();

// ─── Security & Parsing Middleware ────────────────────────────────────────────

app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header, dev environments, or local dev origins
      if (
        !origin ||
        process.env.NODE_ENV === 'development' ||
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// Parse JSON bodies — must come before routes that read req.body
// Paystack webhook needs the raw body for signature verification.
// We handle that via express.raw() in the payments route file itself.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────

app.use('/api/v1', apiLimiter);
app.use('/api/v1/auth', authLimiter);

// ─── Health Check (no auth, no rate limit) ───────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/v1/auth',      authRouter);
app.use('/api/v1/profiles',  profilesRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/tasks',     tasksRouter);
app.use('/api/v1/wallet',    walletRouter);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError && err.isOperational) {
    // Known operational error — safe to expose message to client
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // Unknown programming error — don't leak internals
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
  });

  return res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again later.',
  });
});