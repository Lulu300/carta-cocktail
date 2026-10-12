import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { config } from './config';
import { HttpError } from './errors';
import { i18nMiddleware } from './i18n';
import { authMiddleware } from './middleware/auth';
import { apiNotFoundHandler, errorHandler } from './middleware/errorHandler';
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

const LOGIN_RATE_WINDOW_MS = 15 * 60_000;

const app = express();

// Proxies (nginx, and any reverse proxy in front of it) forward the client
// address: req.ip must be that client, so that the login limit applies per
// client and not to the proxy that every request comes through.
app.set('trust proxy', config.trustProxy);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigin || false }));
// Request logs would bury the test results
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}
// i18n first, so that body parsing errors are answered in the client's language
app.use(i18nMiddleware);
app.use(express.json());

// Only failed attempts count: the admin who mistypes once and logs in is not held back
const loginLimiter = rateLimit({
  windowMs: LOGIN_RATE_WINDOW_MS,
  limit: config.loginRateLimit,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new HttpError(429, 'errors.tooManyAttempts')),
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
app.use('/api/backup', authMiddleware, backupRoutes);

// Unknown API paths answer JSON, not Express's HTML page
app.use('/api', apiNotFoundHandler);
// Must stay last: receives every error thrown or rejected by the routes above
app.use(errorHandler);

export default app;
