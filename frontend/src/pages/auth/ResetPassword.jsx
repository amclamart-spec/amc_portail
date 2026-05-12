import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get('token') || '';
    setToken(tokenParam);
  }, [searchParams]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) {
      toast.error('Token de réinitialisation manquant.');
      return;
    }

    setSubmitting(true);

    try {
      const { data } = await api.post('/auth/reset-password', {
        token,
        newPassword,
        confirmPassword,
      });
      toast.success(data.message || 'Mot de passe réinitialisé avec succès');
      navigate('/login');
    } catch (error) {
      const msg = error.response?.data?.error || 'Impossible de réinitialiser le mot de passe';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
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
        <img src="/amc_logo.png" alt="AMC" style={{ height: 50 }} />
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
            Réinitialisation du mot de passe
          </h2>
          <p style={{ textAlign: 'center', color: '#6B7280', marginBottom: 24, fontSize: 14 }}>
            Entrez un nouveau mot de passe pour votre compte.
          </p>

          {token ? (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>
                  Nouveau mot de passe <span className="required">*</span>
                </label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Nouveau mot de passe"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  Confirmer le mot de passe <span className="required">*</span>
                </label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Confirmer le mot de passe"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', marginTop: 8 }}
                disabled={submitting}
              >
                {submitting ? 'Réinitialisation...' : 'Changer le mot de passe'}
              </button>
            </form>
          ) : (
            <div style={{ color: '#ef4444', marginBottom: 20 }}>
              <p>Le lien de réinitialisation est invalide ou manquant.</p>
              <p>
                <Link to="/forgot-password" style={{ color: '#213B88', fontWeight: 700 }}>
                  Demander un nouveau lien
                </Link>
              </p>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14 }}>
            <Link to="/login" style={{ color: '#213B88', fontWeight: 700 }}>
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
        © {new Date().getFullYear()} Association des Musulmans de Clamart
      </div>
    </div>
  );
}
