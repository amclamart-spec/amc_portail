const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.payment.count();
    console.log('payments count:', count);

    const id = '47ac9567-644d-42e4-b956-571485842007';
    const payment = await prisma.payment.findUnique({ where: { id } });
    console.log('payment found by exact id:', Boolean(payment));
    if (payment) {
      console.log('payment.date:', payment.createdAt, 'totalAmount:', payment.totalAmount);
    }

    const prefix = id.slice(0, 8);
    const similar = await prisma.payment.findMany({
      where: { id: { contains: prefix } },
      take: 5,
    });
    console.log('similar ids found:', similar.map((p) => p.id));
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
