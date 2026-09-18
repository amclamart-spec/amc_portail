const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { actAsClassTeacher, POLE_MANAGER_ROLES } = require('../middleware/poleManagerDelegation');
const {
  getSouratesList,
  getSeances,
  postSeance,
  putSeance,
  getRevisions,
  postRevision,
  deleteRevision,
  putEvaluateRevision,
  getRepetitions,
  postRepetitions,
  deleteRepetition,
  putEvaluateRepetition,
  postIncrementRepetition,
  getLectures,
  postLecture,
  deleteLecture,
  putEvaluateLecture,
  postBulletinUpload,
  getBulletinUpload,
  deleteBulletinUpload,
  postCoranBulletinPdf,
} = require('../controllers/coranController');

const router = Router();

router.use(authenticate);

router.get('/sourates', getSouratesList);

// Séances (évaluation professeur, lecture famille + professeur)
router.get('/seances/:studentId', authorize('PROFESSEUR', 'FAMILLE', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getSeances);
router.post('/seances', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, postSeance);
router.put('/seances/:id', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, putSeance);

// Révisions (saisie famille, lecture famille + professeur, appréciation professeur)
router.get('/revisions/:studentId', authorize('PROFESSEUR', 'FAMILLE', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getRevisions);
router.post('/revisions', authorize('FAMILLE'), postRevision);
router.delete('/revisions/:id', authorize('FAMILLE'), deleteRevision);
router.put('/revisions/:id/evaluate', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, putEvaluateRevision);

// Répétitions de pages (saisie famille, lecture famille + professeur, appréciation professeur)
router.get('/repetitions/:studentId', authorize('PROFESSEUR', 'FAMILLE', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getRepetitions);
router.post('/repetitions', authorize('FAMILLE'), postRepetitions);
router.post('/repetitions/increment', authorize('FAMILLE'), postIncrementRepetition);
router.delete('/repetitions/:id', authorize('FAMILLE'), deleteRepetition);
router.put('/repetitions/:id/evaluate', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, putEvaluateRepetition);

// Entraînement lecture / Tajwid (saisie famille, lecture famille + professeur, appréciation professeur)
router.get('/lectures/:studentId', authorize('PROFESSEUR', 'FAMILLE', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getLectures);
router.post('/lectures', authorize('FAMILLE'), postLecture);
router.delete('/lectures/:id', authorize('FAMILLE'), deleteLecture);
router.put('/lectures/:id/evaluate', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, putEvaluateLecture);

// Bulletin importé (upload professeur, lecture famille + professeur)
router.get('/bulletin-upload/:studentId', authorize('PROFESSEUR', 'FAMILLE', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getBulletinUpload);
router.post('/bulletin-upload', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, postBulletinUpload);
router.delete('/bulletin-upload/:id', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, deleteBulletinUpload);
router.post('/bulletin/pdf', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, postCoranBulletinPdf);

module.exports = router;
