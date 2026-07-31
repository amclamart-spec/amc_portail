const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { actAsClassTeacher, POLE_MANAGER_ROLES } = require('../middleware/poleManagerDelegation');
const {
  postPublishBulletin,
  getBulletins,
  deleteBulletin,
} = require('../controllers/bulletinController');

const router = Router();

router.use(authenticate);

router.post('/publish', authorize('PROFESSEUR', ...POLE_MANAGER_ROLES), actAsClassTeacher, postPublishBulletin);
router.get('/:studentId', authorize('PROFESSEUR', 'FAMILLE', ...POLE_MANAGER_ROLES), actAsClassTeacher, getBulletins);
router.delete('/:id', authorize('PROFESSEUR', ...POLE_MANAGER_ROLES), deleteBulletin);

module.exports = router;
