const { Router } = require('express');
const {
  saveDraft,
  getDraft,
  getPricingPreview,
  completeFamilyRegistration,
} = require('../controllers/familyWizardController');

const router = Router();

router.post('/draft', saveDraft);
router.get('/draft', getDraft);
router.post('/pricing-preview', getPricingPreview);
router.post('/complete', completeFamilyRegistration);

module.exports = router;