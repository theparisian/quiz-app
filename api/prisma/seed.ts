import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'anzio@example.com';

  // Create super-admin if not exists
  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  if (!existingAdmin) {
    const admin = await prisma.user.create({
      data: {
        email,
        displayName: 'Anzio',
        role: 'super_admin',
      },
    });
    console.log(`✓ Super-admin created: ${email} (ID: ${admin.id})`);
  } else {
    console.log(`✓ Super-admin already exists: ${email}`);
  }

  // Create demo cinema if not exists
  const demoSlug = 'cinema-demo';
  const existingCinema = await prisma.cinema.findUnique({ where: { slug: demoSlug } });
  if (!existingCinema) {
    const cinema = await prisma.cinema.create({
      data: {
        slug: demoSlug,
        name: 'Cinéma Démo',
        address: '1 rue du Cinéma',
        city: 'Paris',
        postalCode: '75001',
        country: 'FR',
        status: 'trial',
      },
    });

    const screen = await prisma.screen.create({
      data: {
        cinemaId: cinema.id,
        name: 'Salle 1',
        capacity: 150,
      },
    });

    console.log(`✓ Demo cinema created: ${cinema.name} (slug: ${demoSlug})`);
    console.log(`✓ Demo screen created: ${screen.name} (ID: ${screen.id})`);
  } else {
    console.log(`✓ Demo cinema already exists: ${demoSlug}`);
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
