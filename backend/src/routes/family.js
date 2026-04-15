const { Router } = require('express');
const { authenticate, authorize, requireApproved } = require('../middleware/auth');
const {
  createOrUpdateProfile, getProfile, addParent, updateParent, deleteParent, getDashboard,
} = require('../controllers/familyController');

const router = Router();

router.use(authenticate, authorize('FAMILLE'));

router.get('/dashboard', getDashboard);
router.get('/profile', getProfile);
router.post('/profile', requireApproved, createOrUpdateProfile);
router.post('/parents', requireApproved, addParent);
router.put('/parents/:id', requireApproved, updateParent);
router.delete('/parents/:id', requireApproved, deleteParent);

module.exports = router;
