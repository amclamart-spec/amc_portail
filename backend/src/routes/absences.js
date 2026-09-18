const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { actAsClassTeacher, POLE_MANAGER_ROLES } = require('../middleware/poleManagerDelegation');
const { getAbsences, getAbsenceRanking, exportAbsenceRanking, getClassStudents, getAbsenceHistory, exportLessonAttendancePdf, postAbsences } = require('../controllers/absenceController');

const router = Router();
router.use(authenticate, authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher);

router.get('/class-students', getClassStudents);
router.get('/ranking', getAbsenceRanking);
router.get('/ranking/export', exportAbsenceRanking);
router.get('/history/:lessonId/export', exportLessonAttendancePdf);
router.get('/history', getAbsenceHistory);
router.get('/', getAbsences);
router.post('/', postAbsences);

module.exports = router;
