import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Unit conversion factors to milliliters (ml)
const UNIT_TO_ML: Record<string, number> = {
  'ml': 1,
  'cl': 10,
  'oz': 29.5735, // US fluid ounce
  'cc': 5, // cuillère à café (teaspoon) ≈ 5ml
  'cs': 15, // cuillère à soupe (tablespoon) ≈ 15ml
  'cuillère à café': 5,
  'cuillère à soupe': 15,
  'dash': 0.6, // bartender's dash ≈ 0.6ml
  'trait': 0.6,
  'pièce': 0, // pieces are counted, not measured
  'piece': 0,
  'pce': 0,
  'feuille': 0,
  'tranche': 0,
  'zeste': 0,
};

interface IngredientAvailability {
  cocktailIngredientId: number;
  sourceType: string;
  name: string;
  icon: string | null;
  quantity: number;
  unit: string;
  isAvailable: boolean;
  availableCount: number | null; // How many times this ingredient allows making the cocktail (null = unlimited or unavailable)
  reason?: string; // Why it's unavailable
}

interface CocktailAvailability {
  cocktailId: number;
  isAvailable: boolean;
  maxServings: number; // How many times the cocktail can be made
  ingredients: IngredientAvailability[];
  missingIngredients: string[];
  lowStockWarnings: string[];
}

/**
 * Convert a quantity from one unit to milliliters
 */
function convertToMl(quantity: number, unitAbbreviation: string): number {
  const lowerUnit = unitAbbreviation.toLowerCase();
  const factor = UNIT_TO_ML[lowerUnit];

  if (factor === undefined) {
    // Unknown unit, assume ml
    console.warn(`Unknown unit: ${unitAbbreviation}, assuming ml`);
    return quantity;
  }

  if (factor === 0) {
    // Non-measurable unit (pieces)
    return 0;
  }

  return quantity * factor;
}

/**
 * Calculate how many servings are available for a specific ingredient requirement
 */
async function calculateIngredientAvailability(
  cocktailIngredient: any
): Promise<IngredientAvailability> {
  const { id, quantity, unit, sourceType, bottleId, categoryId, ingredientId } = cocktailIngredient;

  const base: IngredientAvailability = {
    cocktailIngredientId: id,
    sourceType,
    name: '',
    icon: null,
    quantity,
    unit: unit.abbreviation,
    isAvailable: false,
    availableCount: null,
  };

  try {
    // Handle INGREDIENT source type
    if (sourceType === 'INGREDIENT' && ingredientId) {
      const ingredient = await prisma.ingredient.findUnique({
        where: { id: ingredientId },
      });

      if (!ingredient) {
        return { ...base, name: 'Unknown', reason: 'Ingredient not found' };
      }

      return {
        ...base,
        name: ingredient.name,
        icon: ingredient.icon,
        isAvailable: ingredient.isAvailable,
        availableCount: ingredient.isAvailable ? null : 0, // null means unlimited if available
        reason: ingredient.isAvailable ? undefined : 'Ingredient marked as unavailable',
      };
    }

    // Handle BOTTLE source type
    if (sourceType === 'BOTTLE' && bottleId) {
      const bottle = await prisma.bottle.findUnique({
        where: { id: bottleId },
        include: { category: true },
      });

      if (!bottle) {
        return { ...base, name: 'Unknown', reason: 'Bottle not found' };
      }

      const requiredMl = convertToMl(quantity, unit.abbreviation);
      if (requiredMl === 0) {
        // Piece-based, just check if bottle exists and has some remaining
        const isAvailable = bottle.remainingPercent > 0;
        return {
          ...base,
          name: bottle.name,
          isAvailable,
          availableCount: isAvailable ? null : 0,
          reason: isAvailable ? undefined : 'Bottle is empty',
        };
      }

      const availableMl = (bottle.capacityMl * bottle.remainingPercent) / 100;
      const servings = Math.floor(availableMl / requiredMl);

      return {
        ...base,
        name: bottle.name,
        isAvailable: servings > 0,
        availableCount: servings,
        reason: servings === 0 ? 'Bottle has insufficient quantity' : undefined,
      };
    }

    // Handle CATEGORY source type
    if (sourceType === 'CATEGORY' && categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        include: {
          bottles: {
            where: { remainingPercent: { gt: 0 } },
          },
        },
      });

      if (!category) {
        return { ...base, name: 'Unknown', reason: 'Category not found' };
      }

      const requiredMl = convertToMl(quantity, unit.abbreviation);
      if (requiredMl === 0) {
        // Piece-based, check if any bottle exists
        const isAvailable = category.bottles.length > 0;
        return {
          ...base,
          name: category.name,
          isAvailable,
          availableCount: isAvailable ? null : 0,
          reason: isAvailable ? undefined : `No ${category.name} bottles available`,
        };
      }

      // Sum all available ml from bottles in this category
      const totalAvailableMl = category.bottles.reduce((sum, bottle) => {
        return sum + (bottle.capacityMl * bottle.remainingPercent) / 100;
      }, 0);

      const servings = Math.floor(totalAvailableMl / requiredMl);

      return {
        ...base,
        name: category.name,
        isAvailable: servings > 0,
        availableCount: servings,
        reason: servings === 0 ? `Insufficient ${category.name} in stock` : undefined,
      };
    }

    return { ...base, name: 'Unknown', reason: 'Invalid ingredient configuration' };
  } catch (error) {
    console.error('Error calculating ingredient availability:', error);
    return { ...base, name: 'Error', reason: 'Calculation error' };
  }
}

