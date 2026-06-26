import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { FiUser, FiLock, FiSave } from 'react-icons/fi';

const T = { primary: '#0f766e', light: '#f0fdfa', border: '#5eead4' };

export default function ProfesseurProfile() {
  const { user: authUser, fetchUser } = useAuth();

  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    api.get('/auth/profile')
      .then(({ data }) => {
        setForm({
          firstName: data.user.firstName || '',
          lastName: data.user.lastName || '',
          phone: data.user.phone || '',
          email: data.user.email || '',
        });
      })
      .catch(() => {
        setForm({
          firstName: authUser?.firstName || '',
          lastName: authUser?.lastName || '',
          phone: authUser?.phone || '',
          email: authUser?.email || '',
        });
      })
      .finally(() => setLoadingProfile(false));
  }, [authUser]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.put('/auth/profile', {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
      });
      await fetchUser();
      toast.success('Profil mis à jour !');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la mise à jour');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setSavingPassword(true);
    try {
      await api.post('/auth/change-password', passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Mot de passe mis à jour !');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors du changement de mot de passe');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleChange = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  const handlePasswordChange = (field) => (e) => setPasswordForm((p) => ({ ...p, [field]: e.target.value }));

  if (loadingProfile) return <p style={{ padding: 32, color: '#6B7280', textAlign: 'center' }}>Chargement…</p>;

  return (
    <div>
      <h2 style={{ color: T.primary, marginBottom: 24, fontSize: 20, fontWeight: 800 }}>
        <FiUser style={{ marginRight: 8, display: 'inline', verticalAlign: 'middle' }} />
        Mon profil
      </h2>

      <div className="card">
        <div className="card-header">
          <h3>Informations personnelles</h3>
        </div>
        <form onSubmit={handleProfileSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Prénom <span className="required">*</span></label>
              <input
                className="form-control"
                value={form.firstName}
                onChange={handleChange('firstName')}
                required
              />
            </div>
            <div className="form-group">
              <label>Nom <span className="required">*</span></label>
              <input
                className="form-control"
                value={form.lastName}
                onChange={handleChange('lastName')}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Adresse email</label>
            <input
              className="form-control"
              value={form.email}
              disabled
              style={{ background: '#F9FAFB', color: '#6B7280', cursor: 'not-allowed' }}
            />
            <small style={{ color: '#9CA3AF', fontSize: 12 }}>
              L'adresse email ne peut pas être modifiée directement.
            </small>
          </div>

          <div className="form-group">
            <label>Téléphone</label>
            <input
              className="form-control"
              value={form.phone}
              onChange={handleChange('phone')}
              placeholder="Ex: 06 12 34 56 78"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <button
              type="submit"
              className="btn"
              style={{ background: T.primary, color: '#fff' }}
              disabled={savingProfile}
            >
              <FiSave style={{ marginRight: 6, display: 'inline', verticalAlign: 'middle' }} />
              {savingProfile ? 'Enregistrement...' : 'Mettre à jour'}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3>
            <FiLock style={{ marginRight: 6, display: 'inline', verticalAlign: 'middle' }} />
            Changer le mot de passe
          </h3>
        </div>
        <form onSubmit={handlePasswordSubmit}>
          <div className="form-group">
            <label>Mot de passe actuel <span className="required">*</span></label>
            <input
              type="password"
              className="form-control"
              value={passwordForm.currentPassword}
              onChange={handlePasswordChange('currentPassword')}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Nouveau mot de passe <span className="required">*</span></label>
              <input
                type="password"
                className="form-control"
                value={passwordForm.newPassword}
                onChange={handlePasswordChange('newPassword')}
                required
              />
            </div>
            <div className="form-group">
              <label>Confirmer le nouveau mot de passe <span className="required">*</span></label>
              <input
                type="password"
                className="form-control"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange('confirmPassword')}
                required
              />
            </div>
          </div>
          <small style={{ color: '#6B7280', fontSize: 12, display: 'block', marginBottom: 16 }}>
            Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre.
          </small>
          <button
            type="submit"
            className="btn"
            style={{ background: T.primary, color: '#fff' }}
            disabled={savingPassword}
          >
            <FiLock style={{ marginRight: 6, display: 'inline', verticalAlign: 'middle' }} />
            {savingPassword ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
