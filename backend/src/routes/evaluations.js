const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { actAsClassTeacher, POLE_MANAGER_ROLES } = require('../middleware/poleManagerDelegation');
const {
  getEvaluations,
  postEvaluation,
  getEvaluationStats,
  getClassRanking,
  getLessons,
  getPeriodNotes,
  postPeriodNote,
  generateBulletinPDF,
} = require('../controllers/evaluationController');

const router = Router();
router.use(authenticate, authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher);

router.get('/', getEvaluations);
router.get('/stats', getEvaluationStats);
router.get('/ranking', getClassRanking);
router.get('/period', getPeriodNotes);
router.get('/lessons', getLessons);
router.post('/', postEvaluation);
router.post('/note', postPeriodNote);
router.post('/bulletin/pdf', generateBulletinPDF);

module.exports = router;
