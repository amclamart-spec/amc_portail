const { Router } = require('express');
const { authenticate, authorize, requireApproved } = require('../middleware/auth');
const {
  createOrUpdateProfile, getProfile, addParent, updateParent, deleteParent, getDashboard,
  getOpenEvents, registerForEvent,
} = require('../controllers/familyController');
const {
  getPedagogyStudents,
  getPedagogyAbsences,
  getPedagogyHomework,
  getPedagogyNotes,
  postDeclareAbsence,
  postPedagogyJustification,
  deletePedagogyJustificationDocument,
  putHomeworkCompletion,
} = require('../controllers/familyPedagogyController');

const router = Router();

router.use(authenticate, authorize('FAMILLE'));

router.get('/dashboard', getDashboard);
router.get('/events', getOpenEvents);
router.put('/events/:id/registration', requireApproved, registerForEvent);
router.get('/profile', getProfile);
router.get('/pedagogy/students', getPedagogyStudents);
router.get('/pedagogy/absences', getPedagogyAbsences);
router.get('/pedagogy/homework', getPedagogyHomework);
router.put('/pedagogy/homework/:homeworkId/completion', putHomeworkCompletion);
router.get('/pedagogy/notes', getPedagogyNotes);
router.post('/pedagogy/absences/declare', postDeclareAbsence);
router.post('/pedagogy/absences/:evaluationId/justify', postPedagogyJustification);
router.delete('/pedagogy/absences/:evaluationId/documents/:documentId', deletePedagogyJustificationDocument);
router.post('/profile', requireApproved, createOrUpdateProfile);
router.post('/parents', requireApproved, addParent);
router.put('/parents/:id', requireApproved, updateParent);
router.delete('/parents/:id', requireApproved, deleteParent);

module.exports = router;
