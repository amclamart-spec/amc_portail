const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const payments = await prisma.payment.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { family: { include: { user: true } }, transactions: { orderBy: { createdAt: 'desc' } } },
    });
    console.log('sample payments:');
    payments.forEach((p, idx) => {
      console.log(`${idx + 1}. id=${p.id} status=${p.status} total=${p.totalAmount} familyId=${p.familyId} tx=${p.transactions.length}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
