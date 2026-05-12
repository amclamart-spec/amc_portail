const express = require('express');
const { authenticate, authorizePermission, requireApproved } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  createFamilyEnrollmentPayment,
  createPaymentIntent,
  recordOfflinePayment,
  markChequeInstallmentStatus,
  getChequePaymentPlans,
  getTransactions,
  requestRefund,
  processRefund,
  getFamilyPaymentHistory,
  handleStripeConfirm,
  handleStripeCancel,
  handleGoCardlessReturn,
  handleGoCardlessCancel,
  handleStripeWebhook,
  handleGoCardlessWebhook,
  downloadInvoice,
  getPaymentInvoice,
} = require('../controllers/paymentController');

const router = express.Router();

// Webhooks publics (sans auth)
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);
router.post('/webhooks/gocardless', express.raw({ type: 'application/json' }), handleGoCardlessWebhook);

// Pages de retour publiques
router.get('/confirm', handleStripeConfirm);
router.get('/cancel', handleStripeCancel);
router.get('/gocardless/return', handleGoCardlessReturn);
router.get('/gocardless/cancel', handleGoCardlessCancel);

router.use(authenticate);

router.get('/history/family', authorizePermission(PERMISSIONS.FAMILY_SELF_PAYMENTS), requireApproved, getFamilyPaymentHistory);
router.post('/family-enrollment', authorizePermission(PERMISSIONS.FAMILY_SELF_PAYMENTS), requireApproved, createFamilyEnrollmentPayment);

// Invoice routes
router.get('/:paymentId/invoice', authorizePermission(PERMISSIONS.FAMILY_SELF_PAYMENTS), getPaymentInvoice);
router.get('/:paymentId/invoice/download', authorizePermission(PERMISSIONS.FAMILY_SELF_PAYMENTS), downloadInvoice);

router.post('/online-intent', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), createPaymentIntent);
router.post('/offline', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), recordOfflinePayment);
router.get('/transactions', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), getTransactions);
router.get('/cheques/plans', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), getChequePaymentPlans);
router.patch('/cheques/installments/:installmentId', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), markChequeInstallmentStatus);
router.post('/refunds', authorizePermission(PERMISSIONS.PAYMENTS_REFUND), requestRefund);
router.patch('/refunds/:refundId', authorizePermission(PERMISSIONS.PAYMENTS_REFUND), processRefund);

module.exports = router;
