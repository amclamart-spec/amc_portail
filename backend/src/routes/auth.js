const { Router } = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  googleAuth,
  googleCallback,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe,
  changePassword,
  getProfile,
  updateProfile,
  logout,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = Router();

const registerValidation = [
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('Téléphone requis'),
  body('password')
    .isLength({ min: 8 }).withMessage('Minimum 8 caractères')
    .matches(/[A-Z]/).withMessage('Au moins une majuscule')
    .matches(/[0-9]/).withMessage('Au moins un chiffre'),
  body('firstName').trim().notEmpty().withMessage('Prénom requis'),
  body('lastName').trim().notEmpty().withMessage('Nom requis'),
  body('role').optional().isIn(['FAMILLE', 'PROFESSEUR', 'ADMIN', 'TRESORIER', 'RESPONSABLE_POLE_CORAN', 'RESPONSABLE_POLE_ARABE', 'RESPONSABLE_POLE_SOUTIEN_SCO', 'RESPONSABLE_POLE_SCIENCE_IS']).withMessage('Profil invalide'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('password').notEmpty().withMessage('Mot de passe requis'),
];

const forgotPasswordValidation = [
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Token requis'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Minimum 8 caractères')
    .matches(/[A-Z]/).withMessage('Au moins une majuscule')
    .matches(/[0-9]/).withMessage('Au moins un chiffre'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Les mots de passe ne correspondent pas'),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Minimum 8 caractères')
    .matches(/[A-Z]/).withMessage('Au moins une majuscule')
    .matches(/[0-9]/).withMessage('Au moins un chiffre'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Les mots de passe ne correspondent pas'),
];

function validate(req, res, next) {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return next();
}

router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);

router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

router.post('/refresh', refreshToken);
router.post('/forgot-password', forgotPasswordValidation, validate, forgotPassword);
router.post('/reset-password', resetPasswordValidation, validate, resetPassword);
router.get('/verify-email/:token', verifyEmail);
router.get('/me', authenticate, getMe);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, changePasswordValidation, validate, changePassword);
router.post('/logout', authenticate, logout);

module.exports = router;