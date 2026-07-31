const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { POLE_MANAGER_ROLES } = require('../middleware/poleManagerDelegation');
const { getPoleClasses } = require('../controllers/poleManagerController');

const router = Router();

router.use(authenticate, authorize(...POLE_MANAGER_ROLES));

router.get('/classes', getPoleClasses);

module.exports = router;
