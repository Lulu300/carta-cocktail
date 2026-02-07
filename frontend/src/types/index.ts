export interface User {
  id: number;
  email: string;
}

export interface Category {
  id: number;
  name: string;
  type: 'SPIRIT' | 'SYRUP';
  desiredStock: number;
  createdAt: string;
  _count?: { bottles: number };
  bottles?: Bottle[];
}

export interface Bottle {
  id: number;
  name: string;
  categoryId: number;
  category?: Category;
  purchasePrice: number | null;
  capacityMl: number;
  remainingPercent: number;
  openedAt: string | null;
  createdAt: string;
}

export interface Ingredient {
  id: number;
  name: string;
  icon: string | null;
  isAvailable: boolean;
  createdAt: string;
}

export interface Unit {
  id: number;
  name: string;
  abbreviation: string;
  conversionFactorToMl: number | null;
}

export interface CocktailIngredient {
  id: number;
  cocktailId: number;
  quantity: number;
  unitId: number;
  unit?: Unit;
  sourceType: 'BOTTLE' | 'CATEGORY' | 'INGREDIENT';
  bottleId: number | null;
  bottle?: Bottle | null;
  categoryId: number | null;
  category?: Category | null;
  ingredientId: number | null;
  ingredient?: Ingredient | null;
  position: number;
  preferredBottles?: CocktailPreferredBottle[];
}

export interface CocktailPreferredBottle {
  id: number;
  cocktailIngredientId: number;
  bottleId: number;
  bottle?: Bottle;
}

export interface CocktailInstruction {
  id: number;
  cocktailId: number;
  stepNumber: number;
  text: string;
}

export interface Cocktail {
  id: number;
  name: string;
  description: string | null;
  notes: string | null;
  imagePath: string | null;
  tags: string;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  ingredients?: CocktailIngredient[];
  instructions?: CocktailInstruction[];
}

export interface MenuCocktail {
  id: number;
  menuId: number;
  cocktailId: number;
  cocktail?: Cocktail;
  position: number;
  isHidden: boolean;
}

export interface Menu {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  cocktails?: MenuCocktail[];
  _count?: { cocktails: number };
}

export interface Shortage {
  category: {
    id: number;
    name: string;
    type: string;
    desiredStock: number;
  };
  sealedCount: number;
  totalUsable: number;
  deficit: number;
  isShortage: boolean;
}

// Form types for creating/updating
export interface CocktailIngredientInput {
  sourceType: 'BOTTLE' | 'CATEGORY' | 'INGREDIENT';
  bottleId?: number | null;
  categoryId?: number | null;
  ingredientId?: number | null;
  quantity: number;
  unitId: number;
  preferredBottleIds?: number[];
}

export interface CocktailInput {
  name: string;
  description?: string;
  notes?: string;
  tags?: string[];
  isAvailable?: boolean;
  ingredients?: CocktailIngredientInput[];
  instructions?: { text: string }[];
}

export interface MenuInput {
  name: string;
  description?: string;
  slug: string;
  isPublic?: boolean;
  cocktails?: {
    cocktailId: number;
    position?: number;
    isHidden?: boolean;
  }[];
}

// Availability types
export interface IngredientAvailability {
  cocktailIngredientId: number;
  sourceType: string;
  name: string;
  icon: string | null;
  quantity: number;
  unit: string;
  isAvailable: boolean;
  availableCount: number | null;
  reason?: string;
}

export interface CocktailAvailability {
  cocktailId: number;
  isAvailable: boolean;
  maxServings: number;
  ingredients: IngredientAvailability[];
  missingIngredients: string[];
  lowStockWarnings: string[];
}
