const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { actAsClassTeacher, POLE_MANAGER_ROLES } = require('../middleware/poleManagerDelegation');
const {
  getNotes,
  postNote,
  deleteNote,
  postBulletinUpload,
  getBulletinUploads,
  deleteBulletinUpload,
} = require('../controllers/noteScolaireController');

const router = Router();

router.use(authenticate);

router.get('/bulletin/:studentId', authorize('PROFESSEUR', 'FAMILLE', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getBulletinUploads);
router.post('/bulletin', authorize('FAMILLE'), postBulletinUpload);
router.delete('/bulletin/:id', authorize('FAMILLE'), deleteBulletinUpload);

router.get('/:studentId', authorize('PROFESSEUR', 'FAMILLE', 'ADMIN', ...POLE_MANAGER_ROLES), actAsClassTeacher, getNotes);
router.post('/', authorize('FAMILLE'), postNote);
router.delete('/:id', authorize('FAMILLE'), deleteNote);

module.exports = router;
