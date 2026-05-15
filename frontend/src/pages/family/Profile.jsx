import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function FamilyProfile() {
  const { user } = useAuth();
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    familyName: '', addressLine1: '', addressLine2: '', postalCode: '', city: '', country: 'France', phonePrimary: '', phoneSecondary: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    api.get('/family/profile').then(({ data }) => {
      setFamily(data.family);
      if (data.family) {
        setForm({
          familyName: data.family.familyName || '',
          addressLine1: data.family.addressLine1 || '',
          addressLine2: data.family.addressLine2 || '',
          postalCode: data.family.postalCode || '',
          city: data.family.city || '',
          country: data.family.country || 'France',
          phonePrimary: data.family.phonePrimary || '',
          phoneSecondary: data.family.phoneSecondary || '',
        });
      } else {
        setForm((f) => ({ ...f, familyName: user?.lastName || '' }));
      }
    }).catch(() => {
      setForm((f) => ({ ...f, familyName: user?.lastName || '' }));
    }).finally(() => setLoading(false));
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/family/profile', form);
      setFamily(data.family);
      toast.success('Profil mis à jour !');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur');
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/change-password', passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Mot de passe mis à jour !');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors du changement de mot de passe');
    }
  };

  const handleChange = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  const handlePasswordChange = (field) => (e) => setPasswordForm((p) => ({ ...p, [field]: e.target.value }));

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>Mon profil famille</h2>

      <div className="card">
        <div className="card-header">
          <h3>{family ? 'Modifier les informations' : 'Compléter votre profil'}</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nom de famille <span className="required">*</span></label>
            <input className="form-control" value={form.familyName} onChange={handleChange('familyName')} required />
          </div>

          <div className="form-group">
            <label>Adresse <span className="required">*</span></label>
            <input className="form-control" placeholder="Adresse ligne 1" value={form.addressLine1} onChange={handleChange('addressLine1')} required />
          </div>
          <div className="form-group">
            <label>Adresse (complément)</label>
            <input className="form-control" placeholder="Appartement, bâtiment..." value={form.addressLine2} onChange={handleChange('addressLine2')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Code postal <span className="required">*</span></label>
              <input className="form-control" value={form.postalCode} onChange={handleChange('postalCode')} required />
            </div>
            <div className="form-group">
              <label>Ville <span className="required">*</span></label>
              <input className="form-control" value={form.city} onChange={handleChange('city')} required />
            </div>
            <div className="form-group">
              <label>Pays <span className="required">*</span></label>
              <input className="form-control" value={form.country} onChange={handleChange('country')} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Téléphone principal <span className="required">*</span></label>
              <input className="form-control" value={form.phonePrimary} onChange={handleChange('phonePrimary')} required />
            </div>
            <div className="form-group">
              <label>Téléphone secondaire</label>
              <input className="form-control" value={form.phoneSecondary} onChange={handleChange('phoneSecondary')} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary mt-2">
            {family ? 'Mettre à jour' : 'Enregistrer le profil'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3>Changer le mot de passe</h3>
        </div>
        <form onSubmit={handlePasswordSubmit}>
          <div className="form-group">
            <label>Mot de passe actuel <span className="required">*</span></label>
            <input type="password" className="form-control" value={passwordForm.currentPassword} onChange={handlePasswordChange('currentPassword')} required />
          </div>
          <div className="form-group">
            <label>Nouveau mot de passe <span className="required">*</span></label>
            <input type="password" className="form-control" value={passwordForm.newPassword} onChange={handlePasswordChange('newPassword')} required />
          </div>
          <div className="form-group">
            <label>Confirmer le nouveau mot de passe <span className="required">*</span></label>
            <input type="password" className="form-control" value={passwordForm.confirmPassword} onChange={handlePasswordChange('confirmPassword')} required />
          </div>
          <button type="submit" className="btn btn-secondary mt-2">
            Mettre à jour le mot de passe
          </button>
        </form>
      </div>
    </div>
  );
}
