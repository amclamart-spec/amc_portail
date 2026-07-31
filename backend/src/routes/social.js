const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { authenticate, authorizeAnyPermission, authorizePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  getDashboard,
  getPendingOperatorRoleRequests, approveOperatorRoleRequest, rejectOperatorRoleRequest,
  getOperators, createOperator, updateOperatorDetails, generateOperatorPassword, toggleOperatorActive,
  getBeneficiaries, getBeneficiary, createBeneficiary, updateBeneficiary,
  getBeneficiaryDocuments, uploadBeneficiaryDocument, deleteBeneficiaryDocument,
  getCases, getCase, createCase, updateCaseStatus, submitCase,
  getEligibilityCriteria, createCriterion, updateCriterion,
  getCategories, saveCategory,
  getProducts, saveProduct,
  adjustStock, getStockMovements,
  getDistributions, createDistribution, cancelDistribution,
  getCollections, createCollection,
  getSuppliers, saveSupplier,
  getPurchases, createPurchase, uploadPurchaseReceipt,
  getBudget, saveBudget,
} = require('../controllers/socialController');

const router = Router();
router.use(authenticate);

const canOperate = authorizeAnyPermission(PERMISSIONS.SOCIAL_MANAGE, PERMISSIONS.SOCIAL_OPERATE);
const canManage  = authorizePermission(PERMISSIONS.SOCIAL_MANAGE);
const canBudget  = authorizePermission(PERMISSIONS.SOCIAL_BUDGET);

// Configuration multer pour les pièces justificatives des bénéficiaires
const socialDocsUploadDir = path.join(__dirname, '../../uploads/social-documents');
if (!fs.existsSync(socialDocsUploadDir)) {
  fs.mkdirSync(socialDocsUploadDir, { recursive: true });
}
const uploadDocument = multer({
  dest: socialDocsUploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format de fichier non autorisé (PDF, JPEG ou PNG uniquement)'));
  },
});

// Configuration multer pour les tickets de caisse des achats
const purchaseReceiptsUploadDir = path.join(__dirname, '../../uploads/purchase-receipts');
if (!fs.existsSync(purchaseReceiptsUploadDir)) {
  fs.mkdirSync(purchaseReceiptsUploadDir, { recursive: true });
}
const uploadReceipt = multer({
  dest: purchaseReceiptsUploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format de fichier non autorisé (PDF, JPEG ou PNG uniquement)'));
  },
});

// Dashboard
router.get('/dashboard', canOperate, getDashboard);

// Demandes de rôle Opérateur Social envoyées depuis "Mes rôles" (RESPONSABLE only)
router.get('/role-requests/pending',     canManage, getPendingOperatorRoleRequests);
router.put('/role-requests/:id/approve', canManage, approveOperatorRoleRequest);
router.put('/role-requests/:id/reject',  canManage, rejectOperatorRoleRequest);

// Gestion des opérateurs sociaux (RESPONSABLE only)
router.get('/operators',                    canManage, getOperators);
router.post('/operators',                   canManage, createOperator);
router.put('/operators/:id',                canManage, updateOperatorDetails);
router.post('/operators/:id/generate-password', canManage, generateOperatorPassword);
router.put('/operators/:id/active',         canManage, toggleOperatorActive);

// Bénéficiaires
router.get('/beneficiaries',         canOperate, getBeneficiaries);
router.get('/beneficiaries/:id',     canOperate, getBeneficiary);
router.post('/beneficiaries',        canOperate, createBeneficiary);
router.put('/beneficiaries/:id',     canOperate, updateBeneficiary);

// Pièces justificatives du bénéficiaire
router.get('/beneficiaries/:id/documents',               canOperate, getBeneficiaryDocuments);
router.post('/beneficiaries/:id/documents',               canOperate, uploadDocument.single('file'), uploadBeneficiaryDocument);
router.delete('/beneficiaries/:id/documents/:documentId', canOperate, deleteBeneficiaryDocument);

// Dossiers
router.get('/cases',                 canOperate, getCases);
router.get('/cases/:id',             canOperate, getCase);
router.post('/cases',                canOperate, createCase);
router.post('/cases/:id/submit',     canOperate, submitCase);
router.patch('/cases/:id/status',    canManage,  updateCaseStatus);

// Critères d'éligibilité — chacun composé de 3 conditions obligatoires (RESPONSABLE only)
router.get('/eligibility-criteria',      canManage, getEligibilityCriteria);
router.post('/eligibility-criteria',     canManage, createCriterion);
router.put('/eligibility-criteria/:id',  canManage, updateCriterion);

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
router.get('/purchases',                canBudget,  getPurchases);
router.post('/purchases',               canBudget,  createPurchase);
router.post('/purchases/:id/receipt',   canBudget,  uploadReceipt.single('file'), uploadPurchaseReceipt);

// Budget (RESPONSABLE + BUDGET)
router.get('/budget',                canBudget,  getBudget);
router.post('/budget',               canBudget,  saveBudget);

module.exports = router;
