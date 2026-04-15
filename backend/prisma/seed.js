const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function upsertUser(email, firstName, lastName, role) {
  const passwordHash = await bcrypt.hash('Admin2025!', 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      firstName,
      lastName,
      role,
      validationStatus: 'APPROVED',
      emailVerified: true,
    },
  });
}

async function main() {
  console.log('🌱 Seeding AMC Phase 2...');

  await upsertUser('superadmin@musulmansdeclamart.fr', 'Super', 'Admin', 'SUPER_ADMIN');
  await upsertUser('admin@musulmansdeclamart.fr', 'Admin', 'AMC', 'ADMIN');
  await upsertUser('tresorier@musulmansdeclamart.fr', 'Tresorier', 'AMC', 'TRESORIER');
  await upsertUser('professeur@musulmansdeclamart.fr', 'Professeur', 'AMC', 'PROFESSEUR');

  const year = await prisma.schoolYear.upsert({
    where: { label: '2025-2026' },
    update: { isCurrent: true },
    create: {
      label: '2025-2026',
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-06-30'),
      isCurrent: true,
    },
  });

  await prisma.financialCategory.upsert({
    where: { name: 'Paiements cotisations' },
    update: {},
    create: { name: 'Paiements cotisations', type: 'INCOME', isSystem: true },
  });
  await prisma.financialCategory.upsert({
    where: { name: 'Remboursements' },
    update: {},
    create: { name: 'Remboursements', type: 'EXPENSE', isSystem: true },
  });

  const poleArabe = await prisma.pole.upsert({
    where: { name: "Cours d'Arabe" },
    update: {},
    create: { name: "Cours d'Arabe", description: '8 niveaux progressifs', sortOrder: 1 },
  });

  await prisma.level.upsert({
    where: { poleId_code: { poleId: poleArabe.id, code: 'NIV1' } },
    update: {},
    create: { poleId: poleArabe.id, code: 'NIV1', name: 'Niveau 1', sortOrder: 1 },
  });

  const niv1 = await prisma.level.findFirst({ where: { code: 'NIV1' } });
  const prof = await prisma.user.findUnique({ where: { email: 'professeur@musulmansdeclamart.fr' } });

  if (niv1 && prof) {
    const existing = await prisma.class.findFirst({ where: { levelId: niv1.id, schoolYearId: year.id } });
    if (!existing) {
      await prisma.class.create({
        data: {
          schoolYearId: year.id,
          levelId: niv1.id,
          dayOfWeek: 'Samedi',
          startTime: '10:00',
          endTime: '11:30',
          room: 'A1',
          teacherName: 'Professeur AMC',
          teacherUserId: prof.id,
          capacity: 20,
        },
      });
    }
  }

  console.log('✅ Seed terminé. Utilisez Admin2025! pour les comptes créés.');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
