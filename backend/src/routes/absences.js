const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getAbsences, getClassStudents, getAbsenceHistory, exportLessonAttendancePdf, postAbsences } = require('../controllers/absenceController');

const router = Router();
router.use(authenticate, authorize('PROFESSEUR'));

router.get('/class-students', getClassStudents);
router.get('/history/:lessonId/export', exportLessonAttendancePdf);
router.get('/history', getAbsenceHistory);
router.get('/', getAbsences);
router.post('/', postAbsences);

module.exports = router;
