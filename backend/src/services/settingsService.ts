import type { SiteSettings } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { parseEmbedOrigins } from './embedOrigins';

/**
 * The site settings row, created with the schema defaults on first read.
 * One upsert rather than a lookup then a create, which two first requests at the
 * same time could both run, the second one failing on the unique id.
 */
export function getOrCreateSettings() {
  return prisma.siteSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

/** The settings as the admin API sends them: the embedding sites as a list. */
export function toSiteSettingsResponse(settings: SiteSettings) {
  return { ...settings, embedOrigins: parseEmbedOrigins(settings.embedOrigins) };
}
