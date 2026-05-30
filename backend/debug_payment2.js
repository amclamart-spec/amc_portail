const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const paymentWithEnrollments = await prisma.payment.findFirst({
      where: { metadata: { path: ['enrollmentIds'], array_contains: [] } },
      select: { id: true, status: true, metadata: true },
    });
    console.log('sample payment with enrollmentIds', JSON.stringify(paymentWithEnrollments, null, 2));
    if (paymentWithEnrollments?.metadata?.enrollmentIds?.length) {
      const eid = paymentWithEnrollments.metadata.enrollmentIds[0];
      const payments = await prisma.payment.findMany({
        where: { metadata: { path: ['enrollmentIds'], array_contains: [eid] } },
        select: { id: true, status: true, metadata: true },
      });
      console.log('query with actual enrollmentId', eid, 'count', payments.length, JSON.stringify(payments, null, 2));
    }
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
})();
