const { PrismaClient } = require('@prisma/client');
const { buildEnrollmentTableRows } = require('./src/utils/invoiceUtils');

(async () => {
  const prisma = new PrismaClient();
  try {
    const paymentId = '32ccda6a-7f39-4fdf-9d0a-166e1f90087c';
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      console.error('payment not found');
      return;
    }
    const enrollments = await prisma.enrollment.findMany({
      where: {
        student: { familyId: payment.familyId },
        schoolYearId: payment.schoolYearId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        student: true,
        class: { include: { level: { include: { pole: true } }, schoolYear: true } },
      },
    });
    console.log('enrollments count', enrollments.length);
    enrollments.forEach((e) => console.log('enroll', e.id, e.registrationCode, e.student?.firstName, e.student?.lastName, e.class?.level?.pole?.name, e.class?.level?.code));
    const rows = await buildEnrollmentTableRows(enrollments, payment);
    console.log('row count', rows.length);
    rows.forEach((r, idx) => {
      console.log(idx + 1, r.childName, r.courseLabel, r.levelLabel, r.amount, r.poleName, r.poleId, r.levelId);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
})();
