import app from './app';
import { appVersion, config } from './config';
import { configureSqlite, prisma } from './lib/prisma';
import { reportUploadsCheck } from './services/uploadsCheck';
import { resolveDatabasePath } from './lib/databasePath';
import { applySessionFloor } from './services/sessionFloor';
import { configureServerTimeouts } from './serverTimeouts';
import { reportStartupVersion } from './services/upgradeNoticeService';
import { backfillImageVariants } from './services/cocktail/imageVariants';

// In-flight requests get this long to finish before the process is killed
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const journalMode = await configureSqlite();
  console.log(`SQLite journal mode: ${journalMode}`);
  // The entrypoint has run the migrations: the tokenVersion column exists by now
  await applySessionFloor(resolveDatabasePath());
  // Before listening, so the warnings sit next to the other startup lines. Never throws.
  await reportUploadsCheck(prisma, { uploadDir: config.uploadDir });
  // After the migrations (AppState exists by now) and before listening. Never throws.
  await reportStartupVersion(prisma, appVersion(), config.releasesDir);

  // Express 5 hands listen errors (EADDRINUSE, EACCES) to this callback
  const server = app.listen(config.port, (err?: Error) => {
    if (err) {
      console.error(`Cannot listen on port ${config.port}:`, err.message);
      process.exit(1);
    }
    console.log(`🍸 Carta Cocktail API running on port ${config.port}`);
    // In the background, so the healthcheck does not wait: until a photo has its smaller
    // copies, the pages show the photo itself. Never rejects.
    void backfillImageVariants(prisma);
  });
  configureServerTimeouts(server);

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
