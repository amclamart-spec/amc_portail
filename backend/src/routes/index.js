const { Router } = require('express');

const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const familyRoutes = require('./family');
const studentRoutes = require('./student');
const enrollmentRoutes = require('./enrollment');
const paymentRoutes = require('./payments');
const sepaRoutes = require('./sepaRoutes');
const sepaAdminRoutes = require('./sepaAdmin');
const webhookRoutes = require('./webhookRoutes');
const financeRoutes = require('./finance');
const superAdminRoutes = require('./superAdmin');
const teacherRoutes = require('./teacher');
const evaluationsRoutes = require('./evaluations');
const absencesRoutes = require('./absences');
const homeworkRoutes = require('./homework');
const chatRoutes = require('./chat');
const familyWizardRoutes = require('./familyWizard');
const socialRoutes = require('./social');
const coranRoutes = require('./coran');

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/admin/sepa', sepaAdminRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/family', familyRoutes);
router.use('/teacher', teacherRoutes);
router.use('/evaluations', evaluationsRoutes);
router.use('/homework', homeworkRoutes);
router.use('/chat', chatRoutes);
router.use('/absences', absencesRoutes);
router.use('/students', studentRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/payments/sepa', sepaRoutes);
router.use('/payments', paymentRoutes);
router.use('/api/webhooks', webhookRoutes);
router.use('/family-wizard', familyWizardRoutes);
router.use('/finance', financeRoutes);
router.use('/social', socialRoutes);
router.use('/coran', coranRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'AMC Portail API' });
});

module.exports = router;