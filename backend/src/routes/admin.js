const { Router } = require('express');
const multer = require('multer');
const { authenticate, authorizePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  getPendingUsers,
  getAllUsers,
  approveUser,
  rejectUser,
  getStats,
  getEnrollmentsByCommune,
  getEnrollments,
  getRegistrationBlockStatus,
  updateRegistrationBlockStatus,
  getStudentAcademicRecord,
  getSchoolYears,
  createSchoolYear,
  updateSchoolYear,

  getPoles,
  createPole,
  updatePole,
  deletePole,

  getLevels,
  createLevel,
  updateLevel,
  deleteLevel,

  getRooms,
  createRoom,
  updateRoom,
  deleteRoom,

  getTimeSlots,
  createTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,

  getClasses,
  getClassDetails,
  getClassWaitlist,
  createClass,
  updateClass,
  deleteClass,
  removeStudentFromClass,
  exportClassStudentsExcel,
  exportClassStudentsPdf,
  exportEnrollments,
  sendMessageToClassFamilies,
  getEnrollmentPayments,
  createEnrollmentPayment,
  updateEnrollmentPayment,
  deleteEnrollmentPayment,
  downloadEnrollmentPaymentReceipt,
  updateEnrollment,

  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  resetTeacherPassword,
  deleteTeacher,
  resetUserPassword,
  unlockUser,
  cleanupFictiveLevels,
} = require('../controllers/adminController');
const {
  getFamilies,
  getFamilyDetails,
  adminEnrollForFamily,
  adminEnrollNewFamily,
} = require('../controllers/adminFamilyController');
const {
  exportStudents,
  exportAttendanceSheet,
  exportPlanning,
  exportAccountingPayments,
  exportAccountingUnpaid,
  exportAccountingTransactions,
  exportAccountingAnnualSummary,
} = require('../controllers/adminAdvancedController');
const { getPricingConfig, updatePricingConfig } = require('../controllers/pricingController');
const { getJustifications, patchJustification } = require('../controllers/absenceController');
const {
  getMailingStructure,
  sendMailing,
  getMailingPreview,
  getMailingRecipientsByCriteria,
  sendMailingBcc,
} = require('../controllers/adminMailController');
const { generatePaymentReceiptPDF } = require('../controllers/paymentController');

// Configuration multer pour les pièces jointes
const upload = multer({
  dest: 'uploads/mailing/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/png',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non autorisé'));
    }
  },
});

const router = Router();
router.use(authenticate);

router.get('/stats', authorizePermission(PERMISSIONS.FINANCE_VIEW), getStats);
router.get('/stats/communes', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), getEnrollmentsByCommune);

router.get('/users', authorizePermission(PERMISSIONS.USERS_MANAGE), getAllUsers);
router.get('/users/pending', authorizePermission(PERMISSIONS.USERS_APPROVE), getPendingUsers);
router.put('/users/:id/approve', authorizePermission(PERMISSIONS.USERS_APPROVE), approveUser);
router.put('/users/:id/reject', authorizePermission(PERMISSIONS.USERS_APPROVE), rejectUser);
router.post('/users/:id/reset-password', authorizePermission(PERMISSIONS.USERS_MANAGE), resetUserPassword);
router.post('/users/:id/unlock', authorizePermission(PERMISSIONS.USERS_MANAGE), unlockUser);

router.get('/enrollments', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), getEnrollments);
router.post('/enrollments/export', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), exportEnrollments);
router.get('/enrollments/registration-block', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), getRegistrationBlockStatus);
router.put('/enrollments/registration-block', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), updateRegistrationBlockStatus);
router.get('/students/:studentId/record', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), getStudentAcademicRecord);
router.get('/enrollments/:id/payments', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), getEnrollmentPayments);
router.post('/enrollments/:id/payments', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), createEnrollmentPayment);
router.patch('/enrollments/:id/payments/:paymentId', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), updateEnrollmentPayment);
router.delete('/enrollments/:id/payments/:paymentId', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), deleteEnrollmentPayment);
router.get('/enrollments/:id/payments/:paymentId/receipt', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), downloadEnrollmentPaymentReceipt);
router.put('/enrollments/:id', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), updateEnrollment);

// Payment receipt route - admin can download receipts for any payment
router.get('/payments/:paymentId/receipt/download', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), generatePaymentReceiptPDF);

