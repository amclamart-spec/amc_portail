const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getPendingUsers, approveUser, rejectUser } = require('../controllers/adminController');
const { getAllUsers, createUser, updateUserRoles, toggleUserActive, resetUserPassword } = require('../controllers/superAdminController');

const router = Router();
router.use(authenticate, authorize('SUPER_ADMIN'));

// Liste complète des utilisateurs, quel que soit le rôle
router.get('/users', getAllUsers);
router.post('/users', createUser);
router.put('/users/:id/roles', updateUserRoles);
router.put('/users/:id/active', toggleUserActive);
router.post('/users/:id/reset-password', resetUserPassword);

// Validation des demandes de création de compte (hors Famille, auto-validée à l'inscription)
router.get('/users/pending', getPendingUsers);
router.put('/users/:id/approve', approveUser);
router.put('/users/:id/reject', rejectUser);

module.exports = router;
