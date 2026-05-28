const { Router } = require('express');
const { authenticate, authorize, requireApproved } = require('../middleware/auth');
const {
  getPolesAndLevels, getAvailableClasses, createEnrollment, getEnrollmentSummary, cancelEnrollment,
} = require('../controllers/enrollmentController');

const router = Router();

// Lecture publique pour le wizard d'inscription famille
router.get('/poles', getPolesAndLevels);
router.get('/classes', getAvailableClasses);
// Statut public des inscriptions (ouvertes/fermées)
const { getRegistrationBlockPublic } = require('../controllers/enrollmentController');
router.get('/registration-block', getRegistrationBlockPublic);

// Routes authentifiées
router.use(authenticate);
router.get('/summary', authorize('FAMILLE'), getEnrollmentSummary);
router.post('/', authorize('FAMILLE'), requireApproved, createEnrollment);
router.delete('/:id', authorize('FAMILLE'), requireApproved, cancelEnrollment);

module.exports = router;
