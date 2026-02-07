import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { config } from './config';
import { i18nMiddleware } from './i18n';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import categoryRoutes from './routes/categories';
import bottleRoutes from './routes/bottles';
import ingredientRoutes from './routes/ingredients';
import unitRoutes from './routes/units';
import cocktailRoutes from './routes/cocktails';
import menuRoutes from './routes/menus';
import menuBottleRoutes from './routes/menuBottles';
import publicRoutes from './routes/public';
import shortageRoutes from './routes/shortages';
import availabilityRoutes from './routes/availability';

const app = express();

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(i18nMiddleware);

// Static files for uploads
app.use('/uploads', express.static(config.uploadDir));

// Public routes (no auth)
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);

// Protected routes
app.use('/api/categories', authMiddleware, categoryRoutes);
app.use('/api/bottles', authMiddleware, bottleRoutes);
app.use('/api/ingredients', authMiddleware, ingredientRoutes);
app.use('/api/units', authMiddleware, unitRoutes);
app.use('/api/cocktails', authMiddleware, cocktailRoutes);
app.use('/api/menus', authMiddleware, menuRoutes);
app.use('/api/menu-bottles', authMiddleware, menuBottleRoutes);
app.use('/api/shortages', authMiddleware, shortageRoutes);
app.use('/api/availability', authMiddleware, availabilityRoutes);

export default app;
