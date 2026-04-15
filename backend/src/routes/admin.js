const { Router } = require('express');
const { authenticate, authorizePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  getPendingUsers,
  getAllUsers,
  approveUser,
  rejectUser,
  getStats,
  getEnrollments,
  getSchoolYears,
  createSchoolYear,
  getPoles,
  createPole,
  createLevel,
  getClasses,
  createClass,
} = require('../controllers/adminController');

const router = Router();
router.use(authenticate);

router.get('/stats', authorizePermission(PERMISSIONS.FINANCE_VIEW), getStats);

router.get('/users', authorizePermission(PERMISSIONS.USERS_MANAGE), getAllUsers);
router.get('/users/pending', authorizePermission(PERMISSIONS.USERS_APPROVE), getPendingUsers);
router.put('/users/:id/approve', authorizePermission(PERMISSIONS.USERS_APPROVE), approveUser);
router.put('/users/:id/reject', authorizePermission(PERMISSIONS.USERS_APPROVE), rejectUser);

router.get('/enrollments', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), getEnrollments);

router.get('/school-years', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getSchoolYears);
router.post('/school-years', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createSchoolYear);

router.get('/poles', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getPoles);
router.post('/poles', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createPole);
router.post('/levels', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createLevel);

router.get('/classes', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getClasses);
router.post('/classes', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createClass);

module.exports = router;
