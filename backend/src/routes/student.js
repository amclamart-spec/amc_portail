const { Router } = require('express');
const { authenticate, authorize, requireApproved } = require('../middleware/auth');
const { addStudent, getStudents, updateStudent, deleteStudent } = require('../controllers/studentController');

const router = Router();

router.use(authenticate);

// RESPONSABLE_FAMILLE peut gérer ses élèves
router.get('/', authorize('FAMILLE', 'ADMIN', 'SUPER_ADMIN'), getStudents);
router.post('/', authorize('FAMILLE'), requireApproved, addStudent);
router.put('/:id', authorize('FAMILLE'), requireApproved, updateStudent);
router.delete('/:id', authorize('FAMILLE'), requireApproved, deleteStudent);

module.exports = router;
