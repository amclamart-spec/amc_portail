const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { actAsClassTeacher, POLE_MANAGER_ROLES } = require('../middleware/poleManagerDelegation');
const {
  getAppreciations,
  postAppreciation,
  deleteAppreciation,
  putAppreciationSeen,
} = require('../controllers/appreciationController');

const router = Router();

router.use(authenticate);

router.get('/:studentId', authorize('PROFESSEUR', 'FAMILLE', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getAppreciations);
router.post('/', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, postAppreciation);
router.delete('/:id', authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), deleteAppreciation);
router.put('/:id/vu', authorize('FAMILLE'), putAppreciationSeen);

module.exports = router;
