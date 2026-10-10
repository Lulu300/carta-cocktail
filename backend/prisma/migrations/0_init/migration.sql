-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CategoryType" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "nameTranslations" TEXT,
    "color" TEXT NOT NULL DEFAULT 'gray'
);

-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameTranslations" TEXT,
    "type" TEXT NOT NULL,
    "desiredStock" INTEGER NOT NULL DEFAULT 1,
    "minimumPercent" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bottle" (
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
    CONSTRAINT "Bottle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameTranslations" TEXT,
    "icon" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameTranslations" TEXT,
    "abbreviation" TEXT NOT NULL,
    "conversionFactorToMl" REAL
);

-- CreateTable
CREATE TABLE "Cocktail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "imagePath" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CocktailIngredient" (
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
    CONSTRAINT "CocktailIngredient_bottleId_fkey" FOREIGN KEY ("bottleId") REFERENCES "Bottle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CocktailIngredient_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CocktailIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CocktailPreferredBottle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cocktailIngredientId" INTEGER NOT NULL,
    "bottleId" INTEGER NOT NULL,
    CONSTRAINT "CocktailPreferredBottle_cocktailIngredientId_fkey" FOREIGN KEY ("cocktailIngredientId") REFERENCES "CocktailIngredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CocktailPreferredBottle_bottleId_fkey" FOREIGN KEY ("bottleId") REFERENCES "Bottle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CocktailInstruction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cocktailId" INTEGER NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "CocktailInstruction_cocktailId_fkey" FOREIGN KEY ("cocktailId") REFERENCES "Cocktail" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COCKTAILS',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MenuCocktail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "menuId" INTEGER NOT NULL,
    "cocktailId" INTEGER NOT NULL,
    "menuSectionId" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "MenuCocktail_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MenuCocktail_cocktailId_fkey" FOREIGN KEY ("cocktailId") REFERENCES "Cocktail" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MenuCocktail_menuSectionId_fkey" FOREIGN KEY ("menuSectionId") REFERENCES "MenuSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuBottle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "menuId" INTEGER NOT NULL,
    "bottleId" INTEGER NOT NULL,
    "menuSectionId" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "MenuBottle_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MenuBottle_bottleId_fkey" FOREIGN KEY ("bottleId") REFERENCES "Bottle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MenuBottle_menuSectionId_fkey" FOREIGN KEY ("menuSectionId") REFERENCES "MenuSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuSection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "menuId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MenuSection_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "siteName" TEXT NOT NULL DEFAULT 'Carta Cocktail',
    "siteIcon" TEXT NOT NULL DEFAULT ''
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CocktailPreferredBottle_cocktailIngredientId_bottleId_key" ON "CocktailPreferredBottle"("cocktailIngredientId", "bottleId");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_slug_key" ON "Menu"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCocktail_menuId_cocktailId_key" ON "MenuCocktail"("menuId", "cocktailId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuBottle_menuId_bottleId_key" ON "MenuBottle"("menuId", "bottleId");

