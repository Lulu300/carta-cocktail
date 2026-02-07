import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  calculateCocktailAvailability,
  calculateAllCocktailsAvailability,
} from '../services/availabilityService';

const router = Router();

// Get availability for a specific cocktail
router.get('/cocktails/:id', async (req: AuthRequest, res: Response) => {
  try {
    const cocktailId = parseInt(String(req.params.id));
    const availability = await calculateCocktailAvailability(cocktailId);
    res.json(availability);
  } catch (error: any) {
    console.error(error);
    if (error.message === 'Cocktail not found') {
      res.status(404).json({ error: req.t('errors.notFound') });
      return;
    }
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

// Get availability for all cocktails
router.get('/cocktails', async (req: AuthRequest, res: Response) => {
  try {
    const availabilities = await calculateAllCocktailsAvailability();
    res.json(availabilities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: req.t('errors.serverError') });
  }
});

export default router;