router.get('/school-years', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getSchoolYears);
router.post('/school-years', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createSchoolYear);
router.put('/school-years/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), updateSchoolYear);
router.get('/pricing', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getPricingConfig);
router.put('/pricing', authorizePermission(PERMISSIONS.CLASSES_MANAGE), updatePricingConfig);

// Pôles / niveaux
router.get('/poles', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getPoles);
router.post('/poles', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createPole);
router.put('/poles/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), updatePole);
router.delete('/poles/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), deletePole);

router.get('/niveaux', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getLevels);
router.post('/niveaux', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createLevel);
router.put('/niveaux/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), updateLevel);
router.delete('/niveaux/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), deleteLevel);
router.delete('/niveaux/fictifs', authorizePermission(PERMISSIONS.CLASSES_MANAGE), cleanupFictiveLevels);

// Alias historique
router.post('/levels', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createLevel);

// Salles
router.get('/salles', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getRooms);
router.post('/salles', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createRoom);
router.put('/salles/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), updateRoom);
router.delete('/salles/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), deleteRoom);

// Alias historique
router.get('/rooms', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getRooms);

// Créneaux
router.get('/creneaux', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getTimeSlots);
router.post('/creneaux', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createTimeSlot);
router.put('/creneaux/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), updateTimeSlot);
router.delete('/creneaux/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), deleteTimeSlot);

// Alias historique
router.get('/timeslots', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getTimeSlots);

// Classes
router.get('/classes', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getClasses);
router.get('/classes/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getClassDetails);
router.get('/classes/:id/waitlist', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getClassWaitlist);
router.post('/classes', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createClass);
router.put('/classes/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), updateClass);
router.delete('/classes/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), deleteClass);
router.delete('/classes/:classId/inscriptions/:enrollmentId', authorizePermission(PERMISSIONS.CLASSES_MANAGE), removeStudentFromClass);
router.get('/classes/:id/export/excel', authorizePermission(PERMISSIONS.CLASSES_MANAGE), exportClassStudentsExcel);
router.get('/classes/:id/export/pdf', authorizePermission(PERMISSIONS.CLASSES_MANAGE), exportClassStudentsPdf);
router.post('/classes/:id/message-familles', authorizePermission(PERMISSIONS.CLASSES_MANAGE), sendMessageToClassFamilies);

// Exports avancés
router.post('/exports/students', authorizePermission(PERMISSIONS.CLASSES_MANAGE), exportStudents);
router.post('/exports/attendance-sheet', authorizePermission(PERMISSIONS.CLASSES_MANAGE), exportAttendanceSheet);
router.post('/exports/planning', authorizePermission(PERMISSIONS.CLASSES_MANAGE), exportPlanning);
router.get('/exports/accounting/payments', authorizePermission(PERMISSIONS.FINANCE_VIEW), exportAccountingPayments);
router.get('/exports/accounting/unpaid', authorizePermission(PERMISSIONS.FINANCE_VIEW), exportAccountingUnpaid);
router.get('/exports/accounting/transactions', authorizePermission(PERMISSIONS.FINANCE_VIEW), exportAccountingTransactions);
router.get('/exports/accounting/annual-summary', authorizePermission(PERMISSIONS.FINANCE_VIEW), exportAccountingAnnualSummary);

// Professeurs
router.get('/professeurs', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getTeachers);
router.get('/professeurs/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getTeacherById);
router.post('/professeurs', authorizePermission(PERMISSIONS.CLASSES_MANAGE), createTeacher);
router.put('/professeurs/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), updateTeacher);
router.post('/professeurs/:id/reset-password', authorizePermission(PERMISSIONS.CLASSES_MANAGE), resetTeacherPassword);
router.delete('/professeurs/:id', authorizePermission(PERMISSIONS.CLASSES_MANAGE), deleteTeacher);

// Alias historique
router.get('/teachers', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getTeachers);

// Mailing
router.get('/mailing/structure', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getMailingStructure);
router.post('/mailing/preview', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getMailingPreview);
router.post('/mailing/send', authorizePermission(PERMISSIONS.CLASSES_MANAGE), upload.single('attachment'), sendMailing);
router.post('/mailing/recipients-by-criteria', authorizePermission(PERMISSIONS.CLASSES_MANAGE), getMailingRecipientsByCriteria);
router.post('/mailing/send-bcc', authorizePermission(PERMISSIONS.CLASSES_MANAGE), upload.single('attachment'), sendMailingBcc);

// Familles
router.get('/families', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), getFamilies);
router.get('/families/:id', authorizePermission(PERMISSIONS.PAYMENTS_MANAGE), getFamilyDetails);
router.post('/families/enroll-new', authorizePermission(PERMISSIONS.CLASSES_MANAGE), adminEnrollNewFamily);
router.post('/families/:id/enroll', authorizePermission(PERMISSIONS.CLASSES_MANAGE), adminEnrollForFamily);

router.get('/absences/justifications', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), getJustifications);
router.patch('/absences/:evaluationId/justify', authorizePermission(PERMISSIONS.ENROLLMENTS_MANAGE), patchJustification);

module.exports = router;