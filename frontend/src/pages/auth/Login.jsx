import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';

export default function Login() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch { /* handled in context */ }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(135deg, #213B88 0%, #0088CC 100%)',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 40px' }}>
        <img src="/amc_logo.png" alt="AMC" style={{ height: 50 }} />
      </div>

      {/* Main */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div style={{
          background: 'var(--amc-white)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          width: '100%', maxWidth: 440, padding: '40px 36px',
        }}>
          <h2 style={{ textAlign: 'center', color: 'var(--amc-primary)', marginBottom: 8, fontSize: 24 }}>
            Connexion
          </h2>
          <p style={{ textAlign: 'center', color: '#6B7280', marginBottom: 32, fontSize: 14 }}>
            Portail d'Inscription Scolaire AMC
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email <span className="required">*</span></label>
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
              <label>Mot de passe <span className="required">*</span></label>
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
                  style={{ position: 'absolute', right: 12, top: 10, background: 'none', border: 'none', color: '#9CA3AF' }}
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
              {loading ? 'Connexion en cours...' : 'Se connecter'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14 }}>
            <p style={{ color: '#6B7280' }}>
              Pas encore de compte ?{' '}
              <Link to="/register" style={{ fontWeight: 700 }}>S'inscrire</Link>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
        © {new Date().getFullYear()} Association des Musulmans de Clamart
      </div>
    </div>
  );
}
