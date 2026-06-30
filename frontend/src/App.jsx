import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import { getHomeForRole } from './utils/roles';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import VerifyEmail from './pages/auth/VerifyEmail';
import GoogleCallback from './pages/auth/GoogleCallback';
import FamilyRegistrationWizard from './pages/auth/FamilyRegistrationWizard';
import ReglementInterieur from './pages/reglement/ReglementInterieur';
import SuperAdminDashboard from './pages/superAdmin/Dashboard';

import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminEnrollments from './pages/admin/Enrollments';
import AdminSettings from './pages/admin/Settings';
import AdminRooms from './pages/admin/Rooms';
import AdminTimeslots from './pages/admin/Timeslots';
import AdminLevels from './pages/admin/Levels';
import AdminClasses from './pages/admin/Classes';
import AdminClassDetails from './pages/admin/ClassDetails';
import AdminTeachers from './pages/admin/Teachers';
import AdminExports from './pages/admin/Exports';
import AdminMailing from './pages/admin/Mailing';
import AdminProfile from './pages/admin/Profile';
import AdminPlanning from './pages/admin/Planning';
import AdminChat from './pages/admin/Chat';
import AdminPayments from './pages/admin/Payments';
import AdminRefunds from './pages/admin/Refunds';
import EnrollmentDashboard from './pages/EnrollmentDashboard';

import TresorierDashboard from './pages/tresorier/Dashboard';
import TresorierPayments from './pages/tresorier/Payments';
import TresorierRefunds from './pages/tresorier/Refunds';

import ProfesseurDashboard from './pages/professeur/Dashboard';
import SuiviPedagogique from './pages/professeur/SuiviPedagogique';

import FamilyDashboard from './pages/family/Dashboard';
import FamilyChildren from './pages/family/Children';
import FamilyEnrollment from './pages/family/Enrollment';
import FamilyProfile from './pages/family/Profile';
import FamilyPayments from './pages/family/Payments';
import FamilyPedagogy from './pages/family/SuiviPedagogique';
import FamilyChat from './pages/family/Chat';

// Rôles ayant accès à l'espace admin (sauf paiements/tarifs pour les responsables)
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'RESPONSABLE_POLE_CORAN', 'RESPONSABLE_POLE_ARABE', 'RESPONSABLE_POLE_SOUTIEN_SCO', 'RESPONSABLE_POLE_SCIENCE_IS'];
const ADMIN_ONLY  = ['ADMIN', 'SUPER_ADMIN'];

