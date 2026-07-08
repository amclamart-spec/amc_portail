const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getEvaluations,
  postEvaluation,
  getEvaluationStats,
  getLessons,
  getPeriodNotes,
  postPeriodNote,
  generateBulletinPDF,
} = require('../controllers/evaluationController');

const router = Router();
router.use(authenticate, authorize('PROFESSEUR'));

router.get('/', getEvaluations);
router.get('/stats', getEvaluationStats);
router.get('/period', getPeriodNotes);
router.get('/lessons', getLessons);
router.post('/', postEvaluation);
router.post('/note', postPeriodNote);
router.post('/bulletin/pdf', generateBulletinPDF);

module.exports = router;
