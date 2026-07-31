import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCamera } from 'react-icons/fi';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : (import.meta.env.DEV ? 'http://localhost:4000' : '');

const photoSrc = (url) => (!url ? null : url.startsWith('http') ? url : `${BACKEND_ORIGIN}${url}`);

export default function VolunteerProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/volunteers/me');
      setProfile(data.volunteer);
      setForm({ firstName: data.volunteer.firstName, lastName: data.volunteer.lastName, phone: data.volunteer.phone || '' });
    } catch { toast.error('Impossible de charger votre profil'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoBase64(reader.result);
      setPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) { toast.error('Prénom et nom requis'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (photoBase64) payload.photoBase64 = photoBase64;
      const { data } = await api.put('/volunteers/me', payload);
      setProfile(data.volunteer);
      setPhotoBase64(null);
      setPhotoPreview(null);
      toast.success('Profil mis à jour');
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  if (loading) return <p>Chargement…</p>;

  const currentPhoto = photoPreview || photoSrc(profile?.photoUrl);

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Mon profil</h2>

      <div className="card" style={{ maxWidth: 520, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <label style={{ position: 'relative', cursor: 'pointer' }}>
            <div style={{
              width: 120, height: 120, borderRadius: '50%', overflow: 'hidden',
              background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '3px solid var(--amc-primary)',
            }}>
              {currentPhoto ? (
                <img src={currentPhoto} alt="Photo de profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--amc-primary)' }}>
                  {profile?.firstName?.[0]}{profile?.lastName?.[0]}
                </span>
              )}
            </div>
            <div style={{
              position: 'absolute', bottom: 0, right: 0, background: 'var(--amc-primary)', color: '#fff',
              borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #fff',
            }}>
              <FiCamera size={16} />
            </div>
            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </label>
        </div>

        <form onSubmit={handleSave} style={{ display: 'grid', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Prénom *</label>
            <input className="form-control" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Nom *</label>
            <input className="form-control" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Téléphone</label>
            <input className="form-control" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Email</label>
            <input className="form-control" value={profile?.email || ''} disabled />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: 8 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </div>
    </div>
  );
}
