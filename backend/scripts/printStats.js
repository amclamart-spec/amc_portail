const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const totalUsers = await prisma.user.count();
    const pendingUsers = await prisma.user.count({ where: { validationStatus: 'PENDING' } });
    const totalFamilies = await prisma.family.count();
    const totalStudents = await prisma.student.count();
    const totalEnrollments = await prisma.enrollment.count();

    const currentYear = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });

    let currentEnrollments = null;
    let currentStudents = null;
    let currentFamilies = null;
    if (currentYear) {
      currentEnrollments = await prisma.enrollment.count({ where: { schoolYearId: currentYear.id } });
      currentStudents = await prisma.student.count({ where: { enrollments: { some: { schoolYearId: currentYear.id } } } });
      currentFamilies = await prisma.family.count({ where: { students: { some: { enrollments: { some: { schoolYearId: currentYear.id } } } } } });
    }

    console.log(JSON.stringify({
      totalUsers,
      pendingUsers,
      totalFamilies,
      totalStudents,
      totalEnrollments,
      currentYear: currentYear ? { id: currentYear.id, label: currentYear.label } : null,
      currentEnrollments,
      currentStudents,
      currentFamilies,
    }, null, 2));
  } catch (e) {
    console.error('Error:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
