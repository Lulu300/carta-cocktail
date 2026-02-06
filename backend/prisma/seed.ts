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
        { name: 'Centilitre', abbreviation: 'cl' },
        { name: 'Millilitre', abbreviation: 'ml' },
        { name: 'Pièce', abbreviation: 'pce' },
        { name: 'Trait', abbreviation: 'trait' },
        { name: 'Cuillère à café', abbreviation: 'cc' },
        { name: 'Cuillère à soupe', abbreviation: 'cs' },
        { name: 'Dash', abbreviation: 'dash' },
        { name: 'Feuille', abbreviation: 'feuille' },
        { name: 'Tranche', abbreviation: 'tranche' },
        { name: 'Zeste', abbreviation: 'zeste' },
      ],
    });
  }

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
