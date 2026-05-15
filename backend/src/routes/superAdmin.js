const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getAdmins, updateUserRole } = require('../controllers/superAdminController');

const router = Router();
router.use(authenticate, authorize('SUPER_ADMIN'));

router.get('/admins', getAdmins);
router.patch('/users/:userId/role', updateUserRole);

module.exports = router;
