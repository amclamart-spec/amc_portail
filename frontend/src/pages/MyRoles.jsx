import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { FiPlus } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABEL } from '../utils/roles';

const STATUS_BADGE = {
  PENDING: { label: 'En attente de validation', className: 'badge-warning' },
  APPROVED: { label: 'Actif', className: 'badge-success' },
  REJECTED: { label: 'Refusé', className: 'badge-danger' },
};

const REQUESTABLE_LABEL = { FAMILLE: 'Famille', PROFESSEUR: 'Professeur', BENEVOLE: 'Bénévole', OPERATEUR_SOCIAL: 'Opérateur Social' };

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

export default function MyRoles() {
  const { fetchUser } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/auth/me/roles');
      setData(d);
      setSelectedRole(d.requestableRoles?.[0] || '');
    } catch { toast.error('Impossible de charger vos rôles'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!selectedRole) return;
    setSaving(true);
    try {
      const { data: res } = await api.post('/auth/me/roles', { role: selectedRole });
      toast.success(res.message);
      setFormOpen(false);
      await load();
      await fetchUser();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  if (loading || !data) return <p>Chargement…</p>;

  const requestable = data.requestableRoles.filter(
    (r) => !data.roles.some((mine) => mine.role === r && mine.status !== 'REJECTED')
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Mes rôles</h2>
        {requestable.length > 0 && (
          <button className="btn btn-primary" onClick={() => { setFormOpen(true); setSelectedRole(requestable[0]); }}>
            <FiPlus size={14} /> Demander un rôle
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Rôle principal</h3></div>
        <div style={{ padding: 16 }}>
          <span className="badge badge-success">{ROLE_LABEL[data.primaryRole] || data.primaryRole}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Rôles supplémentaires</h3></div>
        <div className="table-container">
          <table>
            <thead><tr><th>Rôle</th><th>Statut</th><th>Demandé le</th><th>Traité le</th><th>Motif de refus</th></tr></thead>
            <tbody>
              {data.roles.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun rôle supplémentaire</td></tr>
              ) : data.roles.map((r) => (
                <tr key={r.role}>
                  <td style={{ fontWeight: 600 }}>{ROLE_LABEL[r.role] || REQUESTABLE_LABEL[r.role] || r.role}</td>
                  <td><span className={`badge ${STATUS_BADGE[r.status]?.className || 'badge-gray'}`}>{STATUS_BADGE[r.status]?.label || r.status}</span></td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td>{fmtDate(r.decidedAt)}</td>
                  <td>{r.status === 'REJECTED' ? (r.rejectionReason || '—') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Demander un nouveau rôle</h3><button className="btn btn-outline btn-sm" onClick={() => setFormOpen(false)}>Fermer</button></div>
            <form onSubmit={handleRequest} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Rôle *</label>
                <select className="form-control" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                  {requestable.map((r) => <option key={r} value={r}>{REQUESTABLE_LABEL[r] || r}</option>)}
                </select>
              </div>
              <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
                {selectedRole === 'FAMILLE'
                  ? "Le rôle Famille est ajouté immédiatement à votre compte."
                  : "Votre demande sera envoyée au responsable concerné pour validation avant d'être active."}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setFormOpen(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Envoyer la demande'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
