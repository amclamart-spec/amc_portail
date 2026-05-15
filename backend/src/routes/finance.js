const { Router } = require('express');
const { authenticate, authorizePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const { getFinancialDashboard, createFinancialEntry, createCategory } = require('../controllers/financeController');

const router = Router();
router.use(authenticate);

router.get('/dashboard', authorizePermission(PERMISSIONS.FINANCE_VIEW), getFinancialDashboard);
router.post('/entries', authorizePermission(PERMISSIONS.FINANCE_MANAGE), createFinancialEntry);
router.post('/categories', authorizePermission(PERMISSIONS.FINANCE_MANAGE), createCategory);

module.exports = router;
