import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { getHomeForRole } from '../utils/roles';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('amc_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const navigate = useNavigate();

  const isAuthenticated = !!user;

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('amc_access_token', data.accessToken);
      localStorage.setItem('amc_refresh_token', data.refreshToken);
      localStorage.setItem('amc_user', JSON.stringify(data.user));
      setUser(data.user);
      toast.success('Connexion réussie !');

      navigate(getHomeForRole(data.user.role));
    } catch (error) {
      const msg = error.response?.data?.error || 'Erreur de connexion';
      toast.error(msg);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const completeOAuthLogin = useCallback(async (accessToken, refreshToken) => {
    setLoading(true);
    try {
      localStorage.setItem('amc_access_token', accessToken);
      localStorage.setItem('amc_refresh_token', refreshToken);

      const { data } = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      localStorage.setItem('amc_user', JSON.stringify(data.user));
      setUser(data.user);
      toast.success('Connexion Google réussie !');
      navigate(getHomeForRole(data.user.role), { replace: true });
      return data.user;
    } catch (error) {
      localStorage.removeItem('amc_access_token');
      localStorage.removeItem('amc_refresh_token');
      localStorage.removeItem('amc_user');
      setUser(null);

      const msg = error.response?.data?.error || 'Erreur lors de la connexion Google';
      toast.error(msg);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const register = async (userData) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', userData);
      toast.success(data.message);
      return data;
    } catch (error) {
      const msg = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Erreur lors de l\'inscription';
      toast.error(msg);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    localStorage.removeItem('amc_access_token');
    localStorage.removeItem('amc_refresh_token');
    localStorage.removeItem('amc_user');
    setUser(null);
    navigate('/login');
    toast.success('Déconnexion réussie');
  }, [navigate]);

  const fetchUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      localStorage.setItem('amc_user', JSON.stringify(data.user));
    } catch {
      // Token invalide
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      if (localStorage.getItem('amc_access_token') && !user) {
        await fetchUser();
      }
      setInitialized(true);
    };

    initialize();
  }, [fetchUser, user]);

  if (!initialized) {
    return null;
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      loading,
      login,
      completeOAuthLogin,
      register,
      logout,
      fetchUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}
