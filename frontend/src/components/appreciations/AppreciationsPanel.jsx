import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const STYLES = `
  .apr-card      { padding:12px 14px; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); background:#fff; margin-bottom:12px; }
  .apr-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
  .apr-stars     { display:inline-flex; gap:2px; }
  .apr-star      { font-size:18px; line-height:1; background:none; border:none; padding:0; cursor:pointer; color:#D1D5DB; }
  .apr-star.filled { color:#F59E0B; }
  .apr-star:disabled { cursor:default; }
  .apr-rating-row { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--amc-text); }
  .apr-rating-label { min-width:110px; font-weight:600; }
`;

export function StarRating({ value, onChange, size = 18 }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <span className="apr-stars">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          className={`apr-star${n <= value ? ' filled' : ''}`}
          style={{ fontSize: size }}
          disabled={!onChange}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          onClick={onChange ? () => onChange(n) : undefined}
        >
          ★
        </button>
      ))}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function AppreciationsPanel({ classId }) {
  const [classStudents, setClassStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const [appreciations, setAppreciations] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [commentaire, setCommentaire] = useState('');
  const [noteTravail, setNoteTravail] = useState(0);
  const [noteComportement, setNoteComportement] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedStudentId('');
    setClassStudents([]);
    if (!classId) return;

    let cancelled = false;
    setLoadingStudents(true);
    api.get('/absences/class-students', { params: { classId } })
      .then(({ data }) => { if (!cancelled) setClassStudents(data.students || []); })
      .catch(() => {
        if (cancelled) return;
        setClassStudents([]);
        toast.error('Impossible de charger les élèves de la classe');
      })
      .finally(() => { if (!cancelled) setLoadingStudents(false); });

    return () => { cancelled = true; };
  }, [classId]);

  useEffect(() => {
    setAppreciations([]);
    setCommentaire('');
    setNoteTravail(0);
    setNoteComportement(0);
    if (!selectedStudentId) return;

    let cancelled = false;
    setLoadingData(true);
    api.get(`/appreciations/${selectedStudentId}`)
      .then(({ data }) => { if (!cancelled) setAppreciations(data.appreciations || []); })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger les appréciations de l\'élève'); })
      .finally(() => { if (!cancelled) setLoadingData(false); });

    return () => { cancelled = true; };
  }, [selectedStudentId]);

  const handleSubmit = async () => {
    if (!noteTravail || !noteComportement) {
      toast.error('Notez le travail et le comportement (1 à 5 étoiles)');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/appreciations', {
        studentId: selectedStudentId,
        classId,
        commentaire: commentaire || undefined,
        noteTravail,
        noteComportement,
      });
      setAppreciations((prev) => [data.appreciation, ...prev]);
      setCommentaire('');
      setNoteTravail(0);
      setNoteComportement(0);
      toast.success('Appréciation enregistrée');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette appréciation ?')) return;
    try {
      await api.delete(`/appreciations/${id}`);
      setAppreciations((prev) => prev.filter((a) => a.id !== id));
      toast.success('Appréciation supprimée');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  return (
    <div>
      <style>{STYLES}</style>

      <div className="ep-sec">
        <div className="ep-sec-head">⭐ Élève</div>
        <div className="ep-sec-body">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Élève</label>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: 180, maxWidth: '100%' }}
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              disabled={loadingStudents}
            >
              <option value="">{loadingStudents ? 'Chargement…' : 'Choisir un élève…'}</option>
              {classStudents.map((s) => <option key={s.studentId} value={s.studentId}>{s.studentName}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!selectedStudentId ? (
        <div className="ep-sec"><div style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>Sélectionnez un élève pour saisir ou consulter ses appréciations.</div></div>
      ) : loadingData ? (
        <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement…</p>
      ) : (
        <>
          <div className="ep-sec">
            <div className="ep-sec-head">➕ Nouvelle appréciation</div>
            <div className="ep-sec-body" style={{ display: 'grid', gap: 12 }}>
              <div className="apr-rating-row">
                <span className="apr-rating-label">Travail</span>
                <StarRating value={noteTravail} onChange={setNoteTravail} size={22} />
              </div>
              <div className="apr-rating-row">
                <span className="apr-rating-label">Comportement</span>
                <StarRating value={noteComportement} onChange={setNoteComportement} size={22} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Commentaire (optionnel)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Votre appréciation sur cette période…"
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={handleSubmit}>
                  {saving ? 'Enregistrement…' : 'Enregistrer l\'appréciation'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--amc-text)', marginBottom: 10 }}>
              Historique ({appreciations.length})
            </div>
            {appreciations.length === 0 ? (
              <div className="ep-sec"><div style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>Aucune appréciation enregistrée pour le moment.</div></div>
            ) : (
              appreciations.map((a) => (
                <div key={a.id} className="apr-card">
                  <div className="apr-card-head">
                    <div>
                      <strong style={{ fontSize: 13 }}>{fmtDate(a.date)}</strong>
                      {a.vu ? (
                        <span className="badge badge-success" style={{ marginLeft: 8 }}>✓ Vue par la famille</span>
                      ) : (
                        <span className="badge badge-gray" style={{ marginLeft: 8 }}>Non vue</span>
                      )}
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => handleDelete(a.id)}>🗑️</button>
                  </div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: a.commentaire ? 8 : 0 }}>
                    <div className="apr-rating-row"><span className="apr-rating-label">Travail</span><StarRating value={a.noteTravail} /></div>
                    <div className="apr-rating-row"><span className="apr-rating-label">Comportement</span><StarRating value={a.noteComportement} /></div>
                  </div>
                  {a.commentaire && (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--amc-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.commentaire}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
