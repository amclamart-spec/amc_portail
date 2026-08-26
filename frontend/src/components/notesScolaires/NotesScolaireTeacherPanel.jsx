import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const STYLES = `
  .ns-t-content   { max-width:760px; }
  .ns-t-sec       { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); overflow:hidden; margin-bottom:16px; }
  .ns-t-sec-head  { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:11px 16px; background:var(--amc-light-bg-2); border-bottom:1px solid var(--amc-border); font-weight:700; font-size:13px; color:var(--amc-text); }
  .ns-t-sec-body  { padding:14px 16px; }
  .ns-t-note-row  { display:flex; align-items:center; gap:12px; padding:9px 0; border-bottom:1px solid var(--amc-border); }
  .ns-t-note-row:last-child { border-bottom:none; }
  .ns-t-note-badge { width:46px; height:46px; border-radius:50%; border:2.5px solid; display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; }
  .ns-t-note-badge strong { font-size:14px; font-weight:800; line-height:1; }
  .ns-t-note-badge span   { font-size:8px; color:#6B7280; line-height:1; margin-top:1px; }
`;

function noteColor(note, bareme) {
  const pct = (note / bareme) * 100;
  return pct >= 80 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
}

function noteBg(note, bareme) {
  const pct = (note / bareme) * 100;
  return pct >= 80 ? '#F0FDF4' : pct >= 50 ? '#FFFBEB' : '#FEF2F2';
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function NoteBadge({ note, bareme }) {
  const color = noteColor(note, bareme);
  return (
    <div className="ns-t-note-badge" style={{ borderColor: color, background: noteBg(note, bareme) }}>
      <strong style={{ color }}>{note}</strong>
      <span>/{bareme}</span>
    </div>
  );
}

export default function NotesScolaireTeacherPanel({ classId, periodOptions }) {
  const options = periodOptions && periodOptions.length > 0 ? periodOptions : [{ label: 'Année complète', value: 'ANNUEL' }];
  const [selectedPeriod, setSelectedPeriod] = useState(options[0].value);

  useEffect(() => {
    setSelectedPeriod(options[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, options[0]?.value]);

  const [classStudents, setClassStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const [notes, setNotes] = useState([]);
  const [bulletinUploads, setBulletinUploads] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

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
    setNotes([]);
    setBulletinUploads([]);
    if (!selectedStudentId) return;

    let cancelled = false;
    setLoadingData(true);
    Promise.all([
      api.get(`/notes-scolaires/${selectedStudentId}`),
      api.get(`/notes-scolaires/bulletin/${selectedStudentId}`),
    ])
      .then(([notesRes, uploadRes]) => {
        if (cancelled) return;
        setNotes(notesRes.data.notes || []);
        setBulletinUploads(uploadRes.data.uploads || []);
      })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger les notes scolaires de l\'élève'); })
      .finally(() => { if (!cancelled) setLoadingData(false); });

    return () => { cancelled = true; };
  }, [selectedStudentId]);

  const bulletinForPeriod = bulletinUploads.find((u) => u.period === selectedPeriod) || null;
  const notesForPeriod = notes.filter((n) => n.period === selectedPeriod);
  const notesByMatiere = notesForPeriod.reduce((acc, n) => {
    const k = n.matiere || 'Autre';
    if (!acc[k]) acc[k] = [];
    acc[k].push(n);
    return acc;
  }, {});

  return (
    <div className="ns-t-content">
      <style>{STYLES}</style>

      <div className="ns-t-sec">
        <div className="ns-t-sec-head">📝 Élève</div>
        <div className="ns-t-sec-body" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
          {options.length > 1 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Période</label>
              <select
                className="form-control"
                style={{ width: 'auto', minWidth: 160, maxWidth: '100%' }}
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
              >
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {!selectedStudentId ? (
        <div className="ns-t-sec"><div style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>Sélectionnez un élève pour consulter ses notes scolaires.</div></div>
      ) : loadingData ? (
        <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement…</p>
      ) : (
        <>
          <div className="ns-t-sec">
            <div className="ns-t-sec-head">📎 Bulletin scolaire importé</div>
            <div className="ns-t-sec-body">
              {bulletinForPeriod ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <a href={bulletinForPeriod.fileUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">📄 {bulletinForPeriod.fileName}</a>
                  <span style={{ fontSize: 11, color: '#6B7280' }}>importé le {fmtDate(bulletinForPeriod.createdAt)}</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#6B7280' }}>Aucun bulletin importé par la famille pour cette période.</div>
              )}
            </div>
          </div>

          {Object.keys(notesByMatiere).length === 0 ? (
            <div className="ns-t-sec"><div style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>Aucune note scolaire saisie par la famille pour cette période.</div></div>
          ) : (
            Object.entries(notesByMatiere).map(([mat, matNotes]) => {
              const valid = matNotes.filter((n) => n.note != null);
              const avgPct = valid.length > 0 ? valid.reduce((s, n) => s + (n.note / n.bareme) * 100, 0) / valid.length : null;
              return (
                <div key={mat} className="ns-t-sec">
                  <div className="ns-t-sec-head">
                    <span>{mat}</span>
                    {avgPct != null && <span style={{ color: noteColor(avgPct, 100), fontWeight: 800 }}>{(avgPct / 5).toFixed(1)}/20 moy.</span>}
                  </div>
                  <div className="ns-t-sec-body">
                    {[...matNotes].sort((a, b) => new Date(b.date) - new Date(a.date)).map((n) => (
                      <div key={n.id} className="ns-t-note-row">
                        <NoteBadge note={n.note} bareme={n.bareme} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amc-text)' }}>{fmtDate(n.date)}</div>
                          {n.commentaire && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{n.commentaire}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
