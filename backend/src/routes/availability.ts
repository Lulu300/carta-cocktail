import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  calculateCocktailAvailability,
  calculateAllCocktailsAvailability,
} from '../services/availabilityService';
import { valid, validate } from '../validation/validate';
import { idRequest } from '../validation/common';

const router = Router();

// Get availability for a specific cocktail
router.get('/cocktails/:id', validate(idRequest), async (_req: AuthRequest, res: Response) => {
  const availability = await calculateCocktailAvailability(valid<typeof idRequest>(res).params.id);
  res.json(availability);
});

// Get availability for all cocktails
router.get('/cocktails', async (_req: AuthRequest, res: Response) => {
  const availabilities = await calculateAllCocktailsAvailability();
  res.json(availabilities);
});

export default router;
