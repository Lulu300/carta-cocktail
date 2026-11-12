import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { i18nMiddleware } from './i18n';
import { authMiddleware } from './middleware/auth';
import { apiNotFoundHandler, errorHandler } from './middleware/errorHandler';
import { createRateLimiter } from './middleware/rateLimit';
import authRoutes from './routes/auth';
import categoryRoutes from './routes/categories';
import categoryTypeRoutes from './routes/categoryTypes';
import bottleRoutes from './routes/bottles';
import ingredientRoutes from './routes/ingredients';
import unitRoutes from './routes/units';
import cocktailRoutes from './routes/cocktails';
import menuRoutes from './routes/menus';
import menuBottleRoutes from './routes/menuBottles';
import menuSectionRoutes from './routes/menuSections';
import publicRoutes from './routes/public';
import shortageRoutes from './routes/shortages';
import availabilityRoutes from './routes/availability';
import settingsRoutes from './routes/settings';
import backupRoutes from './routes/backup';
import healthRoutes from './routes/health';

const LOGIN_RATE_WINDOW_MS = 15 * 60_000;
const API_RATE_WINDOW_MS = 60_000;
// Export and import are heavy (database snapshot, zip of every photo) and the
// admin runs them a few times a day at most.
const BACKUP_RATE_WINDOW_MS = 15 * 60_000;
const BACKUP_RATE_LIMIT = 10;

const app = express();

// Proxies (nginx, and any reverse proxy in front of it) forward the client
// address: req.ip must be that client, so that the rate limits apply per
// client and not to the proxy that every request comes through.
app.set('trust proxy', config.trustProxy);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigin || false }));
// Before the request logger: the Docker healthcheck calls it every 30 s and would fill the logs.
// Public, like /api/auth and /api/public: Docker calls it without a token.
app.use('/api/health', healthRoutes);
// Request logs would bury the test results
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}
// i18n first, so that body parsing errors are answered in the client's language
app.use(i18nMiddleware);
// After i18n, so that the 429 is translated. Before the body parsers, so that a
// flood is refused without reading bodies of up to 5 MB, and before authMiddleware,
// so that requests without a token count too.
const apiLimiter = createRateLimiter({
  windowMs: API_RATE_WINDOW_MS,
  limit: config.apiRateLimit,
  messageKey: 'errors.tooManyRequests',
});
app.use('/api', apiLimiter);
// The confirmation of a bottle import sends back up to 2,000 rows and their resolutions: about
// 2 MB at most, far above the default 100 kB. Read here, before the global parser (which skips a
// body already read) and before authMiddleware: the limit stays at a few MB, under nginx's 20 MB.
app.use('/api/bottles/import/confirm', express.json({ limit: '5mb' }));
app.use(express.json());

// Only failed attempts count: the admin who mistypes once and logs in is not held back
const loginLimiter = createRateLimiter({
  windowMs: LOGIN_RATE_WINDOW_MS,
  limit: config.loginRateLimit,
  messageKey: 'errors.tooManyAttempts',
  skipSuccessfulRequests: true,
});
app.use('/api/auth/login', loginLimiter);

// Static files for uploads
app.use('/uploads', express.static(config.uploadDir));

// Public routes (no auth)
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);

// Protected routes
app.use('/api/category-types', authMiddleware, categoryTypeRoutes);
app.use('/api/categories', authMiddleware, categoryRoutes);
app.use('/api/bottles', authMiddleware, bottleRoutes);
app.use('/api/ingredients', authMiddleware, ingredientRoutes);
app.use('/api/units', authMiddleware, unitRoutes);
app.use('/api/cocktails', authMiddleware, cocktailRoutes);
app.use('/api/menus', authMiddleware, menuRoutes);
app.use('/api/menu-bottles', authMiddleware, menuBottleRoutes);
app.use('/api/menu-sections', authMiddleware, menuSectionRoutes);
app.use('/api/shortages', authMiddleware, shortageRoutes);
app.use('/api/availability', authMiddleware, availabilityRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
// The backup limit counts authenticated requests only: authMiddleware already
// refuses a request without a token at little cost, and the API limit covers
// floods without one. Counting them here would let anyone who shares the admin's
// address (every client from the Internet in the Docker rootless, Podman, Docker
// Desktop or docker-proxy installs of the README) block the backups.
const backupLimiter = createRateLimiter({
  windowMs: BACKUP_RATE_WINDOW_MS,
  limit: BACKUP_RATE_LIMIT,
  messageKey: 'errors.tooManyRequests',
});
app.use('/api/backup', authMiddleware, backupLimiter, backupRoutes);

// Unknown API paths answer JSON, not Express's HTML page
app.use('/api', apiNotFoundHandler);
// Must stay last: receives every error thrown or rejected by the routes above
app.use(errorHandler);

export default app;
