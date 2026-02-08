import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
  await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@carta.local' },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL || 'admin@carta.local',
      passwordHash,
    },
  });

  // Create default units (only if none exist)
  const existingUnits = await prisma.unit.count();
  if (existingUnits === 0) {
    await prisma.unit.createMany({
      data: [
        { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 },
        { name: 'Millilitre', abbreviation: 'ml', conversionFactorToMl: 1 },
        { name: 'Once (US)', abbreviation: 'oz', conversionFactorToMl: 29.5735 },
        { name: 'Pièce', abbreviation: 'pce', conversionFactorToMl: null },
        { name: 'Trait', abbreviation: 'trait', conversionFactorToMl: 0.6 },
        { name: 'Cuillère à café', abbreviation: 'cc', conversionFactorToMl: 5 },
        { name: 'Cuillère à soupe', abbreviation: 'cs', conversionFactorToMl: 15 },
        { name: 'Dash', abbreviation: 'dash', conversionFactorToMl: 0.6 },
        { name: 'Feuille', abbreviation: 'feuille', conversionFactorToMl: null },
        { name: 'Tranche', abbreviation: 'tranche', conversionFactorToMl: null },
        { name: 'Zeste', abbreviation: 'zeste', conversionFactorToMl: null },
      ],
    });
  }

  // Create default bottle menus (always present, not deletable)
  await prisma.menu.upsert({
    where: { slug: 'aperitifs' },
    update: {},
    create: {
      name: 'Apéritifs',
      slug: 'aperitifs',
      type: 'APEROS',
      description: 'Carte des apéritifs disponibles',
      isPublic: false,
    },
  });

  await prisma.menu.upsert({
    where: { slug: 'digestifs' },
    update: {},
    create: {
      name: 'Digestifs',
      slug: 'digestifs',
      type: 'DIGESTIFS',
      description: 'Carte des digestifs disponibles',
      isPublic: false,
    },
  });

  // Create default site settings
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, siteName: 'Carta Cocktail', siteIcon: '' },
  });

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
