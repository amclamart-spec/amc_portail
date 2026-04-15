import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import { getHomeForRole } from './utils/roles';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import VerifyEmail from './pages/auth/VerifyEmail';

import SuperAdminDashboard from './pages/superAdmin/Dashboard';

import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminEnrollments from './pages/admin/Enrollments';
import AdminSettings from './pages/admin/Settings';

import TresorierDashboard from './pages/tresorier/Dashboard';
import TresorierPayments from './pages/tresorier/Payments';

import ProfesseurDashboard from './pages/professeur/Dashboard';

import FamilyDashboard from './pages/family/Dashboard';
import FamilyChildren from './pages/family/Children';
import FamilyEnrollment from './pages/family/Enrollment';
import FamilyProfile from './pages/family/Profile';
import FamilyPayments from './pages/family/Payments';

function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to={getHomeForRole(user?.role)} />} />
      <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to={getHomeForRole(user?.role)} />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      <Route path="/super-admin" element={<PrivateRoute roles={['SUPER_ADMIN']}><Layout><SuperAdminDashboard /></Layout></PrivateRoute>} />

      <Route path="/admin" element={<PrivateRoute roles={['ADMIN', 'SUPER_ADMIN']}><Layout><AdminDashboard /></Layout></PrivateRoute>} />
      <Route path="/admin/users" element={<PrivateRoute roles={['ADMIN', 'SUPER_ADMIN']}><Layout><AdminUsers /></Layout></PrivateRoute>} />
      <Route path="/admin/enrollments" element={<PrivateRoute roles={['ADMIN', 'SUPER_ADMIN']}><Layout><AdminEnrollments /></Layout></PrivateRoute>} />
      <Route path="/admin/settings" element={<PrivateRoute roles={['ADMIN', 'SUPER_ADMIN']}><Layout><AdminSettings /></Layout></PrivateRoute>} />

      <Route path="/tresorier" element={<PrivateRoute roles={['TRESORIER', 'SUPER_ADMIN']}><Layout><TresorierDashboard /></Layout></PrivateRoute>} />
      <Route path="/tresorier/payments" element={<PrivateRoute roles={['TRESORIER', 'SUPER_ADMIN']}><Layout><TresorierPayments /></Layout></PrivateRoute>} />

      <Route path="/professeur" element={<PrivateRoute roles={['PROFESSEUR']}><Layout><ProfesseurDashboard /></Layout></PrivateRoute>} />

      <Route path="/famille" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyDashboard /></Layout></PrivateRoute>} />
      <Route path="/famille/enfants" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyChildren /></Layout></PrivateRoute>} />
      <Route path="/famille/inscription" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyEnrollment /></Layout></PrivateRoute>} />
      <Route path="/famille/paiements" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyPayments /></Layout></PrivateRoute>} />
      <Route path="/famille/profil" element={<PrivateRoute roles={['FAMILLE']}><Layout><FamilyProfile /></Layout></PrivateRoute>} />

      <Route path="/" element={<Navigate to={isAuthenticated ? getHomeForRole(user?.role) : '/login'} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
