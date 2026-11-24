import { prisma } from '../lib/prisma';

/**
 * The site settings row, created with the schema defaults on first read.
 * One upsert rather than a lookup then a create, which two first requests at the
 * same time could both run, the second one failing on the unique id.
 */
export function getOrCreateSettings() {
  return prisma.siteSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
