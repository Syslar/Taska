import './types'; // Express Request augmentation (req.user, req.profile)
import 'dotenv/config';

import { app } from './app';

import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = '0.0.0.0'; // Bind to all interfaces — required inside Docker/Railway containers

const server = app.listen(PORT, HOST, () => {
  logger.info(`Taska API running`, { port: PORT, host: HOST, env: process.env.NODE_ENV ?? 'development' });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close(async () => {
    logger.info('HTTP server closed');

    process.exit(0);
  });

  // Force-exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Could not close connections in time — forcefully shutting down');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled promise rejections (programming bugs — log and exit)
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});