const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { authenticate, authorizePermission, authorizeAnyPermission, requireApproved } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  createFamilyEnrollmentPayment,
  createPaymentIntent,
  recordOfflinePayment,
  markChequeInstallmentStatus,
  getChequePaymentPlans,
  getTransactions,
  exportTransactions,
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
  uploadPaymentReceipt,
  getPaymentReceipt,
  downloadPaymentReceipt,
} = require('../controllers/paymentController');

const receiptsUploadDir = path.join(__dirname, '../../uploads/receipts');
if (!fs.existsSync(receiptsUploadDir)) {
  fs.mkdirSync(receiptsUploadDir, { recursive: true });
}

const upload = multer({
  dest: receiptsUploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Seuls les fichiers PDF sont autorisés')); 
    }
    cb(null, true);
  },
});

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

router.get('/history/family', authorizePermission(PERMISSIONS.FAMILY_SELF_PAYMENTS), getFamilyPaymentHistory);
router.post('/family-enrollment', authorizePermission(PERMISSIONS.FAMILY_SELF_PAYMENTS), createFamilyEnrollmentPayment);

// Receipt routes (invoice and receipt are the same)
router.get('/:paymentId/invoice', authorizeAnyPermission(PERMISSIONS.FAMILY_SELF_PAYMENTS, PERMISSIONS.PAYMENTS_MANAGE), getPaymentInvoice);
router.get('/:paymentId/invoice/download', authorizeAnyPermission(PERMISSIONS.FAMILY_SELF_PAYMENTS, PERMISSIONS.PAYMENTS_MANAGE), downloadInvoice);

// Receipt upload and download routes
router.post('/:paymentId/receipt', authorizeAnyPermission(PERMISSIONS.FAMILY_SELF_PAYMENTS, PERMISSIONS.PAYMENTS_MANAGE), upload.single('receipt'), uploadPaymentReceipt);
router.get('/:paymentId/receipt', authorizeAnyPermission(PERMISSIONS.FAMILY_SELF_PAYMENTS, PERMISSIONS.PAYMENTS_MANAGE), getPaymentReceipt);
router.get('/:paymentId/receipt/download', authorizeAnyPermission(PERMISSIONS.FAMILY_SELF_PAYMENTS, PERMISSIONS.PAYMENTS_MANAGE), downloadPaymentReceipt);

router.post('/online-intent', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), createPaymentIntent);
router.post('/offline', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), recordOfflinePayment);
router.get('/transactions', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), getTransactions);
router.get('/transactions/export', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), exportTransactions);
router.get('/cheques/plans', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), getChequePaymentPlans);
router.patch('/cheques/installments/:installmentId', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), markChequeInstallmentStatus);
router.post('/refunds', authorizePermission(PERMISSIONS.PAYMENTS_REFUND), requestRefund);
router.patch('/refunds/:refundId', authorizePermission(PERMISSIONS.PAYMENTS_REFUND), processRefund);

module.exports = router;
