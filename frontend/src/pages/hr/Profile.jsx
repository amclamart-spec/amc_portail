import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiFile, FiDownload } from 'react-icons/fi';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : (import.meta.env.DEV ? 'http://localhost:4000' : '');

const fileHref = (url) => (url?.startsWith('http') ? url : `${BACKEND_ORIGIN}${url}`);

export default function HrProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/hr/me');
      setProfile(data.employee);
      setForm({ firstName: data.employee.firstName, lastName: data.employee.lastName, phone: data.employee.phone || '' });
    } catch { toast.error('Impossible de charger votre profil'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) { toast.error('Prénom et nom requis'); return; }
    setSaving(true);
    try {
      const { data } = await api.put('/hr/me', form);
      setProfile(data.employee);
      toast.success('Profil mis à jour');
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  if (loading) return <p>Chargement…</p>;

  const contract = profile?.employee;

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Mon profil</h2>

      <div className="card" style={{ maxWidth: 520, padding: 24, marginBottom: 16 }}>
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

      <div className="card" style={{ maxWidth: 520, padding: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Mon contrat</h3>
        {contract?.contractFileUrl ? (
          <a href={fileHref(contract.contractFileUrl)} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FiFile size={14} /> {contract.contractFileName || 'Contrat'} <FiDownload size={14} />
          </a>
        ) : (
          <p style={{ color: '#6B7280', margin: 0 }}>Aucun contrat n'a encore été déposé par le Responsable RH.</p>
        )}
      </div>
    </div>
  );
}
