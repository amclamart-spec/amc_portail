const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const regs = ['FAM-2025-196', 'FAM-2025-197'];
    const enrollments = await prisma.enrollment.findMany({
      where: { registrationCode: { in: regs } },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, familyId: true } },
        class: { include: { level: { include: { pole: true } }, schoolYear: true } },
      },
    });
    console.log('enrollments count:', enrollments.length);
    enrollments.forEach((e) => {
      console.log('enrollment', e.id, e.registrationCode, 'student', e.student.firstName, e.student.lastName, 'familyId', e.student.familyId, 'class', e.class?.id, e.class?.level?.pole?.name, e.class?.level?.code);
    });
    const familyIds = [...new Set(enrollments.map((e) => e.student.familyId))];
    console.log('familyIds', familyIds);
    if (familyIds.length > 0) {
      const payments = await prisma.payment.findMany({
        where: { familyId: { in: familyIds }, schoolYearId: enrollments[0]?.schoolYearId },
      });
      console.log('payments count', payments.length);
      payments.forEach((p) => {
        console.log('payment', p.id, p.status, p.totalAmount, 'metadata:', p.metadata ? JSON.stringify(p.metadata).slice(0, 200) : null);
      });
    }
    const payment = await prisma.payment.findFirst({
      where: {
        metadata: {
          path: ['enrollmentIds'],
          array_contains: [enrollments[0]?.id],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log('payment by metadata include first', payment?.id || null);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
})();
