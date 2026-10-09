import app from './app';
import { config } from './config';
import { configureSqlite, prisma } from './lib/prisma';

// In-flight requests get this long to finish before the process is killed
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const journalMode = await configureSqlite();
  console.log(`SQLite journal mode: ${journalMode}`);

  const server = app.listen(config.port, () => {
    console.log(`🍸 Carta Cocktail API running on port ${config.port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    // Stops accepting connections and waits for in-flight requests
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => console.error('unhandledRejection', err));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
