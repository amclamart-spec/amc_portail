const { Router } = require('express');
const { authenticate, authorize, requireApproved } = require('../middleware/auth');
const {
  createOrUpdateProfile, getProfile, addParent, updateParent, deleteParent, getDashboard,
} = require('../controllers/familyController');
const {
  getPedagogyStudents,
  getPedagogyAbsences,
  getPedagogyHomework,
  getPedagogyNotes,
  postPedagogyJustification,
} = require('../controllers/familyPedagogyController');

const router = Router();

router.use(authenticate, authorize('FAMILLE'));

router.get('/dashboard', getDashboard);
router.get('/profile', getProfile);
router.get('/pedagogy/students', getPedagogyStudents);
router.get('/pedagogy/absences', getPedagogyAbsences);
router.get('/pedagogy/homework', getPedagogyHomework);
router.get('/pedagogy/notes', getPedagogyNotes);
router.post('/pedagogy/absences/:evaluationId/justify', postPedagogyJustification);
router.post('/profile', requireApproved, createOrUpdateProfile);
router.post('/parents', requireApproved, addParent);
router.put('/parents/:id', requireApproved, updateParent);
router.delete('/parents/:id', requireApproved, deleteParent);

module.exports = router;