/**
 * Calculate the overall availability of a cocktail
 */
export async function calculateCocktailAvailability(
  cocktailId: number
): Promise<CocktailAvailability> {
  const cocktail = await prisma.cocktail.findUnique({
    where: { id: cocktailId },
    include: {
      ingredients: {
        include: { unit: true },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!cocktail) {
    throw new Error('Cocktail not found');
  }

  // Calculate availability for each ingredient
  const ingredientAvailabilities = await Promise.all(
    cocktail.ingredients.map(ing => calculateIngredientAvailability(ing))
  );

  // Determine overall availability
  const missingIngredients: string[] = [];
  const lowStockWarnings: string[] = [];

  let maxServings = Infinity;
  let isAvailable = true;

  for (const ingAvail of ingredientAvailabilities) {
    if (!ingAvail.isAvailable) {
      isAvailable = false;
      missingIngredients.push(ingAvail.name);
    } else if (ingAvail.availableCount !== null) {
      // Has a limited count
      maxServings = Math.min(maxServings, ingAvail.availableCount);

      if (ingAvail.availableCount > 0 && ingAvail.availableCount <= 3) {
        lowStockWarnings.push(`${ingAvail.name}: only ${ingAvail.availableCount} servings left`);
      }
    }
  }

  // If maxServings is still Infinity, it means all ingredients are unlimited
  if (maxServings === Infinity) {
    maxServings = 999; // Cap at a reasonable number for display
  }

  return {
    cocktailId,
    isAvailable,
    maxServings: isAvailable ? maxServings : 0,
    ingredients: ingredientAvailabilities,
    missingIngredients,
    lowStockWarnings,
  };
}

/**
 * Calculate availability for all cocktails
 */
export async function calculateAllCocktailsAvailability(): Promise<Record<number, CocktailAvailability>> {
  const cocktails = await prisma.cocktail.findMany({
    select: { id: true },
  });

  const results: Record<number, CocktailAvailability> = {};

  for (const cocktail of cocktails) {
    try {
      results[cocktail.id] = await calculateCocktailAvailability(cocktail.id);
    } catch (error) {
      console.error(`Error calculating availability for cocktail ${cocktail.id}:`, error);
      // Provide a default unavailable state on error
      results[cocktail.id] = {
        cocktailId: cocktail.id,
        isAvailable: false,
        maxServings: 0,
        ingredients: [],
        missingIngredients: ['Calculation error'],
        lowStockWarnings: [],
      };
    }
  }

  return results;
}
