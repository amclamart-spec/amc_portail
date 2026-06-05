import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeOAuthLogin } = useAuth();

  const accessToken = useMemo(() => searchParams.get('accessToken'), [searchParams]);
  const refreshToken = useMemo(() => searchParams.get('refreshToken'), [searchParams]);
  const error = useMemo(() => searchParams.get('error'), [searchParams]);
  const code = useMemo(() => searchParams.get('code'), [searchParams]);
  const state = useMemo(() => searchParams.get('state'), [searchParams]);

  useEffect(() => {
    if (error) {
      navigate(`/login?oauth_error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    if (accessToken && refreshToken) {
      completeOAuthLogin(accessToken, refreshToken).catch(() => {
        navigate('/login?oauth_error=Impossible de finaliser la connexion Google', { replace: true });
      });
      return;
    }

    if (code && state) {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const cleanBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
      const callbackUrl = `${cleanBase}/auth/google/callback?${searchParams.toString()}`;
      window.location.replace(callbackUrl);
      return;
    }

    navigate('/login?oauth_error=Réponse OAuth invalide', { replace: true });
  }, [accessToken, refreshToken, error, code, state, completeOAuthLogin, navigate, searchParams]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F3F4F6' }}>
      <div className="card" style={{ maxWidth: 520, textAlign: 'center' }}>
        <h2 style={{ color: 'var(--amc-primary)', marginBottom: 8 }}>Connexion Google en cours…</h2>
        <p style={{ color: '#6B7280', margin: 0 }}>
          Merci de patienter pendant la finalisation de votre authentification sécurisée.
        </p>
      </div>
    </div>
  );
}
