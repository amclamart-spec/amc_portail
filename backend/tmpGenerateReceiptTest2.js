const { PrismaClient } = require('@prisma/client');
const { generateInvoicePDF } = require('./src/utils/invoiceUtils');

async function run() {
  const prisma = new PrismaClient();
  try {
    const payment = await prisma.payment.findFirst({
      include: {
        family: { include: { user: true } },
        schoolYear: true,
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!payment) {
      console.log('NO_PAYMENT');
      return;
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        student: { familyId: payment.familyId },
        schoolYearId: payment.schoolYearId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        class: {
          include: {
            level: { include: { pole: true } },
            schoolYear: true,
          },
        },
        student: true,
      },
    });

    console.log('using payment', payment.id, 'enrollments', enrollments.length);
    const result = await generateInvoicePDF(payment, { ...payment.family, children: [] }, enrollments);
    console.log('generated', result);
  } catch (err) {
    console.error('ERROR', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
