-- Sites allowed to embed the public menu in an iframe (F-10). Existing instances
-- get none: the menu stays impossible to embed until the admin lists a site.
-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN "embedOrigins" TEXT NOT NULL DEFAULT '';
