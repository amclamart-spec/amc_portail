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

  useEffect(() => {
    if (error) {
      navigate(`/login?oauth_error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    if (!accessToken || !refreshToken) {
      navigate('/login?oauth_error=Réponse OAuth invalide', { replace: true });
      return;
    }

    completeOAuthLogin(accessToken, refreshToken).catch(() => {
      navigate('/login?oauth_error=Impossible de finaliser la connexion Google', { replace: true });
    });
  }, [accessToken, refreshToken, error, completeOAuthLogin, navigate]);

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
