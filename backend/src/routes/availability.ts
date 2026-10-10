import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  calculateCocktailAvailability,
  calculateAllCocktailsAvailability,
} from '../services/availabilityService';

const router = Router();

// Get availability for a specific cocktail
router.get('/cocktails/:id', async (req: AuthRequest, res: Response) => {
  const cocktailId = parseInt(String(req.params.id));
  const availability = await calculateCocktailAvailability(cocktailId);
  res.json(availability);
});

// Get availability for all cocktails
router.get('/cocktails', async (_req: AuthRequest, res: Response) => {
  const availabilities = await calculateAllCocktailsAvailability();
  res.json(availabilities);
});

export default router;
