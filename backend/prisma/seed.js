const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function upsertUser(email, firstName, lastName, role) {
  const passwordHash = await bcrypt.hash('Admin2025!', 12);
  return prisma.user.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      role,
      validationStatus: 'APPROVED',
      emailVerified: true,
    },
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

async function upsertTeacherFromUser(user, civility = 'M', specialties = []) {
  return prisma.teacher.upsert({
    where: { userId: user.id },
    update: {
      civility,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      specialties,
      status: 'ACTIVE',
    },
    create: {
      userId: user.id,
      civility,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      specialties,
      status: 'ACTIVE',
    },
  });
}

async function main() {
  console.log('🌱 Seeding AMC Pédagogie...');

  await upsertUser('superadmin@musulmansdeclamart.fr', 'Super', 'Admin', 'SUPER_ADMIN');
  await upsertUser('admin@musulmansdeclamart.fr', 'Admin', 'AMC', 'ADMIN');
  await upsertUser('tresorier@musulmansdeclamart.fr', 'Tresorier', 'AMC', 'TRESORIER');
  const professorUser = await upsertUser('professeur@musulmansdeclamart.fr', 'Professeur', 'AMC', 'PROFESSEUR');

  const teacherProfile = await upsertTeacherFromUser(professorUser, 'M', ['Arabe', 'Coran']);

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
    where: { name: 'Arabe' },
    update: { sortOrder: 1 },
    create: { name: 'Arabe', description: 'Enseignement Arabe', sortOrder: 1 },
  });
  await prisma.pole.upsert({
    where: { name: 'Coran' },
    update: { sortOrder: 2 },
    create: { name: 'Coran', description: 'Enseignement Quran', sortOrder: 2 },
  });
  await prisma.pole.upsert({
    where: { name: 'Sciences islamiques' },
    update: { sortOrder: 3 },
    create: { name: 'Sciences islamiques', description: 'Éducation islamique', sortOrder: 3 },
  });

  const niv1 = await prisma.level.upsert({
    where: { poleId_code: { poleId: poleArabe.id, code: 'NIV1' } },
    update: { name: 'Niveau 1', sortOrder: 1 },
    create: { poleId: poleArabe.id, code: 'NIV1', name: 'Niveau 1', sortOrder: 1 },
  });

  const roomA = await prisma.room.upsert({
    where: { name: 'Salle A1' },
    update: { capacity: 20, status: 'ACTIVE' },
    create: {
      name: 'Salle A1',
      capacity: 20,
      equipments: ['Tableau blanc'],
      location: 'Bâtiment principal',
      status: 'ACTIVE',
    },
  });

  const slot = await prisma.timeSlot.upsert({
    where: { id: 'seed-slot-samedi-1000' },
    update: {
      dayOfWeek: 'SAMEDI',
      startTime: '10:00',
      endTime: '11:30',
      roomId: roomA.id,
      recurring: true,
    },
    create: {
      id: 'seed-slot-samedi-1000',
      dayOfWeek: 'SAMEDI',
      startTime: '10:00',
      endTime: '11:30',
      roomId: roomA.id,
      recurring: true,
    },
  });

  const existingClass = await prisma.class.findFirst({ where: { levelId: niv1.id, schoolYearId: year.id } });
  if (!existingClass) {
    await prisma.class.create({
      data: {
        schoolYearId: year.id,
        poleId: poleArabe.id,
        levelId: niv1.id,
        timeSlotId: slot.id,
        roomId: roomA.id,
        teacherId: teacherProfile.id,
        teacherUserId: professorUser.id,
        teacherName: `${professorUser.firstName} ${professorUser.lastName}`,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: roomA.name,
        capacity: 20,
      },
    });
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
