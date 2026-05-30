const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const eid = 'a0bfd4be-d309-4d51-8aac-a54b9ddf2433';
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: eid },
      include: { student: { include: { family: true } } },
    });
    console.log('enrollment:', JSON.stringify(enrollment, null, 2));
    const payments = await prisma.payment.findMany({
      where: { metadata: { path: ['enrollmentIds'], array_contains: [eid] } },
      select: { id: true, status: true, metadata: true },
    });
    console.log('payments for enrollment:', JSON.stringify(payments, null, 2));
    const familyPayments = await prisma.payment.findMany({
      where: { familyId: enrollment.student.familyId },
      select: { id: true, status: true, paidAmount: true, totalAmount: true, metadata: true },
    });
    console.log('payments for family:', JSON.stringify(familyPayments, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
})();
