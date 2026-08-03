import './types'; // Express Request augmentation (req.user, req.profile)
import 'dotenv/config';

import { app } from './app';
import { prisma } from './prisma/client';
import { logger } from './utils/logger';

const PORT = process.env.PORT ?? 4000;

const server = app.listen(PORT, () => {
  logger.info(`Taska API running`, { port: PORT, env: process.env.NODE_ENV ?? 'development' });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close(async () => {
    logger.info('HTTP server closed');
    await prisma.$disconnect();
    logger.info('Prisma disconnected');
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