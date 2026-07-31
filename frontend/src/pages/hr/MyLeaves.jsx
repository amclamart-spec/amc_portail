import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiX, FiCalendar } from 'react-icons/fi';

const LEAVE_TYPES = [
  { value: 'CONGES_PAYES', label: 'Congés payés' },
  { value: 'MALADIE', label: 'Arrêt maladie' },
  { value: 'AUTRE', label: 'Autre' },
];
const LEAVE_TYPE_LABEL = Object.fromEntries(LEAVE_TYPES.map((t) => [t.value, t.label]));

const STATUS_BADGE = {
  PENDING: { label: 'En attente', className: 'badge-warning' },
  APPROVED: { label: 'Validé', className: 'badge-success' },
  REJECTED: { label: 'Refusé', className: 'badge-danger' },
};

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

const EMPTY_FORM = { type: 'CONGES_PAYES', startDate: '', endDate: '', reason: '' };

export default function HrMyLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/hr/me/leaves');
      setLeaves(data.leaves || []);
      setBalance(data.balance);
    } catch { toast.error('Impossible de charger vos congés'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) { toast.error('Dates de début et de fin requises'); return; }
    if (form.endDate < form.startDate) { toast.error('La date de fin doit être après la date de début'); return; }
    setSaving(true);
    try {
      await api.post('/hr/me/leaves', form);
      toast.success('Demande envoyée au Responsable RH');
      setFormOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleCancel = async (id) => {
    if (!confirm('Annuler cette demande de congé ?')) return;
    try {
      await api.delete(`/hr/me/leaves/${id}`);
      toast.success('Demande annulée');
      setLeaves((prev) => prev.filter((l) => l.id !== id));
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Mes congés</h2>
        <button className="btn btn-primary" onClick={() => setFormOpen(true)}><FiPlus size={14} /> Nouvelle demande</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon primary"><FiCalendar /></div>
          <div className="stat-info">
            <h4>{balance != null ? balance : '—'}</h4>
            <p>Solde de congés payés (jours)</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Historique de mes demandes</h3></div>
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Type</th><th>Période</th><th>Jours ouvrés</th><th>Statut</th><th>Motif refus</th><th>Actions</th></tr></thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucune demande de congé</td></tr>
                ) : leaves.map((l) => (
                  <tr key={l.id}>
                    <td>{LEAVE_TYPE_LABEL[l.type] || l.type}</td>
                    <td>{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</td>
                    <td>{l.daysCount}</td>
                    <td><span className={`badge ${STATUS_BADGE[l.status]?.className || 'badge-gray'}`}>{STATUS_BADGE[l.status]?.label || l.status}</span></td>
                    <td>{l.rejectionReason || '—'}</td>
                    <td>
                      {l.status === 'PENDING' && (
                        <button className="btn btn-sm btn-outline" onClick={() => handleCancel(l.id)}><FiX size={12} /> Annuler</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 440 }}>
            <div className="card-header"><h3>Nouvelle demande de congé</h3><button className="btn btn-outline btn-sm" onClick={() => setFormOpen(false)}>Fermer</button></div>
            <form onSubmit={handleSubmit} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Type *</label>
                <select className="form-control" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                  {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Date de début *</label>
                <input className="form-control" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Date de fin *</label>
                <input className="form-control" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Motif (optionnel)</label>
                <textarea className="form-control" rows={3} value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>
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
