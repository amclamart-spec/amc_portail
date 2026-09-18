import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiSearch, FiDownload, FiFileText } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { RESPONSABLE_POLE_ROLES } from '../../utils/roles';

const STATUS_OPTIONS = [
  { value: 'PENDING',   label: 'En attente',  badge: 'badge-warning' },
  { value: 'VALIDATED', label: 'Validé',       badge: 'badge-success' },
  { value: 'REJECTED',  label: 'Refusé',       badge: 'badge-danger' },
];

const REASON_LABELS = { MALADE: 'Malade', VOYAGE: 'Voyage', AUTRE: 'Autre' };

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === status) || { label: status, badge: 'badge-info' };
  return <span className={`badge ${opt.badge}`}>{opt.label}</span>;
}

function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export default function AdminJustificatifs() {
  const { user } = useAuth();
  const isAdmin = !RESPONSABLE_POLE_ROLES.includes(user?.role);

  const [filter, setFilter]                 = useState('PENDING');
  const [studentName, setStudentName]       = useState('');
  const [poleId, setPoleId]                 = useState('');
  const [levelId, setLevelId]               = useState('');
  const [dateFrom, setDateFrom]             = useState('');
  const [dateTo, setDateTo]                 = useState('');
  const [poles, setPoles]                   = useState([]);
  const [justifications, setJustifications] = useState([]);
  const [loading, setLoading]               = useState(false);
  const [exporting, setExporting]           = useState('');

  // Pôles + niveaux imbriqués, pour le filtre en cascade — utile uniquement pour
  // l'admin (un responsable de pôle est déjà cantonné à son seul pôle côté serveur).
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/admin/poles')
      .then(({ data }) => setPoles(data.poles || []))
      .catch(() => {});
  }, [isAdmin]);

  const levelOptions = useMemo(() => {
    const pole = poles.find((p) => p.id === poleId);
    return pole?.levels || [];
  }, [poles, poleId]);

  const buildParams = (s = filter) => ({
    status: s,
    studentName: studentName.trim() || undefined,
    poleId: poleId || undefined,
    levelId: levelId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/absences/justifications', { params: buildParams() });
      setJustifications(data.justifications || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Impossible de charger les justificatifs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter, poleId, levelId, dateFrom, dateTo]);

  // Recherche par nom avec un léger debounce pour éviter une requête à chaque frappe
  useEffect(() => {
    const timeout = setTimeout(() => load(), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentName]);

  const handleDecision = async (evaluationId, status) => {
    try {
      await api.patch(`/admin/absences/${evaluationId}/justify`, { status });
      toast.success(status === 'VALIDATED' ? 'Justificatif validé' : 'Justificatif refusé');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const response = await api.get(`/admin/absences/justifications/export/${format}`, {
        params: buildParams(),
        responseType: 'blob',
      });
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      downloadBlob(response.data, `suivi-absences-${new Date().toISOString().slice(0, 10)}.${ext}`);
    } catch (e) {
      toast.error('Impossible de générer l\'export');
    } finally {
      setExporting('');
    }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Justificatifs d'absences</h2>

      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {isAdmin && (
            <select
              className="form-control"
              style={{ width: 180 }}
              value={poleId}
              onChange={(e) => { setPoleId(e.target.value); setLevelId(''); }}
            >
              <option value="">Tous les pôles</option>
              {poles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {isAdmin && (
            <select
              className="form-control"
              style={{ width: 180 }}
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
              disabled={!poleId}
            >
              <option value="">{poleId ? 'Tous les niveaux' : 'Choisir un pôle d\'abord'}</option>
              {levelOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <input
            type="date"
            className="form-control"
            style={{ width: 150 }}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Du"
          />
          <input
            type="date"
            className="form-control"
            style={{ width: 150 }}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Au"
          />
          <div style={{ position: 'relative', minWidth: 220 }}>
            <FiSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6B7280' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Rechercher un élève…"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => handleExport('excel')} disabled={!!exporting}>
              <FiDownload size={14} /> {exporting === 'excel' ? '…' : 'Excel'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => handleExport('pdf')} disabled={!!exporting}>
              <FiFileText size={14} /> {exporting === 'pdf' ? '…' : 'PDF'}
            </button>
          </div>
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
                  <th>Motif</th>
                  <th>Justificatif famille</th>
                  <th>Documents</th>
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
                    <td>{REASON_LABELS[j.absenceReason] || '-'}</td>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ fontSize: 13, color: 'var(--amc-text)', whiteSpace: 'pre-wrap' }}>
                        {j.familyJustification || '-'}
                      </div>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      {j.justificationDocuments && j.justificationDocuments.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {j.justificationDocuments.map((doc) => (
                            <a
                              key={doc.id}
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 12, color: 'var(--amc-primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}
                            >
                              📎 {doc.fileName}
                            </a>
                          ))}
                        </div>
                      ) : '-'}
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
