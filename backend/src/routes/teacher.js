const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getTeacherDashboard, getTeacherClasses } = require('../controllers/teacherController');

const router = Router();
router.use(authenticate, authorize('PROFESSEUR'));

router.get('/dashboard', getTeacherDashboard);
router.get('/classes', getTeacherClasses);

module.exports = router;
