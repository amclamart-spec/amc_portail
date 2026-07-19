const { Router } = require('express');
const { authenticate, authorizeAnyPermission, authorizePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
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
} = require('../controllers/socialController');

const router = Router();
router.use(authenticate);

const canOperate = authorizeAnyPermission(PERMISSIONS.SOCIAL_MANAGE, PERMISSIONS.SOCIAL_OPERATE);
const canManage  = authorizePermission(PERMISSIONS.SOCIAL_MANAGE);
const canBudget  = authorizePermission(PERMISSIONS.SOCIAL_BUDGET);

// Dashboard
router.get('/dashboard', canOperate, getDashboard);

// Bénéficiaires
router.get('/beneficiaries',         canOperate, getBeneficiaries);
router.get('/beneficiaries/:id',     canOperate, getBeneficiary);
router.post('/beneficiaries',        canOperate, createBeneficiary);
router.put('/beneficiaries/:id',     canOperate, updateBeneficiary);

// Dossiers
router.get('/cases',                 canOperate, getCases);
router.get('/cases/:id',             canOperate, getCase);
router.post('/cases',                canOperate, createCase);
router.post('/cases/:id/submit',     canOperate, submitCase);
router.patch('/cases/:id/status',    canManage,  updateCaseStatus);

// Critères d'éligibilité (RESPONSABLE only)
router.get('/eligibility-criteria',      canManage, getEligibilityCriteria);
router.post('/eligibility-criteria',     canManage, upsertCriterion);
router.put('/eligibility-criteria/:id',  canManage, (req, res, next) => { req.params.id = req.params.id; next(); }, upsertCriterion);

// Catégories produits
router.get('/categories',            canOperate, getCategories);
router.post('/categories',           canOperate, saveCategory);
router.put('/categories/:id',        canOperate, saveCategory);

// Produits
router.get('/products',              canOperate, getProducts);
router.post('/products',             canOperate, saveProduct);
router.put('/products/:id',          canOperate, saveProduct);
router.post('/products/stock-adjust',canOperate, adjustStock);

// Mouvements de stock
router.get('/stock-movements',       canOperate, getStockMovements);

// Distributions
router.get('/distributions',         canOperate, getDistributions);
router.post('/distributions',        canOperate, createDistribution);
router.post('/distributions/:id/cancel', canManage, cancelDistribution);

// Collectes
router.get('/collections',           canOperate, getCollections);
router.post('/collections',          canOperate, createCollection);

// Fournisseurs (RESPONSABLE + BUDGET)
router.get('/suppliers',             canBudget,  getSuppliers);
router.post('/suppliers',            canBudget,  saveSupplier);
router.put('/suppliers/:id',         canBudget,  saveSupplier);

// Achats (RESPONSABLE + BUDGET)
router.get('/purchases',             canBudget,  getPurchases);
router.post('/purchases',            canBudget,  createPurchase);

// Budget (RESPONSABLE + BUDGET)
router.get('/budget',                canBudget,  getBudget);
router.post('/budget',               canBudget,  saveBudget);

module.exports = router;
