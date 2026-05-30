const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        metadata: { path: ['enrollmentIds'], array_contains: ['dummy'] },
      },
      select: { id: true, status: true, metadata: true },
    });
    console.log('dummy query ok, count', payments.length);
    const some = await prisma.payment.findMany({
      take: 5,
      select: { id: true, status: true, metadata: true },
    });
    console.log(JSON.stringify(some, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
})();
