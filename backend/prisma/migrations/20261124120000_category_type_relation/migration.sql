-- Category.type becomes a foreign key to CategoryType.name. A category whose type
-- has no CategoryType row (database edited by hand, old backup) would break the
-- new constraint: its type is created first, in gray and without translations, as
-- the seed has always done at startup. No category is refused or changed.
-- The INSERT can run twice. A failure after CREATE TABLE "new_Category" leaves
-- that table behind: restore the pre-migrate copy, as README.md says
-- ("Recovering from a failed migration").
INSERT INTO "CategoryType" ("name", "color")
SELECT DISTINCT "type", 'gray' FROM "Category"
WHERE "type" NOT IN (SELECT "name" FROM "CategoryType");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameTranslations" TEXT,
    "type" TEXT NOT NULL,
    "desiredStock" INTEGER NOT NULL DEFAULT 1,
    "minimumPercent" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_type_fkey" FOREIGN KEY ("type") REFERENCES "CategoryType" ("name") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("createdAt", "desiredStock", "id", "minimumPercent", "name", "nameTranslations", "type") SELECT "createdAt", "desiredStock", "id", "minimumPercent", "name", "nameTranslations", "type" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE INDEX "Category_type_idx" ON "Category"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
