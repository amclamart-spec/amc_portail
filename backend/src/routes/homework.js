const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { actAsClassTeacher, POLE_MANAGER_ROLES } = require('../middleware/poleManagerDelegation');
const {
  postHomeworkMessage,
  getHomeworkMessage,
  getHomeworkHistory,
  deleteHomeworkMessage,
  getFamilyHomeworkMessages,
} = require('../controllers/homeworkController');

const router = Router();

router.use(authenticate);
router.post('/', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, postHomeworkMessage);
router.get('/history', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getHomeworkHistory);
router.get('/', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getHomeworkMessage);
router.delete('/:id', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, deleteHomeworkMessage);
router.get('/family', authorize('FAMILLE'), getFamilyHomeworkMessages);

module.exports = router;
