const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getEvaluations,
  postEvaluation,
  getEvaluationStats,
  getLessons,
  getPeriodNotes,
  postPeriodNote,
} = require('../controllers/evaluationController');

const router = Router();
router.use(authenticate, authorize('PROFESSEUR'));

router.get('/', getEvaluations);
router.get('/stats', getEvaluationStats);
router.get('/period', getPeriodNotes);
router.get('/lessons', getLessons);
router.post('/', postEvaluation);
router.post('/note', postPeriodNote);

module.exports = router;
