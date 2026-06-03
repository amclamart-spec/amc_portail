const { PrismaClient } = require('@prisma/client');

async function run() {
  const prisma = new PrismaClient();
  try {
    const payment = await prisma.payment.findFirst({
      where: {},
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
        family: { include: { user: true } },
      },
    });

    if (!payment) {
      console.log('NO_PAYMENT');
      return;
    }

    console.log('paymentId:', payment.id);
    console.log('paymentMethod:', payment.paymentMethod);
    console.log('provider:', payment.provider);
    console.log('transactions:', payment.transactions.length);
    console.log('familyUserId:', payment.family?.userId || 'no family');
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