function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to={getHomeForRole(user?.role)} />} />
      <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to={getHomeForRole(user?.role)} />} />
      <Route path="/forgot-password" element={!isAuthenticated ? <ForgotPassword /> : <Navigate to={getHomeForRole(user?.role)} />} />
      <Route path="/reset-password" element={!isAuthenticated ? <ResetPassword /> : <Navigate to={getHomeForRole(user?.role)} />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      <Route path="/register/famille-wizard" element={<FamilyRegistrationWizard />} />
      <Route path="/reglement-interieur" element={<ReglementInterieur />} />
      <Route path="/auth/google/callback" element={<GoogleCallback />} />
      <Route path="/super-admin" element={<PrivateRoute roles={['SUPER_ADMIN']}><Layout><SuperAdminDashboard /></Layout></PrivateRoute>} />

      <Route path="/admin" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><EnrollmentDashboard /></Layout></PrivateRoute>} />
      <Route path="/admin/users" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminUsers /></Layout></PrivateRoute>} />
      <Route path="/admin/enrollments" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminEnrollments /></Layout></PrivateRoute>} />
      <Route path="/admin/settings" element={<PrivateRoute roles={ADMIN_ONLY}><Layout><AdminSettings /></Layout></PrivateRoute>} />
      <Route path="/admin/payments" element={<PrivateRoute roles={ADMIN_ONLY}><Layout><AdminPayments /></Layout></PrivateRoute>} />
      <Route path="/admin/remboursements" element={<PrivateRoute roles={ADMIN_ONLY}><Layout><AdminRefunds /></Layout></PrivateRoute>} />

      <Route path="/admin/salles" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminRooms /></Layout></PrivateRoute>} />
      <Route path="/admin/creneaux" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminTimeslots /></Layout></PrivateRoute>} />
      <Route path="/admin/niveaux" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminLevels /></Layout></PrivateRoute>} />
      <Route path="/admin/classes" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminClasses /></Layout></PrivateRoute>} />
      <Route path="/admin/classes/:id" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminClassDetails /></Layout></PrivateRoute>} />
      <Route path="/admin/professeurs" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminTeachers /></Layout></PrivateRoute>} />
      <Route path="/admin/exports" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminExports /></Layout></PrivateRoute>} />
      <Route path="/admin/planning" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminPlanning /></Layout></PrivateRoute>} />
      <Route path="/admin/chat" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminChat /></Layout></PrivateRoute>} />
      <Route path="/admin/mailing" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminMailing /></Layout></PrivateRoute>} />
      <Route path="/admin/profile" element={<PrivateRoute roles={ADMIN_ROLES}><Layout><AdminProfile /></Layout></PrivateRoute>} />
      <Route path="/admin/tableau-inscriptions" element={<Navigate to="/admin" replace />} />

      {/* Alias historiques */}
      <Route path="/admin/rooms" element={<Navigate to="/admin/salles" replace />} />
      <Route path="/admin/timeslots" element={<Navigate to="/admin/creneaux" replace />} />
      <Route path="/admin/teachers" element={<Navigate to="/admin/professeurs" replace />} />

      <Route path="/tresorier" element={<PrivateRoute roles={['TRESORIER', 'SUPER_ADMIN']}><Layout><TresorierDashboard /></Layout></PrivateRoute>} />
      <Route path="/tresorier/payments" element={<PrivateRoute roles={['TRESORIER', 'SUPER_ADMIN']}><Layout><TresorierPayments scope="all" /></Layout></PrivateRoute>} />
      <Route path="/tresorier/echeanciers" element={<PrivateRoute roles={['TRESORIER', 'SUPER_ADMIN']}><Layout><TresorierPayments scope="plans" /></Layout></PrivateRoute>} />
      <Route path="/tresorier/prelevements" element={<PrivateRoute roles={['TRESORIER', 'SUPER_ADMIN']}><Layout><TresorierPayments scope="debits" /></Layout></PrivateRoute>} />
      <Route path="/tresorier/remboursements" element={<PrivateRoute roles={['TRESORIER', 'SUPER_ADMIN']}><Layout><TresorierRefunds /></Layout></PrivateRoute>} />

      <Route path="/professeur" element={<PrivateRoute roles={['PROFESSEUR']}><Layout><ProfesseurDashboard /></Layout></PrivateRoute>} />
      <Route path="/suivi-pedagogique" element={<PrivateRoute roles={['PROFESSEUR']}><Layout><SuiviPedagogique /></Layout></PrivateRoute>} />

      <Route path="/famille" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyDashboard /></Layout></PrivateRoute>} />
      <Route path="/famille/chat" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyChat /></Layout></PrivateRoute>} />
      <Route path="/famille/enfants" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyChildren /></Layout></PrivateRoute>} />
      <Route path="/famille/inscription" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyEnrollment /></Layout></PrivateRoute>} />
      <Route path="/famille/inscription/nouveau" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyRegistrationWizard existingFamily /></Layout></PrivateRoute>} />
      <Route path="/famille/paiements" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyPayments /></Layout></PrivateRoute>} />
      <Route path="/famille/profil" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyProfile /></Layout></PrivateRoute>} />
      <Route path="/famille/suivi-pedagogique" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyPedagogy /></Layout></PrivateRoute>} />

      <Route path="/" element={<Navigate to={isAuthenticated ? getHomeForRole(user?.role) : '/login'} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;