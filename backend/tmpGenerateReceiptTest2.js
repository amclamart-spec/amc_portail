const { PrismaClient } = require('@prisma/client');
const { generateInvoicePDF } = require('./src/utils/invoiceUtils');

async function run() {
  const prisma = new PrismaClient();
  try {
    const registrationCode = 'FAM-2025-242';

    const enrollment = await prisma.enrollment.findUnique({
      where: { registrationCode },
      include: {
        student: true,
        class: { include: { level: { include: { pole: true } }, schoolYear: true } },
      },
    });

    if (!enrollment) {
      console.log('ENROLLMENT_NOT_FOUND', registrationCode);
      return;
    }

    const familyId = enrollment.student.familyId;
    const schoolYearId = enrollment.schoolYearId;

    const family = await prisma.family.findUnique({
      where: { id: familyId },
      include: { user: true },
    });

    const children = await prisma.student.findMany({
      where: { familyId },
      select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const familyPayments = await prisma.payment.findMany({
      where: {
        familyId,
        schoolYearId,
        status: { not: 'CANCELLED' },
      },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
        paymentPlan: true,
        installments: { orderBy: { dueDate: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const activeEnrollments = await prisma.enrollment.findMany({
      where: {
        student: { familyId },
        schoolYearId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        class: {
          include: {
            level: { include: { pole: true } },
          },
        },
        student: true,
      },
    });

    const aggregateTransactions = familyPayments
      .flatMap((currentPayment) => {
        const paymentMetadata = {
          ...((currentPayment.metadata && typeof currentPayment.metadata === 'object') ? currentPayment.metadata : {}),
          ...((currentPayment.paymentPlan?.metadata && typeof currentPayment.paymentPlan.metadata === 'object') ? currentPayment.paymentPlan.metadata : {}),
        };
        const installments = Array.isArray(currentPayment.installments) ? currentPayment.installments : [];
        const firstInstallment = installments.length > 0 ? installments[0] : null;
        const paymentMethod = currentPayment.paymentMethod || paymentMetadata.paymentMethod || paymentMetadata.paymentPlanType || currentPayment.paymentPlan?.type;
        const paymentInstallmentsCount = Number(
          currentPayment.numberOfInstallments
          || currentPayment.paymentPlan?.installmentsCount
          || paymentMetadata.numberOfInstallments
          || paymentMetadata.bankDebitInstallmentsCount
          || paymentMetadata.chequeInstallmentsCount
          || paymentMetadata.chequeCount
          || installments.length
          || 0
        ) || 0;

        return (Array.isArray(currentPayment.transactions) ? currentPayment.transactions : []).map((transaction) => {
          const transactionMetadata = transaction.metadata && typeof transaction.metadata === 'object' ? transaction.metadata : {};
          return {
            ...transaction,
            paymentMethod,
            paymentMetadata,
            paymentInstallmentsCount,
            scheduleDay: currentPayment.paymentPlan?.scheduleDay || paymentMetadata.bankDebitDay || paymentMetadata.chequeDepositDay || null,
            firstPaymentDate: paymentMetadata.firstPaymentDate || paymentMetadata.chequeFirstPaymentDate || firstInstallment?.dueDate || null,
            metadata: {
              ...paymentMetadata,
              ...transactionMetadata,
            },
            method: transaction.method || paymentMethod,
          };
        });
      })
      .filter((transaction) => String(transaction.status || '').toUpperCase() !== 'CANCELLED')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log('registrationCode:', registrationCode);
    console.log('familyPayments:', familyPayments.length, 'transactions:', aggregateTransactions.length);

    aggregateTransactions.forEach((tx, idx) => {
      console.log(`tx#${idx + 1}`, {
        id: tx.id,
        method: tx.method,
        paymentMethod: tx.paymentMethod,
        scheduleDay: tx.scheduleDay,
        firstPaymentDate: tx.firstPaymentDate,
        paymentInstallmentsCount: tx.paymentInstallmentsCount,
        bankDebitDay: tx.metadata?.bankDebitDay,
        chequeDepositDay: tx.metadata?.chequeDepositDay,
        firstPaymentDateMeta: tx.metadata?.firstPaymentDate,
        chequeFirstPaymentDateMeta: tx.metadata?.chequeFirstPaymentDate,
        bankDebitIban: tx.metadata?.bankDebitIban,
        bankDebitSwift: tx.metadata?.bankDebitSwift,
      });
    });

    const totalAmount = aggregateTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || transaction.total || 0), 0);

    const aggregatePayment = {
      id: `famille-${familyId}-${schoolYearId}`,
      createdAt: familyPayments[0]?.createdAt || new Date(),
      paymentMethod: familyPayments[0]?.paymentMethod || null,
      metadata: {
        payerName: `${family?.user?.firstName || ''} ${family?.user?.lastName || ''}`.trim(),
      },
      numberOfInstallments: familyPayments.reduce((sum, currentPayment) => sum + Number(currentPayment.numberOfInstallments || 0), 0),
      totalAmount,
      paidAmount: familyPayments.reduce((sum, currentPayment) => sum + Number(currentPayment.paidAmount || 0), 0),
      registrationFee: familyPayments.reduce((sum, currentPayment) => sum + Number(currentPayment.registrationFee || 0), 0),
      arabicFee: familyPayments.reduce((sum, currentPayment) => sum + Number(currentPayment.arabicFee || 0), 0),
      coranScienceFee: familyPayments.reduce((sum, currentPayment) => sum + Number(currentPayment.coranScienceFee || 0), 0),
      transactions: aggregateTransactions,
    };

    const invoiceResult = await generateInvoicePDF(aggregatePayment, { ...family, children }, activeEnrollments, aggregateTransactions);
    console.log('invoiceResult:', invoiceResult);
  } catch (err) {
    console.error('ERROR', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();