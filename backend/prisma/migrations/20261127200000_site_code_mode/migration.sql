-- Code Mode of the MCP server (F-15). Existing instances keep it off: the admin turns it on in
-- Settings.
-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN "codeModeEnabled" BOOLEAN NOT NULL DEFAULT false;
