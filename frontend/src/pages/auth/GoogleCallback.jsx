import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

export default function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeOAuthLogin } = useAuth();

  const accessToken = useMemo(() => searchParams.get('accessToken'), [searchParams]);
  const refreshToken = useMemo(() => searchParams.get('refreshToken'), [searchParams]);
  const error = useMemo(() => searchParams.get('error'), [searchParams]);
  const code = useMemo(() => searchParams.get('code'), [searchParams]);
  const state = useMemo(() => searchParams.get('state'), [searchParams]);
  const mobileCode = useMemo(() => searchParams.get('mobileCode'), [searchParams]);
  // Le code mobile est à usage unique : ne pas l'échanger deux fois (double effet en StrictMode).
  const exchangedCodeRef = useRef(null);

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

    // Retour dans l'application mobile (utils/native.js) : code à usage unique à échanger.
    if (mobileCode) {
      if (exchangedCodeRef.current === mobileCode) return;
      exchangedCodeRef.current = mobileCode;
      api.post('/auth/google/mobile-exchange', { code: mobileCode })
        .then(({ data }) => completeOAuthLogin(data.accessToken, data.refreshToken))
        .catch((e) => {
          const message = e.response?.data?.error || 'Impossible de finaliser la connexion Google';
          navigate(`/login?oauth_error=${encodeURIComponent(message)}`, { replace: true });
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
  }, [accessToken, refreshToken, error, code, state, mobileCode, completeOAuthLogin, navigate, searchParams]);

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
