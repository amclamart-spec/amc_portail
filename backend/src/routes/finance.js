const { Router } = require('express');
const { authenticate, authorizePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const { getFinancialDashboard, createFinancialEntry, createCategory } = require('../controllers/financeController');
const { generatePaymentReceiptPDF } = require('../controllers/paymentController');

const router = Router();
router.use(authenticate);

router.get('/dashboard', authorizePermission(PERMISSIONS.FINANCE_VIEW), getFinancialDashboard);
router.post('/entries', authorizePermission(PERMISSIONS.FINANCE_MANAGE), createFinancialEntry);
router.post('/categories', authorizePermission(PERMISSIONS.FINANCE_MANAGE), createCategory);

// Payment receipt route - treasurer can download receipts
router.get('/payments/:paymentId/receipt/download', authorizePermission(PERMISSIONS.FINANCE_VIEW), generatePaymentReceiptPDF);

module.exports = router;
