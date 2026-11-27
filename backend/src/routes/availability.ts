import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  calculateCocktailAvailability,
  calculateAllCocktailsAvailability,
} from '../services/availabilityService';
import { valid, validate } from '../validation/validate';
import { idRequest } from '../validation/common';
import { apiDocs } from '../openapi/routeDoc';
import { CocktailAvailabilities, CocktailAvailability } from '../validation/availability';

const router = Router();
const doc = apiDocs('Availability');

router.get(
  '/cocktails/:id',
  doc({
    operationId: 'getCocktailAvailability',
    summary: 'Get how many servings of a cocktail the stock allows',
    responses: { 200: CocktailAvailability },
    errors: { 404: 'No cocktail has this id.' },
  }),
  validate(idRequest),
  async (_req: AuthRequest, res: Response) => {
    const availability = await calculateCocktailAvailability(
      valid<typeof idRequest>(res).params.id,
    );
    res.json(availability);
  },
);

router.get(
  '/cocktails',
  doc({
    operationId: 'listCocktailAvailabilities',
    summary: 'Get how many servings of each cocktail the stock allows',
    description: 'By cocktail id.',
    responses: { 200: CocktailAvailabilities },
  }),
  async (_req: AuthRequest, res: Response) => {
    const availabilities = await calculateAllCocktailsAvailability();
    res.json(availabilities);
  },
);

export default router;
