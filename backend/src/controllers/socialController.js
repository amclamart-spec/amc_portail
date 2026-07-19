const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDecimal(v) { return new Prisma.Decimal(v); }

function fmtCase(c) {
  return {
    id: c.id,
    status: c.status,
    autoDecision: c.autoDecision,
    autoScore: c.autoScore,
    observations: c.observations,
    processedAt: c.processedAt,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    createdBy: c.createdBy,
    beneficiary: c.beneficiary || null,
    creator: c.creator ? { id: c.creator.id, firstName: c.creator.firstName, lastName: c.creator.lastName } : null,
    processor: c.processor ? { id: c.processor.id, firstName: c.processor.firstName, lastName: c.processor.lastName } : null,
    decisions: c.decisions || [],
  };
}

// ─── eligibility evaluation ───────────────────────────────────────────────────

async function evaluateEligibility(beneficiaryData) {
  const criteria = await prisma.eligibilityCriteria.findMany({ where: { isActive: true } });
  const results = [];
  let passCount = 0;

  for (const cr of criteria) {
    const { type, operator, numValue } = cr;
    let value = null;
    if (type === 'MONTHLY_INCOME') value = Number(beneficiaryData.monthlyIncome || 0);
    else if (type === 'ADULTS_COUNT') value = Number(beneficiaryData.adultsCount || 1);
    else if (type === 'CHILDREN_COUNT') value = Number(beneficiaryData.childrenCount || 0);
    else { results.push({ key: cr.key, label: cr.label, passed: true, reason: 'Critère non évalué' }); passCount++; continue; }

    const threshold = Number(numValue || 0);
    let passed = false;
    if (operator === 'LTE') passed = value <= threshold;
    else if (operator === 'GTE') passed = value >= threshold;
    else if (operator === 'EQ')  passed = value === threshold;
    else if (operator === 'GT')  passed = value > threshold;
    else if (operator === 'LT')  passed = value < threshold;

    if (passed) passCount++;
    results.push({ key: cr.key, label: cr.label, passed, value, threshold, operator });
  }

  const autoDecision = criteria.length === 0
    ? 'ACCEPTED'
    : (passCount === criteria.length ? 'ACCEPTED' : 'REFUSED');

  return { autoDecision, score: { passCount, total: criteria.length, results } };
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

async function getDashboard(req, res) {
  try {
    const [
      pendingCases,
      acceptedCases,
      refusedCases,
      activeBeneficiaries,
      recentDistributions,
      recentCollections,
      lowStockProducts,
      productsByCategory,
    ] = await Promise.all([
      prisma.socialCase.count({ where: { status: 'SUBMITTED' } }),
      prisma.socialCase.count({ where: { status: 'ACCEPTED' } }),
      prisma.socialCase.count({ where: { status: 'REFUSED' } }),
      prisma.socialBeneficiary.count(),
      prisma.distribution.findMany({
        where: { status: 'VALIDATED' },
        orderBy: { distributedAt: 'desc' },
        take: 5,
        include: { beneficiary: { select: { firstName: true, lastName: true } }, lines: { include: { product: { select: { name: true } } } } },
      }),
      prisma.socialCollection.findMany({
        orderBy: { collectedAt: 'desc' },
        take: 5,
        include: { lines: { include: { product: { select: { name: true } } } } },
      }),
      prisma.socialProduct.findMany({
        where: { isActive: true, stockQty: { lte: prisma.socialProduct.fields.alertThreshold } },
        include: { category: true },
        take: 10,
      }),
      prisma.socialProductCategory.findMany({
        where: { isActive: true },
        include: { products: { where: { isActive: true }, select: { name: true, stockQty: true, unit: true, alertThreshold: true } } },
      }),
    ]);

    // low stock — compare stockQty <= alertThreshold
    const lowStock = await prisma.$queryRaw`
      SELECT sp.id, sp.name, sp.unit, sp.stock_qty as "stockQty", sp.alert_threshold as "alertThreshold",
             spc.name as "categoryName"
      FROM social_products sp
      JOIN social_product_categories spc ON spc.id = sp.category_id
      WHERE sp.is_active = true AND sp.stock_qty <= sp.alert_threshold
      ORDER BY sp.stock_qty ASC
      LIMIT 10
    `;

    const result = {
      cases: { pending: pendingCases, accepted: acceptedCases, refused: refusedCases },
      activeBeneficiaries,
      recentDistributions,
      recentCollections,
      lowStock,
      productsByCategory,
    };

    // Budget only for RESPONSABLE_POLE_SOCIAL
    const { PERMISSIONS, hasPermission } = require('../config/permissions');
    if (hasPermission(req.user.role, PERMISSIONS.SOCIAL_BUDGET)) {
      const currentYear = new Date().getFullYear();
      const budget = await prisma.socialBudget.findUnique({ where: { year: currentYear } });
      if (budget) {
        const consumed = await prisma.purchase.aggregate({
          where: { status: 'VALIDATED', budgetId: budget.id },
          _sum: { totalAmount: true },
        });
        result.budget = {
          year: currentYear,
          total: Number(budget.totalAmount),
          consumed: Number(consumed._sum.totalAmount || 0),
          remaining: Number(budget.totalAmount) - Number(consumed._sum.totalAmount || 0),
        };
      }
    }

    return res.json(result);
  } catch (error) {
    console.error('Erreur getDashboard social:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── BÉNÉFICIAIRES ────────────────────────────────────────────────────────────

async function getBeneficiaries(req, res) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = search ? {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { email:     { contains: search, mode: 'insensitive' } },
        { phone:     { contains: search, mode: 'insensitive' } },
      ],
    } : {};
    const [total, beneficiaries] = await Promise.all([
      prisma.socialBeneficiary.count({ where }),
      prisma.socialBeneficiary.findMany({
        where, skip, take: Number(limit),
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          cases: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, createdAt: true } },
          _count: { select: { distributions: { where: { status: 'VALIDATED' } } } },
        },
      }),
    ]);
    return res.json({ beneficiaries, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    console.error('Erreur getBeneficiaries:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getBeneficiary(req, res) {
  try {
    const { id } = req.params;
    const b = await prisma.socialBeneficiary.findUnique({
      where: { id },
      include: {
        cases: { orderBy: { createdAt: 'desc' }, include: { decisions: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, firstName: true, lastName: true } } } } } },
        distributions: { where: { status: 'VALIDATED' }, orderBy: { distributedAt: 'desc' }, take: 10, include: { lines: { include: { product: { select: { id: true, name: true, unit: true } } } } } },
      },
    });
    if (!b) return res.status(404).json({ error: 'Bénéficiaire introuvable' });
    return res.json({ beneficiary: b });
  } catch (error) {
    console.error('Erreur getBeneficiary:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createBeneficiary(req, res) {
  try {
    const { firstName, lastName, email, phone, addressLine1, postalCode, city, adultsCount = 1, childrenCount = 0, monthlyIncome, observations } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Prénom et nom sont requis' });
    const b = await prisma.socialBeneficiary.create({
      data: { firstName, lastName, email, phone, addressLine1, postalCode, city, adultsCount: Number(adultsCount), childrenCount: Number(childrenCount), monthlyIncome: monthlyIncome != null ? toDecimal(monthlyIncome) : null, observations, createdBy: req.user.id },
    });
    return res.status(201).json({ beneficiary: b });
  } catch (error) {
    console.error('Erreur createBeneficiary:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateBeneficiary(req, res) {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, addressLine1, postalCode, city, adultsCount, childrenCount, monthlyIncome, observations } = req.body;
    const b = await prisma.socialBeneficiary.update({
      where: { id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName  !== undefined && { lastName }),
        ...(email     !== undefined && { email }),
        ...(phone     !== undefined && { phone }),
        ...(addressLine1 !== undefined && { addressLine1 }),
        ...(postalCode   !== undefined && { postalCode }),
        ...(city         !== undefined && { city }),
        ...(adultsCount  !== undefined && { adultsCount: Number(adultsCount) }),
        ...(childrenCount !== undefined && { childrenCount: Number(childrenCount) }),
        ...(monthlyIncome !== undefined && { monthlyIncome: monthlyIncome != null ? toDecimal(monthlyIncome) : null }),
        ...(observations  !== undefined && { observations }),
      },
    });
    return res.json({ beneficiary: b });
  } catch (error) {
    console.error('Erreur updateBeneficiary:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── DOSSIERS ────────────────────────────────────────────────────────────────

async function getCases(req, res) {
  try {
    const { status, beneficiaryId, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};
    if (status) where.status = status;
    if (beneficiaryId) where.beneficiaryId = beneficiaryId;
    const [total, cases] = await Promise.all([
      prisma.socialCase.count({ where }),
      prisma.socialCase.findMany({
        where, skip, take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          beneficiary: { select: { id: true, firstName: true, lastName: true, adultsCount: true, childrenCount: true, monthlyIncome: true } },
          creator: { select: { id: true, firstName: true, lastName: true } },
          processor: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { decisions: true } },
        },
      }),
    ]);
    return res.json({ cases, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    console.error('Erreur getCases:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getCase(req, res) {
  try {
    const { id } = req.params;
    const c = await prisma.socialCase.findUnique({
      where: { id },
      include: {
        beneficiary: true,
        creator:   { select: { id: true, firstName: true, lastName: true } },
        processor: { select: { id: true, firstName: true, lastName: true } },
        decisions: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!c) return res.status(404).json({ error: 'Dossier introuvable' });
    return res.json({ case: fmtCase(c) });
  } catch (error) {
    console.error('Erreur getCase:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createCase(req, res) {
  try {
    const { beneficiaryId, observations, expiresAt } = req.body;
    if (!beneficiaryId) return res.status(400).json({ error: 'beneficiaryId est requis' });
    const beneficiary = await prisma.socialBeneficiary.findUnique({ where: { id: beneficiaryId } });
    if (!beneficiary) return res.status(404).json({ error: 'Bénéficiaire introuvable' });

    const { autoDecision, score } = await evaluateEligibility(beneficiary);
    const c = await prisma.socialCase.create({
      data: { beneficiaryId, status: 'DRAFT', autoDecision, autoScore: score, observations, createdBy: req.user.id, expiresAt: expiresAt ? new Date(expiresAt) : null },
    });
    return res.status(201).json({ case: c });
  } catch (error) {
    console.error('Erreur createCase:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateCaseStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const VALID = ['DRAFT', 'SUBMITTED', 'ACCEPTED', 'REFUSED', 'SUSPENDED', 'EXPIRED'];
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

    const existing = await prisma.socialCase.findUnique({ where: { id }, include: { beneficiary: true } });
    if (!existing) return res.status(404).json({ error: 'Dossier introuvable' });

    const { autoDecision: _, score } = await evaluateEligibility(existing.beneficiary);

    const [updated] = await prisma.$transaction([
      prisma.socialCase.update({
        where: { id },
        data: { status, processedBy: req.user.id, processedAt: new Date() },
      }),
      prisma.caseDecision.create({
        data: { caseId: id, decision: status, isAuto: false, reason, criteriaSnapshot: score, userId: req.user.id },
      }),
    ]);
    return res.json({ case: updated });
  } catch (error) {
    console.error('Erreur updateCaseStatus:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function submitCase(req, res) {
  try {
    const { id } = req.params;
    const existing = await prisma.socialCase.findUnique({ where: { id }, include: { beneficiary: true } });
    if (!existing) return res.status(404).json({ error: 'Dossier introuvable' });
    if (existing.status !== 'DRAFT') return res.status(400).json({ error: 'Le dossier doit être en brouillon pour être soumis' });

    const { autoDecision, score } = await evaluateEligibility(existing.beneficiary);
    const [updated] = await prisma.$transaction([
      prisma.socialCase.update({ where: { id }, data: { status: 'SUBMITTED', autoDecision, autoScore: score } }),
      prisma.caseDecision.create({ data: { caseId: id, decision: 'SUBMITTED', isAuto: true, criteriaSnapshot: score, userId: req.user.id } }),
    ]);
    return res.json({ case: updated, autoDecision, score });
  } catch (error) {
    console.error('Erreur submitCase:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── CRITÈRES D'ÉLIGIBILITÉ ───────────────────────────────────────────────────

async function getEligibilityCriteria(req, res) {
  try {
    const criteria = await prisma.eligibilityCriteria.findMany({ orderBy: { label: 'asc' } });
    return res.json({ criteria });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function upsertCriterion(req, res) {
  try {
    const { id } = req.params;
    const { key, label, description, type, operator, numValue, isActive } = req.body;
    if (id) {
      const c = await prisma.eligibilityCriteria.update({
        where: { id },
        data: { ...(label !== undefined && { label }), ...(description !== undefined && { description }), ...(type !== undefined && { type }), ...(operator !== undefined && { operator }), ...(numValue !== undefined && { numValue: numValue != null ? toDecimal(numValue) : null }), ...(isActive !== undefined && { isActive: Boolean(isActive) }) },
      });
      return res.json({ criterion: c });
    }
    if (!key || !label || !type) return res.status(400).json({ error: 'key, label et type sont requis' });
    const c = await prisma.eligibilityCriteria.create({
      data: { key, label, description, type, operator: operator || 'LTE', numValue: numValue != null ? toDecimal(numValue) : null, isActive: isActive !== false },
    });
    return res.status(201).json({ criterion: c });
  } catch (error) {
    console.error('Erreur upsertCriterion:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── PRODUITS & STOCK ─────────────────────────────────────────────────────────

async function getCategories(req, res) {
  try {
    const cats = await prisma.socialProductCategory.findMany({ orderBy: { name: 'asc' }, include: { products: { where: { isActive: true }, orderBy: { name: 'asc' } } } });
    return res.json({ categories: cats });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function saveCategory(req, res) {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    if (id) {
      const c = await prisma.socialProductCategory.update({ where: { id }, data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(isActive !== undefined && { isActive: Boolean(isActive) }) } });
      return res.json({ category: c });
    }
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const c = await prisma.socialProductCategory.create({ data: { name, description, isActive: isActive !== false } });
    return res.status(201).json({ category: c });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getProducts(req, res) {
  try {
    const { categoryId, active } = req.query;
    const where = {};
    if (categoryId) where.categoryId = categoryId;
    if (active !== undefined) where.isActive = active === 'true';
    const products = await prisma.socialProduct.findMany({ where, orderBy: [{ categoryId: 'asc' }, { name: 'asc' }], include: { category: true } });
    return res.json({ products });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function saveProduct(req, res) {
  try {
    const { id } = req.params;
    const { categoryId, name, unit, alertThreshold, isActive } = req.body;
    if (id) {
      const p = await prisma.socialProduct.update({ where: { id }, data: { ...(categoryId !== undefined && { categoryId }), ...(name !== undefined && { name }), ...(unit !== undefined && { unit }), ...(alertThreshold !== undefined && { alertThreshold: toDecimal(alertThreshold) }), ...(isActive !== undefined && { isActive: Boolean(isActive) }) }, include: { category: true } });
      return res.json({ product: p });
    }
    if (!categoryId || !name) return res.status(400).json({ error: 'categoryId et name sont requis' });
    const p = await prisma.socialProduct.create({ data: { categoryId, name, unit: unit || 'unité', alertThreshold: alertThreshold ? toDecimal(alertThreshold) : toDecimal(0), isActive: isActive !== false }, include: { category: true } });
    return res.status(201).json({ product: p });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function adjustStock(req, res) {
  try {
    const { productId, quantity, type, comment } = req.body;
    if (!productId || quantity == null || !type) return res.status(400).json({ error: 'productId, quantity et type sont requis' });
    const product = await prisma.socialProduct.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    const qty = Number(quantity);
    if (qty <= 0) return res.status(400).json({ error: 'Quantité doit être positive' });

    const newQty = type === 'CORRECTION'
      ? toDecimal(qty)
      : toDecimal(Number(product.stockQty) + qty);

    const [updated] = await prisma.$transaction([
      prisma.socialProduct.update({ where: { id: productId }, data: { stockQty: newQty } }),
      prisma.stockMovement.create({ data: { productId, type: 'CORRECTION', quantity: toDecimal(qty), unit: product.unit, comment, userId: req.user.id } }),
    ]);
    return res.json({ product: updated });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getStockMovements(req, res) {
  try {
    const { productId, type, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};
    if (productId) where.productId = productId;
    if (type) where.type = type;
    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' }, include: { product: { select: { id: true, name: true, unit: true } }, user: { select: { id: true, firstName: true, lastName: true } } } }),
    ]);
    return res.json({ movements, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── DISTRIBUTIONS ────────────────────────────────────────────────────────────

async function getDistributions(req, res) {
  try {
    const { beneficiaryId, status, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};
    if (beneficiaryId) where.beneficiaryId = beneficiaryId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.distributedAt = {};
      if (startDate) { const d = new Date(startDate); d.setHours(0, 0, 0, 0); where.distributedAt.gte = d; }
      if (endDate)   { const d = new Date(endDate);   d.setHours(23, 59, 59, 999); where.distributedAt.lte = d; }
    }
    const [total, distributions] = await Promise.all([
      prisma.distribution.count({ where }),
      prisma.distribution.findMany({
        where, skip, take: Number(limit), orderBy: { distributedAt: 'desc' },
        include: {
          beneficiary: { select: { id: true, firstName: true, lastName: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
          lines: { include: { product: { select: { id: true, name: true, unit: true } } } },
        },
      }),
    ]);
    return res.json({ distributions, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createDistribution(req, res) {
  try {
    const { beneficiaryId, lines, distributedAt, observations } = req.body;
    if (!beneficiaryId || !Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'beneficiaryId et lignes requis' });

    const beneficiary = await prisma.socialBeneficiary.findUnique({ where: { id: beneficiaryId } });
    if (!beneficiary) return res.status(404).json({ error: 'Bénéficiaire introuvable' });

    // Verify stock for all lines
    for (const line of lines) {
      const product = await prisma.socialProduct.findUnique({ where: { id: line.productId } });
      if (!product) return res.status(404).json({ error: `Produit ${line.productId} introuvable` });
      if (Number(product.stockQty) < Number(line.quantity)) {
        return res.status(400).json({ error: `Stock insuffisant pour ${product.name} (disponible: ${product.stockQty} ${product.unit}, demandé: ${line.quantity})` });
      }
    }

    // Transactional distribution + stock decrement
    const result = await prisma.$transaction(async (tx) => {
      const dist = await tx.distribution.create({
        data: {
          beneficiaryId,
          status: 'VALIDATED',
          distributedAt: distributedAt ? new Date(distributedAt) : new Date(),
          observations,
          userId: req.user.id,
          lines: { create: lines.map((l) => ({ productId: l.productId, quantity: toDecimal(l.quantity), unit: l.unit })) },
        },
        include: { lines: { include: { product: true } } },
      });

      for (const line of dist.lines) {
        await tx.socialProduct.update({ where: { id: line.productId }, data: { stockQty: { decrement: line.quantity } } });
        await tx.stockMovement.create({ data: { productId: line.productId, type: 'DISTRIBUTION', quantity: line.quantity, unit: line.unit, referenceId: dist.id, referenceType: 'distribution', userId: req.user.id } });
      }
      return dist;
    });

    return res.status(201).json({ distribution: result });
  } catch (error) {
    console.error('Erreur createDistribution:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function cancelDistribution(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const dist = await prisma.distribution.findUnique({ where: { id }, include: { lines: true } });
    if (!dist) return res.status(404).json({ error: 'Distribution introuvable' });
    if (dist.status === 'CANCELLED') return res.status(400).json({ error: 'Distribution déjà annulée' });

    await prisma.$transaction(async (tx) => {
      await tx.distribution.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
      for (const line of dist.lines) {
        await tx.socialProduct.update({ where: { id: line.productId }, data: { stockQty: { increment: line.quantity } } });
        await tx.stockMovement.create({ data: { productId: line.productId, type: 'RETOUR', quantity: line.quantity, unit: line.unit, referenceId: id, referenceType: 'distribution_cancel', comment: reason, userId: req.user.id } });
      }
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur cancelDistribution:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── COLLECTES ────────────────────────────────────────────────────────────────

async function getCollections(req, res) {
  try {
    const { status, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};
    if (status) where.status = status;
    if (startDate || endDate) {
      where.collectedAt = {};
      if (startDate) { const d = new Date(startDate); d.setHours(0, 0, 0, 0); where.collectedAt.gte = d; }
      if (endDate)   { const d = new Date(endDate);   d.setHours(23, 59, 59, 999); where.collectedAt.lte = d; }
    }
    const [total, collections] = await Promise.all([
      prisma.socialCollection.count({ where }),
      prisma.socialCollection.findMany({
        where, skip, take: Number(limit), orderBy: { collectedAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          lines: { include: { product: { select: { id: true, name: true, unit: true } } } },
        },
      }),
    ]);
    return res.json({ collections, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createCollection(req, res) {
  try {
    const { label, type, location, collectedAt, observations, lines, reference } = req.body;
    if (!label || !Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'label et lignes requis' });

    const result = await prisma.$transaction(async (tx) => {
      const coll = await tx.socialCollection.create({
        data: {
          label, type: type || 'GENERAL', location, reference, collectedAt: collectedAt ? new Date(collectedAt) : new Date(), observations, status: 'VALIDATED', userId: req.user.id,
          lines: { create: lines.map((l) => ({ productId: l.productId, quantity: toDecimal(l.quantity), unit: l.unit })) },
        },
        include: { lines: { include: { product: true } } },
      });
      for (const line of coll.lines) {
        await tx.socialProduct.update({ where: { id: line.productId }, data: { stockQty: { increment: line.quantity } } });
        await tx.stockMovement.create({ data: { productId: line.productId, type: 'COLLECTE', quantity: line.quantity, unit: line.unit, referenceId: coll.id, referenceType: 'collection', userId: req.user.id } });
      }
      return coll;
    });
    return res.status(201).json({ collection: result });
  } catch (error) {
    console.error('Erreur createCollection:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── ACHATS (RESPONSABLE uniquement) ─────────────────────────────────────────

async function getSuppliers(req, res) {
  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    return res.json({ suppliers });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function saveSupplier(req, res) {
  try {
    const { id } = req.params;
    const { name, contact, phone, email, address, isActive, observations } = req.body;
    if (id) {
      const s = await prisma.supplier.update({ where: { id }, data: { ...(name !== undefined && { name }), ...(contact !== undefined && { contact }), ...(phone !== undefined && { phone }), ...(email !== undefined && { email }), ...(address !== undefined && { address }), ...(isActive !== undefined && { isActive: Boolean(isActive) }), ...(observations !== undefined && { observations }) } });
      return res.json({ supplier: s });
    }
    if (!name) return res.status(400).json({ error: 'Nom fournisseur requis' });
    const s = await prisma.supplier.create({ data: { name, contact, phone, email, address, observations } });
    return res.status(201).json({ supplier: s });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getPurchases(req, res) {
  try {
    const { status, supplierId, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    const [total, purchases] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where, skip, take: Number(limit), orderBy: { purchasedAt: 'desc' },
        include: {
          supplier: true,
          budget: { select: { id: true, year: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
          lines: { include: { product: { select: { id: true, name: true, unit: true } } } },
        },
      }),
    ]);
    return res.json({ purchases, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createPurchase(req, res) {
  try {
    const { reference, supplierId, budgetId, purchasedAt, description, observations, lines } = req.body;
    if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'Au moins une ligne est requise' });

    const totalAmount = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0);

    // Budget check
    if (budgetId) {
      const budget = await prisma.socialBudget.findUnique({ where: { id: budgetId } });
      if (budget) {
        const consumed = await prisma.purchase.aggregate({ where: { budgetId, status: 'VALIDATED' }, _sum: { totalAmount: true } });
        const remaining = Number(budget.totalAmount) - Number(consumed._sum.totalAmount || 0);
        if (totalAmount > remaining) return res.status(400).json({ error: `Budget insuffisant. Restant: ${remaining.toFixed(2)} €, demandé: ${totalAmount.toFixed(2)} €` });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          reference, supplierId, budgetId, purchasedAt: purchasedAt ? new Date(purchasedAt) : new Date(),
          totalAmount: toDecimal(totalAmount), description, observations,
          status: 'VALIDATED', validatedAt: new Date(), userId: req.user.id,
          lines: { create: lines.map((l) => ({ productId: l.productId, quantity: toDecimal(l.quantity), unit: l.unit, unitPrice: toDecimal(l.unitPrice), totalPrice: toDecimal(Number(l.quantity) * Number(l.unitPrice)) })) },
        },
        include: { lines: { include: { product: true } } },
      });
      for (const line of purchase.lines) {
        await tx.socialProduct.update({ where: { id: line.productId }, data: { stockQty: { increment: line.quantity } } });
        await tx.stockMovement.create({ data: { productId: line.productId, type: 'ACHAT', quantity: line.quantity, unit: line.unit, referenceId: purchase.id, referenceType: 'purchase', userId: req.user.id } });
      }
      return purchase;
    });

    return res.status(201).json({ purchase: result });
  } catch (error) {
    console.error('Erreur createPurchase:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

// ─── BUDGET ───────────────────────────────────────────────────────────────────

async function getBudget(req, res) {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const budget = await prisma.socialBudget.findUnique({ where: { year } });
    if (!budget) return res.json({ budget: null, year });
    const consumed = await prisma.purchase.aggregate({ where: { budgetId: budget.id, status: 'VALIDATED' }, _sum: { totalAmount: true } });
    const consumedAmount = Number(consumed._sum.totalAmount || 0);
    const purchases = await prisma.purchase.findMany({ where: { budgetId: budget.id, status: 'VALIDATED' }, orderBy: { purchasedAt: 'desc' }, take: 20, include: { supplier: { select: { name: true } } } });
    return res.json({ budget: { ...budget, consumed: consumedAmount, remaining: Number(budget.totalAmount) - consumedAmount }, purchases });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function saveBudget(req, res) {
  try {
    const { year, totalAmount, observations } = req.body;
    if (!year || totalAmount == null) return res.status(400).json({ error: 'year et totalAmount requis' });
    const y = Number(year);
    const existing = await prisma.socialBudget.findUnique({ where: { year: y } });
    let budget;
    if (existing) {
      budget = await prisma.socialBudget.update({ where: { year: y }, data: { totalAmount: toDecimal(totalAmount), observations, userId: req.user.id } });
    } else {
      budget = await prisma.socialBudget.create({ data: { year: y, totalAmount: toDecimal(totalAmount), observations, userId: req.user.id } });
    }
    return res.json({ budget });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getDashboard,
  getBeneficiaries, getBeneficiary, createBeneficiary, updateBeneficiary,
  getCases, getCase, createCase, updateCaseStatus, submitCase,
  getEligibilityCriteria, upsertCriterion,
  getCategories, saveCategory,
  getProducts, saveProduct,
  adjustStock, getStockMovements,
  getDistributions, createDistribution, cancelDistribution,
  getCollections, createCollection,
  getSuppliers, saveSupplier,
  getPurchases, createPurchase,
  getBudget, saveBudget,
};
