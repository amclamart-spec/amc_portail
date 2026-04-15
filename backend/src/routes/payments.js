const { Router } = require('express');
const { authenticate, authorizePermission, requireApproved } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  createPaymentIntent,
  recordOfflinePayment,
  getTransactions,
  requestRefund,
  processRefund,
  getFamilyPaymentHistory,
} = require('../controllers/paymentController');

const router = Router();
router.use(authenticate);

router.get('/history/family', authorizePermission(PERMISSIONS.FAMILY_SELF_PAYMENTS), requireApproved, getFamilyPaymentHistory);
router.post('/online-intent', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), createPaymentIntent);
router.post('/offline', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), recordOfflinePayment);
router.get('/transactions', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), getTransactions);
router.post('/refunds', authorizePermission(PERMISSIONS.PAYMENTS_REFUND), requestRefund);
router.patch('/refunds/:refundId', authorizePermission(PERMISSIONS.PAYMENTS_REFUND), processRefund);

module.exports = router;
