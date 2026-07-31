import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheck, FiX } from 'react-icons/fi';

const LEAVE_TYPE_LABEL = {
  CONGES_PAYES: 'Congés payés',
  MALADIE: 'Arrêt maladie',
  AUTRE: 'Autre',
};

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

export default function HrLeaveRequests() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/hr/leaves/pending');
      setLeaves(data.leaves || []);
    } catch { toast.error('Impossible de charger les demandes de congé'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    try {
      await api.put(`/hr/leaves/${id}/decide`, { status: 'APPROVED' });
      toast.success('Congé validé');
      setLeaves((prev) => prev.filter((l) => l.id !== id));
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const openReject = (l) => { setRejectModal(l); setRejectReason(''); };
  const handleReject = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/hr/leaves/${rejectModal.id}/decide`, { status: 'REJECTED', rejectionReason: rejectReason });
      toast.success('Demande refusée');
      setLeaves((prev) => prev.filter((l) => l.id !== rejectModal.id));
      setRejectModal(null);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Demandes de congé</h2>

      <div className="card">
        <div className="card-header"><h3>En attente de validation ({leaves.length})</h3></div>
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Salarié</th><th>Type</th><th>Période</th><th>Jours ouvrés</th><th>Motif</th><th>Actions</th></tr></thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucune demande en attente</td></tr>
                ) : leaves.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.employee?.user?.lastName} {l.employee?.user?.firstName}</td>
                    <td>{LEAVE_TYPE_LABEL[l.type] || l.type}</td>
                    <td>{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</td>
                    <td>{l.daysCount}</td>
                    <td>{l.reason || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => handleApprove(l.id)}><FiCheck size={12} /> Valider</button>
                        <button className="btn btn-sm btn-danger" onClick={() => openReject(l)}><FiX size={12} /> Refuser</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Refuser le congé de {rejectModal.employee?.user?.firstName} {rejectModal.employee?.user?.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setRejectModal(null)}>Fermer</button></div>
            <form onSubmit={handleReject} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Motif (optionnel)</label>
                <textarea className="form-control" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setRejectModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-danger">Confirmer le refus</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
