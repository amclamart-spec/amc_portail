import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiSearch, FiDownload, FiFileText, FiEdit2 } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { RESPONSABLE_POLE_ROLES } from '../../utils/roles';
import { openAbsenceDocument } from '../../utils/absenceDocument';

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
  // Commentaire de refus saisi par ligne (visible par la famille), et ligne refusée en cours d'édition.
  const [comments, setComments]             = useState({});
  const [editingCommentId, setEditingCommentId] = useState(null);

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
      // Justificatifs soumis à nouveau après un refus : en tête de liste, pour ne pas
      // les perdre parmi des absences plus récentes (ordre de date conservé ensuite).
      const list = data.justifications || [];
      const isResubmission = (j) => j.justificationStatus === 'PENDING' && j.rejectionCount > 0;
      setJustifications([...list.filter(isResubmission), ...list.filter((j) => !isResubmission(j))]);
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

  const setComment = (id, value) => setComments((prev) => ({ ...prev, [id]: value }));

  const handleDecision = async (evaluationId, status) => {
    try {
      await api.patch(`/admin/absences/${evaluationId}/justify`, { status, comment: status === 'REJECTED' ? (comments[evaluationId] || '') : undefined });
      toast.success(status === 'VALIDATED' ? 'Justificatif validé' : 'Justificatif refusé');
      setComments((prev) => { const next = { ...prev }; delete next[evaluationId]; return next; });
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  // Modification du commentaire d'un justificatif déjà refusé (statut inchangé).
  const handleSaveRejectionComment = async (evaluationId) => {
    try {
      await api.patch(`/admin/absences/${evaluationId}/justify`, { status: 'REJECTED', comment: comments[evaluationId] || '' });
      toast.success('Commentaire enregistré');
      setEditingCommentId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de l\'enregistrement');
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
                  {filter !== 'VALIDATED' && <th>Commentaire</th>}
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
                      {j.justificationStatus === 'PENDING' && j.rejectionCount > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <span className="badge badge-warning" style={{ fontSize: 11 }}>
                            🔁 Nouveau justificatif après {j.rejectionCount > 1 ? `${j.rejectionCount} refus` : 'refus'}
                          </span>
                          {j.rejectionComment && (
                            <div style={{ fontSize: 11, color: '#92400E', marginTop: 4, fontStyle: 'italic' }}>
                              Refus précédent : {j.rejectionComment}
                            </div>
                          )}
                        </div>
                      )}
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
                              onClick={(e) => openAbsenceDocument(e, doc)}
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
                      <td style={{ minWidth: 200 }}>
                        <textarea
                          className="form-control"
                          rows={2}
                          maxLength={1000}
                          placeholder="Motif du refus (visible par la famille)"
                          value={comments[j.id] || ''}
                          onChange={(e) => setComment(j.id, e.target.value)}
                          style={{ fontSize: 12 }}
                        />
                      </td>
                    )}
                    {filter === 'REJECTED' && (
                      <td style={{ minWidth: 200, maxWidth: 280 }}>
                        {editingCommentId === j.id ? (
                          <div style={{ display: 'grid', gap: 6 }}>
                            <textarea
                              className="form-control"
                              rows={2}
                              maxLength={1000}
                              value={comments[j.id] ?? ''}
                              onChange={(e) => setComment(j.id, e.target.value)}
                              style={{ fontSize: 12 }}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSaveRejectionComment(j.id)}>Enregistrer</button>
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingCommentId(null)}>Annuler</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            <div style={{ flex: 1, fontSize: 12, whiteSpace: 'pre-wrap', color: j.rejectionComment ? 'var(--amc-text)' : '#9CA3AF' }}>
                              {j.rejectionComment || 'Aucun commentaire'}
                            </div>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              title="Modifier le commentaire"
                              onClick={() => { setComment(j.id, j.rejectionComment || ''); setEditingCommentId(j.id); }}
                              style={{ padding: '2px 6px' }}
                            >
                              <FiEdit2 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
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
