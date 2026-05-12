import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      toast.success(data.message || 'Un email de réinitialisation a été envoyé si le compte existe.');
      setEmail('');
    } catch (error) {
      const msg = error.response?.data?.error || 'Impossible d\'envoyer le lien de réinitialisation';
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
            Mot de passe oublié
          </h2>
          <p style={{ textAlign: 'center', color: '#6B7280', marginBottom: 24, fontSize: 14 }}>
            Entrez votre email pour recevoir un lien de réinitialisation.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>
                Email <span className="required">*</span>
              </label>
              <input
                type="email"
                className="form-control"
                placeholder="votre@email.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 8 }}
              disabled={submitting}
            >
              {submitting ? 'Envoi en cours...' : 'Envoyer le lien'}
            </button>
          </form>

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
