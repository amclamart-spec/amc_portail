const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { authenticate, authorizePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  getDashboard,
  getPendingEmployees, getEmployees, approveEmployee, rejectEmployee, createEmployee, updateEmployeeInfo,
  updateEmployeeDetails, generateEmployeePassword, toggleEmployeeActive,
  uploadContract,
  updateLeaveBalance, getPendingLeaves, getEmployeeLeaves, decideLeaveRequest,
  getMyProfile, updateMyProfile,
  getMyLeaves, createMyLeaveRequest, cancelMyLeaveRequest,
  getEmployeePayslips, uploadPayslip, deletePayslip, getMyPayslips,
} = require('../controllers/hrController');

const router = Router();
router.use(authenticate);

const canManage = authorizePermission(PERMISSIONS.HR_MANAGE);
const isSelf = authorizePermission(PERMISSIONS.HR_SELF);

// Configuration multer pour les fiches de paie
const payslipsUploadDir = path.join(__dirname, '../../uploads/payslips');
if (!fs.existsSync(payslipsUploadDir)) {
  fs.mkdirSync(payslipsUploadDir, { recursive: true });
}
const uploadPayslipFile = multer({
  dest: payslipsUploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format de fichier non autorisé (PDF, JPEG ou PNG uniquement)'));
  },
});

// Configuration multer pour les contrats de travail
const contractsUploadDir = path.join(__dirname, '../../uploads/contracts');
if (!fs.existsSync(contractsUploadDir)) {
  fs.mkdirSync(contractsUploadDir, { recursive: true });
}
const uploadContractFile = multer({
  dest: contractsUploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format de fichier non autorisé (PDF, JPEG ou PNG uniquement)'));
  },
});

// Dashboard (responsable RH)
router.get('/dashboard', canManage, getDashboard);

// Espace personnel (salarié) — routes statiques déclarées avant les routes /:id pour éviter toute ambiguïté
router.get('/me',            isSelf, getMyProfile);
router.put('/me',            isSelf, updateMyProfile);
router.get('/me/payslips',   isSelf, getMyPayslips);
router.get('/me/leaves',           isSelf, getMyLeaves);
router.post('/me/leaves',          isSelf, createMyLeaveRequest);
router.delete('/me/leaves/:leaveId', isSelf, cancelMyLeaveRequest);

// Congés (responsable RH) — déclarées avant les routes /:id pour éviter toute ambiguïté
router.get('/leaves/pending',      canManage, getPendingLeaves);
router.put('/leaves/:leaveId/decide', canManage, decideLeaveRequest);

// Gestion des salariés (responsable RH)
router.get('/pending',        canManage, getPendingEmployees);
router.get('/',                canManage, getEmployees);
router.post('/',               canManage, createEmployee);
router.post('/:id/approve',    canManage, approveEmployee);
router.post('/:id/reject',     canManage, rejectEmployee);
router.put('/:id',             canManage, updateEmployeeInfo);
router.post('/:id/contract',   canManage, uploadContractFile.single('file'), uploadContract);
router.put('/:id/leave-balance', canManage, updateLeaveBalance);
router.get('/:id/leaves',        canManage, getEmployeeLeaves);

// Compte utilisateur du salarié (identifié par son user id, distinct de l'id de fiche RH ci-dessus)
router.put('/:id/account',            canManage, updateEmployeeDetails);
router.post('/:id/generate-password', canManage, generateEmployeePassword);
router.put('/:id/active',             canManage, toggleEmployeeActive);

// Fiches de paie (responsable RH)
router.get('/:id/payslips',              canManage, getEmployeePayslips);
router.post('/:id/payslips',             canManage, uploadPayslipFile.single('file'), uploadPayslip);
router.delete('/payslips/:payslipId',    canManage, deletePayslip);

module.exports = router;
