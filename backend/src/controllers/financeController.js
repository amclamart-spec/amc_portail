const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function sumAmount(items, field = 'amount') {
  return items.reduce((acc, item) => acc + Number(item[field] || 0), 0);
}

async function getFinancialDashboard(req, res) {
  try {
    const schoolYear = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });

    const [payments, entries, categories] = await Promise.all([
      prisma.payment.findMany({ where: schoolYear ? { schoolYearId: schoolYear.id } : {} }),
      prisma.financialEntry.findMany({
        include: { category: true },
        orderBy: { entryDate: 'desc' },
      }),
      prisma.financialCategory.findMany({ orderBy: { name: 'asc' } }),
    ]);

    const budgetTotal = sumAmount(payments, 'totalAmount');
    const paidTotal = sumAmount(payments, 'paidAmount');
    const collectionRate = budgetTotal > 0 ? (paidTotal / budgetTotal) * 100 : 0;

    const incomes = entries.filter((e) => e.entryType === 'INCOME');
    const expenses = entries.filter((e) => e.entryType === 'EXPENSE');

    const incomeByCategory = incomes.reduce((acc, e) => {
      const key = e.category.name;
      acc[key] = (acc[key] || 0) + Number(e.amount);
      return acc;
    }, {});

    const expenseByCategory = expenses.reduce((acc, e) => {
      const key = e.category.name;
      acc[key] = (acc[key] || 0) + Number(e.amount);
      return acc;
    }, {});

    const totalIncome = sumAmount(incomes);
    const totalExpense = sumAmount(expenses);
    const cashBalance = totalIncome - totalExpense;

    res.json({
      kpi: {
        budgetTotal,
        paidTotal,
        collectionRate,
        totalIncome,
        totalExpense,
        cashBalance,
      },
      charts: {
        incomeByCategory,
        expenseByCategory,
      },
      recentEntries: entries.slice(0, 30),
      categories,
    });
  } catch (error) {
    console.error('Erreur getFinancialDashboard:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createFinancialEntry(req, res) {
  try {
    const { categoryId, amount, entryType, description, entryDate, paymentId } = req.body;

    const entry = await prisma.financialEntry.create({
      data: {
        categoryId,
        amount,
        entryType,
        description,
        entryDate: entryDate ? new Date(entryDate) : new Date(),
        paymentId: paymentId || null,
      },
      include: { category: true },
    });

    res.status(201).json({ entry });
  } catch (error) {
    console.error('Erreur createFinancialEntry:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createCategory(req, res) {
  try {
    const { name, type, description } = req.body;
    const category = await prisma.financialCategory.create({
      data: { name, type, description },
    });
    res.status(201).json({ category });
  } catch (error) {
    console.error('Erreur createCategory:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getFinancialDashboard,
  createFinancialEntry,
  createCategory,
};
