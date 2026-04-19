const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getTeacherDashboard(req, res) {
  try {
    const teacherProfile = await prisma.teacher.findUnique({ where: { userId: req.user.id } });
    if (!teacherProfile) {
      return res.json({ classes: [], summary: { totalClasses: 0, totalStudents: 0 } });
    }

    const classes = await prisma.class.findMany({
      where: { teacherId: teacherProfile.id },
      include: {
        level: { include: { pole: true } },
        schoolYear: true,
        roomRef: true,
        enrollments: {
          where: { status: { in: ['PENDING', 'CONFIRMED'] } },
          include: { student: true },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    const totalStudents = classes.reduce((sum, c) => sum + c.enrollments.length, 0);

    res.json({
      classes,
      summary: {
        totalClasses: classes.length,
        totalStudents,
      },
    });
  } catch (error) {
    console.error('Erreur getTeacherDashboard:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getTeacherClasses(req, res) {
  try {
    const teacherProfile = await prisma.teacher.findUnique({ where: { userId: req.user.id } });
    if (!teacherProfile) {
      return res.json({ classes: [] });
    }

    const classes = await prisma.class.findMany({
      where: { teacherId: teacherProfile.id },
      include: {
        level: { include: { pole: true } },
        schoolYear: true,
        roomRef: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    res.json({ classes });
  } catch (error) {
    console.error('Erreur getTeacherClasses:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getTeacherDashboard,
  getTeacherClasses,
};
