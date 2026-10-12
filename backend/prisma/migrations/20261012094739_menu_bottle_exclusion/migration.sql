-- CreateTable
CREATE TABLE "MenuBottleExclusion" (
    "menuId" INTEGER NOT NULL,
    "bottleId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("menuId", "bottleId"),
    CONSTRAINT "MenuBottleExclusion_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MenuBottleExclusion_bottleId_fkey" FOREIGN KEY ("bottleId") REFERENCES "Bottle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MenuBottleExclusion_bottleId_idx" ON "MenuBottleExclusion"("bottleId");
