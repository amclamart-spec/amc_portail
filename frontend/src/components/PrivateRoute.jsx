import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getHomeForRole } from '../utils/roles';

export default function PrivateRoute({ children, roles }) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={getHomeForRole(user.role)} replace />;
  }

  return children;
}
