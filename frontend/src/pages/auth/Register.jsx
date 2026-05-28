import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiCheckCircle } from 'react-icons/fi';
import { useEffect } from 'react';

const PROFILE_OPTIONS = [
  { value: 'FAMILLE', label: 'Famille' },
  { value: 'PROFESSEUR', label: 'Professeur' },
  { value: 'ADMIN', label: 'Administrateur' },
  { value: 'TRESORIER', label: 'Trésorier' },
];

export default function Register() {
  const { register, loading } = useAuth();
  const navigate = useNavigate();
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    profile: 'FAMILLE',
    accountOnly: false,
  });
  const [errors, setErrors] = useState({});
  const [registrationsBlocked, setRegistrationsBlocked] = useState(false);

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    fetch(`${apiBase}/enrollments/registration-block`).then((r) => r.json()).then((data) => {
      setRegistrationsBlocked(Boolean(data?.blocked));
    }).catch(() => {});
  }, []);

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'Prénom requis';
    if (!form.lastName.trim()) e.lastName = 'Nom requis';
    if (!form.email.trim()) e.email = 'Email requis';
    if (!form.phone.trim()) e.phone = 'Téléphone requis';
    if (form.password.length < 8) e.password = 'Minimum 8 caractères';
    if (!/[A-Z]/.test(form.password)) e.password = 'Au moins une majuscule requise';
    if (!/[0-9]/.test(form.password)) e.password = 'Au moins un chiffre requis';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Les mots de passe ne correspondent pas';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    if (form.profile === 'FAMILLE' && !form.accountOnly) {
      navigate('/register/famille-wizard', {
        state: {
          prefill: {
            firstName: form.firstName,
            lastName: form.lastName,
            email: form.email,
            phone: form.phone,
            password: form.password,
          },
        },
      });
      return;
    }

    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        password: form.password,
      };

      if (!(form.profile === 'FAMILLE' && form.accountOnly)) {
        payload.role = form.profile;
      }

      await register(payload);
      setSuccess(true);
    } catch {
      // géré dans le contexte
    }
  };

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #213B88 0%, #0088CC 100%)', padding: 20,
      }}>
        <div style={{
          background: 'var(--amc-white)', borderRadius: 12, padding: '48px 36px',
          maxWidth: 500, width: '100%', textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          <FiCheckCircle size={64} color="#22C55E" style={{ marginBottom: 16 }} />
          <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Inscription réussie !</h2>
          <p style={{ color: '#6B7280', marginBottom: 8 }}>
            Un email de vérification a été envoyé à votre adresse.
          </p>
          <div style={{
            background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8,
            padding: 16, margin: '24px 0', textAlign: 'left',
          }}>
            <strong>⏳ En attente de validation</strong>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#92400E' }}>
              Après vérification de votre email, votre compte devra être validé par l'administration.
            </p>
          </div>
          <Link to="/login" className="btn btn-primary" style={{ marginTop: 8 }}>
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #213B88 0%, #0088CC 100%)' }}>
      <div style={{ padding: '20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/amc_logo.png" alt="AMC" style={{ height: 50 }} />
          <img src="/amc_logo_partner.png" alt="Logo ajouté" style={{ height: 50 }} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{
          background: 'var(--amc-white)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          width: '100%', maxWidth: 560, padding: '36px',
        }}>
          <h2 style={{ textAlign: 'center', color: 'var(--amc-primary)', marginBottom: 8 }}>Créer un compte</h2>
          <p style={{ textAlign: 'center', color: '#6B7280', marginBottom: 24, fontSize: 14 }}>
            Portail d'Inscription Scolaire AMC
          </p>

          {registrationsBlocked && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
              Les inscriptions sont temporairement fermées. Vous pouvez créer un compte sans inscription complète en cochant "Option compte seul".
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Profil *</label>
              <select className="form-control" value={form.profile} onChange={handleChange('profile')}>
                {PROFILE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Prénom <span className="required">*</span></label>
                <input className={`form-control ${errors.firstName ? 'error' : ''}`} placeholder="Prénom" value={form.firstName} onChange={handleChange('firstName')} />
                {errors.firstName && <div className="form-error">{errors.firstName}</div>}
              </div>
              <div className="form-group">
                <label>Nom <span className="required">*</span></label>
                <input className={`form-control ${errors.lastName ? 'error' : ''}`} placeholder="Nom" value={form.lastName} onChange={handleChange('lastName')} />
                {errors.lastName && <div className="form-error">{errors.lastName}</div>}
              </div>
            </div>

            <div className="form-group">
              <label>Email <span className="required">*</span></label>
              <input type="email" className={`form-control ${errors.email ? 'error' : ''}`} placeholder="votre@email.fr" value={form.email} onChange={handleChange('email')} />
              {errors.email && <div className="form-error">{errors.email}</div>}
            </div>

            <div className="form-group">
              <label>Téléphone <span className="required">*</span></label>
              <input type="tel" className={`form-control ${errors.phone ? 'error' : ''}`} placeholder="06 XX XX XX XX" value={form.phone} onChange={handleChange('phone')} required />
              {errors.phone && <div className="form-error">{errors.phone}</div>}
            </div>

            <div className="form-group">
              <label>Mot de passe <span className="required">*</span></label>
              <input type="password" className={`form-control ${errors.password ? 'error' : ''}`} placeholder="Min. 8 car., 1 majuscule, 1 chiffre" value={form.password} onChange={handleChange('password')} />
              {errors.password && <div className="form-error">{errors.password}</div>}
            </div>

            <div className="form-group">
              <label>Confirmer le mot de passe <span className="required">*</span></label>
              <input type="password" className={`form-control ${errors.confirmPassword ? 'error' : ''}`} placeholder="Confirmez votre mot de passe" value={form.confirmPassword} onChange={handleChange('confirmPassword')} />
              {errors.confirmPassword && <div className="form-error">{errors.confirmPassword}</div>}
            </div>

            {form.profile === 'FAMILLE' && (
              <div className="form-group" style={{ marginTop: 14 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.accountOnly}
                    onChange={(e) => setForm((prev) => ({ ...prev, accountOnly: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Option compte seul
                </label>
                <div style={{ marginTop: 8, background: '#EEF2FF', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--amc-primary)' }}>
                  Créez uniquement le compte AMC maintenant et complétez l'inscription plus tard.
                </div>
              </div>
            )}

            {form.profile === 'FAMILLE' && !form.accountOnly && (
              <div style={{ background: '#EEF2FF', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--amc-primary)', marginBottom: 8 }}>
                Le profil <strong>Famille</strong> déclenche l'assistant complet d'inscription en 6 étapes.
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} disabled={loading || (registrationsBlocked && form.profile === 'FAMILLE' && !form.accountOnly)}>
              {loading
                ? 'Traitement...'
                : form.profile === 'FAMILLE'
                  ? form.accountOnly ? 'Créer le compte' : 'Suivant'
                  : "S'inscrire"}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14 }}>
            Déjà un compte ? <Link to="/login" style={{ fontWeight: 700 }}>Se connecter</Link>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
        © {new Date().getFullYear()} Association Partage et des Musulmans de Clamart
      </div>
    </div>
  );
}
