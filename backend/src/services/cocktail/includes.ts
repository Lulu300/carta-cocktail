import { Prisma } from '../../generated/prisma/client';

/** Everything the admin pages read about a cocktail. */
export const cocktailInclude = {
  ingredients: {
    include: {
      unit: true,
      bottle: { include: { category: true } },
      category: true,
      ingredient: true,
      preferredBottles: { include: { bottle: { include: { category: true } } } },
    },
    orderBy: { position: 'asc' },
  },
  instructions: { orderBy: { stepNumber: 'asc' } },
} satisfies Prisma.CocktailInclude;

// Public responses use explicit selects so inventory data (purchase price,
// opening date, remaining level, desired stock) never leaves the server.
export const CATEGORY_PUBLIC_SELECT = {
  id: true, name: true, nameTranslations: true, type: true,
} satisfies Prisma.CategorySelect;

const INGREDIENT_BOTTLE_PUBLIC_SELECT = {
  id: true, name: true, alcoholPercentage: true,
  category: { select: CATEGORY_PUBLIC_SELECT },
} satisfies Prisma.BottleSelect;

const INGREDIENT_PUBLIC_SELECT = {
  id: true, name: true, nameTranslations: true, icon: true,
} satisfies Prisma.IngredientSelect;

const LINE_PUBLIC_SELECT = {
  id: true, quantity: true, position: true, sourceType: true,
  unit: true,
  category: { select: CATEGORY_PUBLIC_SELECT },
  ingredient: { select: INGREDIENT_PUBLIC_SELECT },
  bottle: { select: INGREDIENT_BOTTLE_PUBLIC_SELECT },
} satisfies Prisma.CocktailIngredientSelect;

const GUEST_COCKTAIL_SELECT = {
  id: true, name: true, description: true, imagePath: true, tags: true, isAvailable: true,
  ingredients: { select: LINE_PUBLIC_SELECT, orderBy: { position: 'asc' } },
  instructions: {
    select: { id: true, stepNumber: true, text: true },
    orderBy: { stepNumber: 'asc' },
  },
} satisfies Prisma.CocktailSelect;

// Notes and preferred bottles are private: only a verified admin gets them.
const ADMIN_COCKTAIL_SELECT = {
  ...GUEST_COCKTAIL_SELECT,
  notes: true,
  ingredients: {
    ...GUEST_COCKTAIL_SELECT.ingredients,
    select: {
      ...LINE_PUBLIC_SELECT,
      preferredBottles: { select: { id: true, bottle: { select: INGREDIENT_BOTTLE_PUBLIC_SELECT } } },
    },
  },
} satisfies Prisma.CocktailSelect;

/** Public view of a cocktail: the admin one adds the notes and the preferred bottles. */
export function buildPublicCocktailSelect(isAdmin: boolean) {
  return isAdmin ? ADMIN_COCKTAIL_SELECT : GUEST_COCKTAIL_SELECT;
}
