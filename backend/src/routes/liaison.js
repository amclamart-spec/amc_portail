const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { actAsClassTeacher, POLE_MANAGER_ROLES } = require('../middleware/poleManagerDelegation');
const {
  getStaffThreads,
  postStaffThread,
  postStaffReply,
  postStaffRead,
} = require('../controllers/liaisonController');

// Cahier de liaison, côté équipe pédagogique (les routes famille sont dans family.js).
const router = Router();
const staff = [authorize('PROFESSEUR', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher];

router.use(authenticate);
router.get('/', ...staff, getStaffThreads);
router.post('/', ...staff, postStaffThread);
router.post('/:threadId/replies', ...staff, postStaffReply);
router.post('/:threadId/read', ...staff, postStaffRead);

module.exports = router;
