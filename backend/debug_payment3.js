const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const familyId = 'd77f7959-c94c-4e7a-9915-fb5f976eed85';
    const payments = await prisma.payment.findMany({
      where: { familyId },
      select: { id: true, status: true, metadata: true, paidAmount: true, totalAmount: true },
    });
    payments.forEach(p => {
      console.log('id', p.id, 'status', p.status, 'paid', p.paidAmount, 'total', p.totalAmount, 'enrollmentIds', JSON.stringify(p.metadata?.enrollmentIds));
    });
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
})();
