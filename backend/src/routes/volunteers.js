const { Router } = require('express');
const { authenticate, authorizeAnyPermission, authorizePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  getDashboard,
  getPendingVolunteers, getVolunteers, approveVolunteer, rejectVolunteer, createVolunteer,
  getPendingVolunteerRoleRequests, approveVolunteerRoleRequest, rejectVolunteerRoleRequest,
  updateVolunteerDetails, generateVolunteerPassword, toggleVolunteerActive,
  getMyProfile, updateMyProfile, getMyValidatedHours,
  getGroups, createGroup, updateGroup, deleteGroup, getGroupMembers, updateGroupMembers,
  getEvents, createEvent, updateEvent, deleteEvent,
  getEventParticipations, upsertMyParticipation, updateParticipation,
} = require('../controllers/volunteerController');

const router = Router();
router.use(authenticate);

const canManage = authorizePermission(PERMISSIONS.VOLUNTEERS_MANAGE);
const isSelf = authorizePermission(PERMISSIONS.VOLUNTEERS_SELF);
const canView = authorizeAnyPermission(PERMISSIONS.VOLUNTEERS_MANAGE, PERMISSIONS.VOLUNTEERS_SELF);

// Dashboard (responsable)
router.get('/dashboard', canManage, getDashboard);

// Groupes de bénévoles (responsable)
router.get('/groups',              canManage, getGroups);
router.post('/groups',             canManage, createGroup);
router.put('/groups/:id',          canManage, updateGroup);
router.delete('/groups/:id',       canManage, deleteGroup);
router.get('/groups/:id/members',  canManage, getGroupMembers);
router.put('/groups/:id/members',  canManage, updateGroupMembers);

// Demandes de rôle Bénévole envoyées depuis "Mes rôles" (responsable)
router.get('/role-requests/pending',     canManage, getPendingVolunteerRoleRequests);
router.put('/role-requests/:id/approve', canManage, approveVolunteerRoleRequest);
router.put('/role-requests/:id/reject',  canManage, rejectVolunteerRoleRequest);

// Profil personnel (bénévole) — doit être déclaré avant les routes génériques
// /:id ci-dessous, sinon Express matche "me" comme :id (PUT /:id passe alors
// par canManage au lieu de isSelf, et un bénévole ne peut plus enregistrer son profil).
router.get('/me',     isSelf, getMyProfile);
router.put('/me',     isSelf, updateMyProfile);
router.get('/hours',  isSelf, getMyValidatedHours);

// Gestion des bénévoles (responsable)
router.get('/pending',        canManage, getPendingVolunteers);
router.get('/',                canManage, getVolunteers);
router.post('/',               canManage, createVolunteer);
router.post('/:id/approve',    canManage, approveVolunteer);
router.post('/:id/reject',     canManage, rejectVolunteer);
router.put('/:id',                    canManage, updateVolunteerDetails);
router.post('/:id/generate-password', canManage, generateVolunteerPassword);
router.put('/:id/active',             canManage, toggleVolunteerActive);

// Événements (lecture pour bénévole + responsable, écriture pour responsable)
router.get('/events',            canView,   getEvents);
router.post('/events',           canManage, createEvent);
router.put('/events/:id',        canManage, updateEvent);
router.delete('/events/:id',     canManage, deleteEvent);

// Présence & imputations (temps passé) par événement
router.get('/events/:id/participations',                   canManage, getEventParticipations);
router.put('/events/:id/participation',                     isSelf,   upsertMyParticipation);
router.put('/events/:id/participations/:participationId',   canManage, updateParticipation);

module.exports = router;
