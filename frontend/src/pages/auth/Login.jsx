import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';

export default function Login() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [registrationsBlocked, setRegistrationsBlocked] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    fetch(`${apiBase}/enrollments/registration-block`).then((r) => r.json()).then((data) => {
      setRegistrationsBlocked(Boolean(data?.blocked));
    }).catch(() => {});

    let messageTimer;
    const oauthError = searchParams.get('oauth_error');
    if (oauthError) {
      toast.error(decodeURIComponent(oauthError));
      searchParams.delete('oauth_error');
    }

    const registrationMessageParam = searchParams.get('registration_message');
    if (registrationMessageParam) {
      const decodedMessage = decodeURIComponent(registrationMessageParam);
      setRegistrationMessage(decodedMessage);
      messageTimer = setTimeout(() => setRegistrationMessage(''), 180000);
      searchParams.delete('registration_message');
    }

    if (oauthError || registrationMessageParam) {
      setSearchParams(searchParams, { replace: true });
    }

    return () => {
      if (messageTimer) {
        clearTimeout(messageTimer);
      }
    };
  }, [searchParams, setSearchParams]);

  const googleAuthUrl = useMemo(() => {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const cleanBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    return `${cleanBase}/auth/google`;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      // handled in context
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = googleAuthUrl;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #213B88 0%, #0088CC 100%)',
      }}
    >
      <div style={{ padding: '20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/amc_logo.png" alt="AMC" style={{ height: 50 }} />
          <img src="/amc_logo_partner.png" alt="Logo ajouté" style={{ height: 50 }} />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div
          style={{
            background: 'var(--amc-white)',
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            width: '100%',
            maxWidth: 440,
            padding: '40px 36px',
          }}
        >
          <h2 style={{ textAlign: 'center', color: 'var(--amc-primary)', marginBottom: 8, fontSize: 24 }}>
            Connexion
          </h2>
          <p style={{ textAlign: 'center', color: '#6B7280', marginBottom: 24, fontSize: 14 }}>
            Portail d&apos;Inscription Scolaire AMC
          </p>

          <button
            type="button"
            className="btn btn-outline"
            style={{ width: '100%', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <FcGoogle size={20} />
            Se connecter avec Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
            <span style={{ margin: '0 12px', color: '#9CA3AF', fontSize: 12, fontWeight: 700 }}>OU</span>
            <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
          </div>

          {registrationMessage && (
            <div style={{
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              color: '#065F46',
              borderRadius: 10,
              padding: '16px 18px',
              marginBottom: 20,
              textAlign: 'center',
            }}>
              {registrationMessage}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>
                Email <span className="required">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <FiMail style={{ position: 'absolute', left: 12, top: 12, color: '#9CA3AF' }} />
                <input
                  type="email"
                  className="form-control"
                  style={{ paddingLeft: 38 }}
                  placeholder="votre@email.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>
                Mot de passe <span className="required">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <FiLock style={{ position: 'absolute', left: 12, top: 12, color: '#9CA3AF' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  style={{ paddingLeft: 38, paddingRight: 38 }}
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 10,
                    background: 'none',
                    border: 'none',
                    color: '#9CA3AF',
                  }}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? 'Connexion en cours...' : 'Se connecter avec Email'}
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 14 }}>
            <Link to="/forgot-password" style={{ color: '#213B88', fontWeight: 700 }}>Mot de passe oublié ?</Link>
            {registrationsBlocked
              ? <span style={{ color: '#B91C1C' }}>Inscriptions fermées</span>
              : <Link to="/register" style={{ color: '#6B7280' }}>Pas encore de compte ?</Link>
            }
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
        © {new Date().getFullYear()} Association Partage et des Musulmans de Clamart
      </div>
    </div>
  );
}