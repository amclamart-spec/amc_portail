const { PrismaClient } = require('@prisma/client');
const { POLE_ROLE_TO_NAME } = require('../middleware/poleManagerDelegation');

const prisma = new PrismaClient();

async function listPoleClasses({ role }) {
  const poleName = POLE_ROLE_TO_NAME[role];
  if (!poleName) {
    const error = new Error('Rôle non reconnu comme responsable de pôle');
    error.statusCode = 403;
    throw error;
  }

  const classes = await prisma.class.findMany({
    where: { level: { pole: { name: { equals: poleName, mode: 'insensitive' } } } },
    include: {
      level: { include: { pole: true } },
      teacher: { include: { user: true } },
    },
    orderBy: [{ level: { name: 'asc' } }, { dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  return classes.map((cls) => ({
    id: cls.id,
    dayOfWeek: cls.dayOfWeek,
    startTime: cls.startTime,
    endTime: cls.endTime,
    level: {
      name: cls.level?.name || null,
      pole: cls.level?.pole ? { name: cls.level.pole.name, period: cls.level.pole.period } : null,
    },
    teacherName: cls.teacher ? `${cls.teacher.firstName} ${cls.teacher.lastName}` : null,
  }));
}

module.exports = { listPoleClasses };
