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

  // Seed default CategoryTypes
  const defaultCategoryTypes = [
    { name: 'SPIRIT', nameTranslations: JSON.stringify({ fr: 'Alcool', en: 'Spirit' }), color: 'blue' },
    { name: 'SYRUP', nameTranslations: JSON.stringify({ fr: 'Sirop', en: 'Syrup' }), color: 'purple' },
    { name: 'SOFT', nameTranslations: JSON.stringify({ fr: 'Sans alcool', en: 'Non-alcoholic' }), color: 'green' },
  ];
  for (const ct of defaultCategoryTypes) {
    await prisma.categoryType.upsert({
      where: { name: ct.name },
      update: {},
      create: ct,
    });
  }
  // Sync: auto-create CategoryType for any existing custom types in categories
  const existingCatTypes = await prisma.category.findMany({
    select: { type: true },
    distinct: ['type'],
  });
  for (const { type } of existingCatTypes) {
    await prisma.categoryType.upsert({
      where: { name: type },
      update: {},
      create: { name: type, color: 'gray' },
    });
  }

  // Ensure all default units exist (upsert each one)
  const defaultUnits = [
    { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10,
      nameTranslations: JSON.stringify({ fr: 'Centilitre', en: 'Centiliter' }) },
    { name: 'Millilitre', abbreviation: 'ml', conversionFactorToMl: 1,
      nameTranslations: JSON.stringify({ fr: 'Millilitre', en: 'Milliliter' }) },
    { name: 'Once (US)', abbreviation: 'oz', conversionFactorToMl: 29.5735,
      nameTranslations: JSON.stringify({ fr: 'Once (US)', en: 'Ounce (US)' }) },
    { name: 'Pièce', abbreviation: 'pce', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Pièce', en: 'Piece' }) },
    { name: 'Trait', abbreviation: 'trait', conversionFactorToMl: 0.6,
      nameTranslations: JSON.stringify({ fr: 'Trait', en: 'Dash' }) },
    { name: 'Cuillère à café', abbreviation: 'cc', conversionFactorToMl: 5,
      nameTranslations: JSON.stringify({ fr: 'Cuillère à café', en: 'Teaspoon' }) },
    { name: 'Cuillère à soupe', abbreviation: 'cs', conversionFactorToMl: 15,
      nameTranslations: JSON.stringify({ fr: 'Cuillère à soupe', en: 'Tablespoon' }) },
    { name: 'Feuille', abbreviation: 'feuille', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Feuille', en: 'Leaf' }) },
    { name: 'Tranche', abbreviation: 'tranche', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Tranche', en: 'Slice' }) },
    { name: 'Zeste', abbreviation: 'zeste', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Zeste', en: 'Zest' }) },
    { name: 'Gramme', abbreviation: 'g', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Gramme', en: 'Gram' }) },
    { name: 'Goutte', abbreviation: 'goutte', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Goutte', en: 'Drop' }) },
    { name: 'Rondelle', abbreviation: 'rondelle', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Rondelle', en: 'Wheel' }) },
    { name: 'Pincée', abbreviation: 'pincée', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Pincée', en: 'Pinch' }) },
    { name: 'Brin', abbreviation: 'brin', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Brin', en: 'Sprig' }) },
    { name: 'Branche', abbreviation: 'branche', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Branche', en: 'Branch' }) },
    { name: 'Écorce', abbreviation: 'écorce', conversionFactorToMl: null,
      nameTranslations: JSON.stringify({ fr: 'Écorce', en: 'Peel' }) },
    { name: 'Tasse', abbreviation: 'tasse', conversionFactorToMl: 250,
      nameTranslations: JSON.stringify({ fr: 'Tasse', en: 'Cup' }) },
  ];
  for (const unit of defaultUnits) {
    const existing = await prisma.unit.findFirst({ where: { abbreviation: unit.abbreviation } });
    if (!existing) {
      await prisma.unit.create({ data: unit });
    } else if (!existing.nameTranslations) {
      // Update existing units with translations if they don't have them
      await prisma.unit.update({
        where: { id: existing.id },
        data: { nameTranslations: unit.nameTranslations },
      });
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
