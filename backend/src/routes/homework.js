const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  postHomeworkMessage,
  getHomeworkMessage,
  getHomeworkHistory,
  deleteHomeworkMessage,
  getFamilyHomeworkMessages,
} = require('../controllers/homeworkController');

const router = Router();

router.use(authenticate);
router.post('/', authorize('PROFESSEUR'), postHomeworkMessage);
router.get('/history', authorize('PROFESSEUR'), getHomeworkHistory);
router.get('/', authorize('PROFESSEUR'), getHomeworkMessage);
router.delete('/:id', authorize('PROFESSEUR'), deleteHomeworkMessage);
router.get('/family', authorize('FAMILLE'), getFamilyHomeworkMessages);

module.exports = router;
