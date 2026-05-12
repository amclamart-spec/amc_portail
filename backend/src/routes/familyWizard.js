const { Router } = require('express');
const { authenticate, authenticateOptional, authorize, requireApproved } = require('../middleware/auth');
const {
  saveDraft,
  getDraft,
  getPricingPreview,
  completeFamilyRegistration,
  completeExistingFamilyRegistration,
  createFamilyPortalAccount,
} = require('../controllers/familyWizardController');

const router = Router();

router.post('/draft', saveDraft);
router.get('/draft', getDraft);
router.post('/pricing-preview', authenticateOptional, getPricingPreview);
router.post('/create-account-only', createFamilyPortalAccount);
router.post('/complete', completeFamilyRegistration);
router.post('/complete-existing', authenticate, authorize('FAMILLE'), requireApproved, completeExistingFamilyRegistration);

module.exports = router;