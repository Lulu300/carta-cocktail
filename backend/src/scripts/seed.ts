// The seed runs on its own: `npm run db:seed` in development, `node dist/scripts/seed.js`
// in the Docker image. The shared client also loads backend/.env
import { prisma } from '../lib/prisma';
import { ensureAdmin } from '../bootstrap/ensureAdmin';
import { ensureDefaultUnits } from '../bootstrap/defaultUnits';

async function main() {
  await ensureAdmin(prisma);

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

  await ensureDefaultUnits(prisma);

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
