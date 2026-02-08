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

  // Ensure all default units exist (upsert each one)
  const defaultUnits = [
    { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 },
    { name: 'Millilitre', abbreviation: 'ml', conversionFactorToMl: 1 },
    { name: 'Once (US)', abbreviation: 'oz', conversionFactorToMl: 29.5735 },
    { name: 'Pièce', abbreviation: 'pce', conversionFactorToMl: null },
    { name: 'Trait', abbreviation: 'trait', conversionFactorToMl: 0.6 },
    { name: 'Cuillère à café', abbreviation: 'cc', conversionFactorToMl: 5 },
    { name: 'Cuillère à soupe', abbreviation: 'cs', conversionFactorToMl: 15 },
    { name: 'Feuille', abbreviation: 'feuille', conversionFactorToMl: null },
    { name: 'Tranche', abbreviation: 'tranche', conversionFactorToMl: null },
    { name: 'Zeste', abbreviation: 'zeste', conversionFactorToMl: null },
    { name: 'Gramme', abbreviation: 'g', conversionFactorToMl: null },
    { name: 'Goutte', abbreviation: 'goutte', conversionFactorToMl: null },
    { name: 'Rondelle', abbreviation: 'rondelle', conversionFactorToMl: null },
    { name: 'Pincée', abbreviation: 'pincée', conversionFactorToMl: null },
    { name: 'Brin', abbreviation: 'brin', conversionFactorToMl: null },
    { name: 'Branche', abbreviation: 'branche', conversionFactorToMl: null },
    { name: 'Écorce', abbreviation: 'écorce', conversionFactorToMl: null },
  ];
  for (const unit of defaultUnits) {
    const existing = await prisma.unit.findFirst({ where: { abbreviation: unit.abbreviation } });
    if (!existing) {
      await prisma.unit.create({ data: unit });
    }
  }

  // Remove "Dash" unit (duplicate of "Trait")
  const dashUnit = await prisma.unit.findFirst({ where: { abbreviation: 'dash' } });
  if (dashUnit) {
    const usageCount = await prisma.cocktailIngredient.count({ where: { unitId: dashUnit.id } });
    if (usageCount === 0) {
      await prisma.unit.delete({ where: { id: dashUnit.id } });
    }
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
