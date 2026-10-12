-- Written by hand: Prisma would rebuild the User table, while SQLite adds a
-- column with a constant default in place. Existing admins start at version 0.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
