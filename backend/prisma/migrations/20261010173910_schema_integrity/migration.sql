-- The unique indexes come first: they are the statements that fail on existing
-- duplicates (see backend/scripts/check-integrity.ts). SQLite migrations do not run
-- in a transaction, so failing here leaves the database unchanged.

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_abbreviation_key" ON "Unit"("abbreviation");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bottle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "purchasePrice" REAL,
    "capacityMl" INTEGER NOT NULL,
    "remainingPercent" INTEGER NOT NULL DEFAULT 100,
    "openedAt" DATETIME,
    "alcoholPercentage" REAL,
    "location" TEXT,
    "isApero" BOOLEAN NOT NULL DEFAULT false,
    "isDigestif" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bottle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Bottle" ("alcoholPercentage", "capacityMl", "categoryId", "createdAt", "id", "isApero", "isDigestif", "location", "name", "openedAt", "purchasePrice", "remainingPercent") SELECT "alcoholPercentage", "capacityMl", "categoryId", "createdAt", "id", "isApero", "isDigestif", "location", "name", "openedAt", "purchasePrice", "remainingPercent" FROM "Bottle";
DROP TABLE "Bottle";
ALTER TABLE "new_Bottle" RENAME TO "Bottle";
CREATE INDEX "Bottle_categoryId_idx" ON "Bottle"("categoryId");
CREATE TABLE "new_CocktailIngredient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cocktailId" INTEGER NOT NULL,
    "quantity" REAL NOT NULL,
    "unitId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "bottleId" INTEGER,
    "categoryId" INTEGER,
    "ingredientId" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CocktailIngredient_cocktailId_fkey" FOREIGN KEY ("cocktailId") REFERENCES "Cocktail" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CocktailIngredient_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CocktailIngredient_bottleId_fkey" FOREIGN KEY ("bottleId") REFERENCES "Bottle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CocktailIngredient_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CocktailIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CocktailIngredient" ("bottleId", "categoryId", "cocktailId", "id", "ingredientId", "position", "quantity", "sourceType", "unitId") SELECT "bottleId", "categoryId", "cocktailId", "id", "ingredientId", "position", "quantity", "sourceType", "unitId" FROM "CocktailIngredient";
DROP TABLE "CocktailIngredient";
ALTER TABLE "new_CocktailIngredient" RENAME TO "CocktailIngredient";
CREATE INDEX "CocktailIngredient_cocktailId_idx" ON "CocktailIngredient"("cocktailId");
CREATE INDEX "CocktailIngredient_bottleId_idx" ON "CocktailIngredient"("bottleId");
CREATE INDEX "CocktailIngredient_categoryId_idx" ON "CocktailIngredient"("categoryId");
CREATE INDEX "CocktailIngredient_ingredientId_idx" ON "CocktailIngredient"("ingredientId");
CREATE INDEX "CocktailIngredient_unitId_idx" ON "CocktailIngredient"("unitId");
CREATE TABLE "new_CocktailPreferredBottle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cocktailIngredientId" INTEGER NOT NULL,
    "bottleId" INTEGER NOT NULL,
    CONSTRAINT "CocktailPreferredBottle_cocktailIngredientId_fkey" FOREIGN KEY ("cocktailIngredientId") REFERENCES "CocktailIngredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CocktailPreferredBottle_bottleId_fkey" FOREIGN KEY ("bottleId") REFERENCES "Bottle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CocktailPreferredBottle" ("bottleId", "cocktailIngredientId", "id") SELECT "bottleId", "cocktailIngredientId", "id" FROM "CocktailPreferredBottle";
DROP TABLE "CocktailPreferredBottle";
ALTER TABLE "new_CocktailPreferredBottle" RENAME TO "CocktailPreferredBottle";
CREATE INDEX "CocktailPreferredBottle_bottleId_idx" ON "CocktailPreferredBottle"("bottleId");
CREATE UNIQUE INDEX "CocktailPreferredBottle_cocktailIngredientId_bottleId_key" ON "CocktailPreferredBottle"("cocktailIngredientId", "bottleId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Category_type_idx" ON "Category"("type");

-- CreateIndex
CREATE INDEX "CocktailInstruction_cocktailId_idx" ON "CocktailInstruction"("cocktailId");

-- CreateIndex
CREATE INDEX "MenuBottle_bottleId_idx" ON "MenuBottle"("bottleId");

-- CreateIndex
CREATE INDEX "MenuBottle_menuSectionId_idx" ON "MenuBottle"("menuSectionId");

-- CreateIndex
CREATE INDEX "MenuCocktail_cocktailId_idx" ON "MenuCocktail"("cocktailId");

-- CreateIndex
CREATE INDEX "MenuCocktail_menuSectionId_idx" ON "MenuCocktail"("menuSectionId");

-- CreateIndex
CREATE INDEX "MenuSection_menuId_idx" ON "MenuSection"("menuId");
