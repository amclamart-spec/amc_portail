const { Router } = require('express');

const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const familyRoutes = require('./family');
const studentRoutes = require('./student');
const enrollmentRoutes = require('./enrollment');
const paymentRoutes = require('./payments');
const financeRoutes = require('./finance');
const superAdminRoutes = require('./superAdmin');
const teacherRoutes = require('./teacher');
const familyWizardRoutes = require('./familyWizard');

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/family', familyRoutes);
router.use('/teacher', teacherRoutes);
router.use('/students', studentRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/payments', paymentRoutes);
router.use('/family-wizard', familyWizardRoutes);
router.use('/finance', financeRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'AMC Portail API' });
});

module.exports = router;