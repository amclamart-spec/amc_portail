const { PrismaClient } = require('@prisma/client');
const { generateInvoicePDF } = require('./src/utils/invoiceUtils');

(async () => {
  const prisma = new PrismaClient();
  try {
    const paymentId = 'f11255e6-e0e4-4280-9363-09f212127895';
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        family: { include: { user: true } },
        schoolYear: true,
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });

    console.log('payment found:', Boolean(payment));
    if (!payment) {
      return;
    }

    const children = await prisma.student.findMany({
      where: { familyId: payment.familyId },
      select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const familyWithChildren = { ...payment.family, children };

    let enrollmentIds = Array.isArray(payment.metadata?.enrollmentIds) ? payment.metadata.enrollmentIds : [];
    if (!enrollmentIds || enrollmentIds.length === 0) {
      const fallbackEnrollments = await prisma.enrollment.findMany({
        where: {
          familyId: payment.familyId,
          schoolYearId: payment.schoolYearId,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      });
      enrollmentIds = fallbackEnrollments.map((e) => e.id);
    }

    const enrolledCourses = await prisma.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      include: {
        class: {
          include: {
            level: { include: { pole: true } },
            schoolYear: true,
          },
        },
      },
    });

    console.log('enrollments:', enrolledCourses.length);

    const invoiceResult = await generateInvoicePDF(payment, familyWithChildren, enrolledCourses);
    console.log('invoiceResult:', invoiceResult);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
