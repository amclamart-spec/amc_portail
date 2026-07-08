import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheck, FiX } from 'react-icons/fi';

const STATUS_OPTIONS = [
  { value: 'PENDING',   label: 'En attente',  badge: 'badge-warning' },
  { value: 'VALIDATED', label: 'Validé',       badge: 'badge-success' },
  { value: 'REJECTED',  label: 'Refusé',       badge: 'badge-danger' },
];

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === status) || { label: status, badge: 'badge-info' };
  return <span className={`badge ${opt.badge}`}>{opt.label}</span>;
}

export default function AdminJustificatifs() {
  const [filter, setFilter]                 = useState('PENDING');
  const [justifications, setJustifications] = useState([]);
  const [loading, setLoading]               = useState(false);

  const load = async (s = filter) => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/absences/justifications', { params: { status: s } });
      setJustifications(data.justifications || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Impossible de charger les justificatifs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(filter); }, [filter]);

  const handleDecision = async (evaluationId, status) => {
    try {
      await api.patch(`/admin/absences/${evaluationId}/justify`, { status });
      toast.success(status === 'VALIDATED' ? 'Justificatif validé' : 'Justificatif refusé');
      load(filter);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Justificatifs d'absences</h2>

      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`btn btn-sm ${filter === opt.value ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p>
        ) : justifications.length === 0 ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>
            Aucun justificatif {STATUS_OPTIONS.find((o) => o.value === filter)?.label.toLowerCase() || ''}.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date absence</th>
                  <th>Élève</th>
                  <th>Famille</th>
                  <th>Cours</th>
                  <th>Justificatif famille</th>
                  <th>Note professeur</th>
                  <th>Statut</th>
                  {filter === 'PENDING' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {justifications.map((j) => (
                  <tr key={j.id}>
                    <td>{fmtDate(j.lessonDate)}</td>
                    <td style={{ fontWeight: 600 }}>{j.studentName}</td>
                    <td>{j.familyName}</td>
                    <td>{j.classLabel}</td>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ fontSize: 13, color: 'var(--amc-text)', whiteSpace: 'pre-wrap' }}>
                        {j.familyJustification || '-'}
                      </div>
                    </td>
                    <td style={{ maxWidth: 200, fontSize: 12, color: '#6B7280' }}>
                      {j.teacherJustification || '-'}
                    </td>
                    <td><StatusBadge status={j.justificationStatus} /></td>
                    {filter === 'PENDING' && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            title="Valider"
                            onClick={() => handleDecision(j.id, 'VALIDATED')}
                            style={{ padding: '4px 10px' }}
                          >
                            <FiCheck size={14} /> Valider
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            title="Refuser"
                            onClick={() => handleDecision(j.id, 'REJECTED')}
                            style={{ padding: '4px 10px' }}
                          >
                            <FiX size={14} /> Refuser
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
