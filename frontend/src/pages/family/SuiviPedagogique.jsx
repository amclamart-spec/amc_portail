import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import CoranFamilyPanel from '../../components/coran/CoranFamilyPanel';

/* ─── styles ────────────────────────────────────────────────────────────────── */
const STYLES = `
  .sp-header    { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px; }
  .sp-pills     { display:flex; gap:8px; flex-wrap:wrap; }
  .sp-tabs      { display:grid; grid-template-columns:repeat(4,1fr); border-radius:var(--amc-border-radius-lg); overflow:hidden; border:1px solid var(--amc-border); background:var(--amc-light-bg-2); margin-bottom:18px; box-shadow:var(--amc-shadow); }
  .sp-tab       { display:flex; flex-direction:column; align-items:center; gap:3px; padding:10px 6px; border:none; cursor:pointer; background:transparent; color:#6B7280; font-family:var(--amc-font-family); font-size:11px; font-weight:500; transition:background .15s,color .15s; line-height:1.2; text-align:center; }
  .sp-tab.active{ background:var(--amc-primary); color:#fff; font-weight:700; }
  .sp-tab-icon  { font-size:16px; line-height:1; }
  .sp-tab + .sp-tab { border-left:1px solid var(--amc-border); }
  .sp-tab.active + .sp-tab { border-left-color:var(--amc-primary); }
  .sp-sec       { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); overflow:hidden; margin-bottom:12px; }
  .sp-sec-head  { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 14px; background:var(--amc-light-bg-2); border-bottom:1px solid var(--amc-border); font-weight:700; font-size:13px; color:var(--amc-text); }
  .sp-sec-body  { padding:12px 14px; }
  .sp-note-row  { display:flex; align-items:flex-start; gap:10px; padding:8px 10px; border-radius:var(--amc-border-radius); margin-bottom:6px; }
  .sp-note-row:last-child { margin-bottom:0; }
  .sp-hw-card   { padding:9px 10px; background:var(--amc-light-bg-2); border-radius:var(--amc-border-radius); border:1px solid var(--amc-border); margin-bottom:8px; }
  .sp-hw-card:last-child { margin-bottom:0; }
  .sp-link-btn  { font-size:12px; color:var(--amc-primary); background:none; border:none; cursor:pointer; font-weight:700; font-family:var(--amc-font-family); padding:0; }
  .sp-link-btn:hover { text-decoration:underline; }
  .sp-pill-btn  { display:inline-flex; align-items:center; gap:7px; padding:5px 12px 5px 5px; border-radius:999px; border:none; cursor:pointer; font-family:var(--amc-font-family); font-weight:600; font-size:13px; transition:all .15s; white-space:nowrap; }
  .sp-avg-badge { display:inline-flex; align-items:center; gap:8px; padding:4px 12px; border-radius:var(--amc-border-radius); border:1px solid var(--amc-border); }
  .sp-empty     { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); padding:32px 16px; text-align:center; }
  .sp-course-chip { display:inline-block; background:#DBEAFE; color:#1E40AF; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; border:1px solid #BFDBFE; margin:3px; }
  .sp-dash-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:14px; }
  .sp-notes-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:12px; }
  .sp-ab-card   { border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); overflow:hidden; margin-bottom:10px; background:#fff; }
  .sp-ab-head   { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:10px 14px; }
  .sp-ab-meta   { font-size:12px; color:#6B7280; margin-top:2px; }
  .sp-ab-justif { padding:10px 14px; background:#F8FAFC; border-top:1px solid var(--amc-border); }
  .sp-justify-form { padding:10px 14px; border-top:1px solid var(--amc-border); }
  .sp-hw-full   { padding:10px 14px; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); background:#fff; margin-bottom:12px; }
  .sp-hw-header { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:9px 14px; background:#DBEAFE; border-bottom:1px solid #BFDBFE; border-radius:var(--amc-border-radius-lg) var(--amc-border-radius-lg) 0 0; }
  .sp-hw-body   { padding:12px 14px; }

  @media(max-width:600px){
    .sp-tab-label { font-size:9px; }
    .sp-dash-grid { grid-template-columns:1fr; }
  }
  @media(max-width:480px){
    .sp-notes-grid { grid-template-columns:1fr; }
    .sp-header     { flex-direction:column; align-items:flex-start; }
  }
`;

/* ─── helpers ───────────────────────────────────────────────────────────────── */
function gradeColor(g, max = 10) {
  if (g == null) return '#6B7280';
  const pct = (g / max) * 100;
  return pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#DC2626';
}
function gradeBg(g, max = 10) {
  if (g == null) return 'var(--amc-light-bg-2)';
  const pct = (g / max) * 100;
  return pct >= 80 ? '#F0FDF4' : pct >= 60 ? '#FFFBEB' : '#FEF2F2';
}
function fmtDate(d, opts) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', opts || { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── sub-components ────────────────────────────────────────────────────────── */
function Avatar({ name, size = 28 }) {
  const initial = String(name || '?')[0].toUpperCase();
  const palette = ['#213B88', '#0088CC', '#0891B2', '#059669', '#7C3AED', '#D97706'];
  const bg = palette[initial.charCodeAt(0) % palette.length];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.42), fontWeight: 800, flexShrink: 0, userSelect: 'none' }}>
      {initial}
    </div>
  );
}

function NoteCircle({ grade, max = 10, size = 42 }) {
  const color = gradeColor(grade, max);
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', border: `2.5px solid ${color}`, background: gradeBg(grade, max), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: Math.round(size * 0.29), fontWeight: 800, color, lineHeight: 1 }}>{grade != null ? grade : '—'}</span>
      <span style={{ fontSize: 8, color: '#6B7280', lineHeight: 1 }}>/{max}</span>
    </div>
  );
}

function JustifBadge({ status }) {
  const map = {
    NONE:      { label: 'Non justifiée',    cls: 'badge-danger' },
    PENDING:   { label: 'En attente',        cls: 'badge-warning' },
    VALIDATED: { label: '✓ Justifiée',       cls: 'badge-success' },
    REJECTED:  { label: '✗ Refusée',         cls: 'badge-danger' },
  };
  const { label, cls } = map[status] || map.NONE;
  return <span className={`badge ${cls}`}>{label}</span>;
}

const TABS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
  { id: 'absences',  label: 'Absences',         icon: '📅' },
  { id: 'notes',     label: 'Notes',             icon: '⭐' },
  { id: 'devoirs',   label: 'Devoirs',           icon: '📚' },
];

/* ─── AbsenceCard ───────────────────────────────────────────────────────────── */
function AbsenceCard({ absence, onJustified }) {
  const [open, setOpen]       = useState(false);
  const [comment, setComment] = useState('');
  const [saving, setSaving]   = useState(false);

  const canJustify = absence.justificationStatus === 'NONE' || absence.justificationStatus === 'REJECTED';
  const borderColor = absence.justificationStatus === 'VALIDATED'
    ? '#16A34A'
    : absence.justificationStatus === 'PENDING'
      ? '#D97706'
      : '#DC2626';

  const handleSubmit = async () => {
    if (!comment.trim()) { toast.error('Veuillez saisir un commentaire'); return; }
    setSaving(true);
    try {
      await api.post(`/family/pedagogy/absences/${absence.id}/justify`, { comment });
      toast.success('Justificatif envoyé — en attente de validation');
      setOpen(false);
      setComment('');
      if (typeof onJustified === 'function') onJustified();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Impossible d\'envoyer le justificatif');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sp-ab-card" style={{ borderLeft: `4px solid ${borderColor}` }}>
      {/* En-tête */}
      <div className="sp-ab-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {absence.lessonTitle || 'Leçon'}
          </div>
          <div className="sp-ab-meta">{absence.classLabel} · {fmtDate(absence.date, { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <JustifBadge status={absence.justificationStatus} />
          {canJustify && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen((v) => !v)}>
              {open ? 'Annuler' : '✏️ Justifier'}
            </button>
          )}
        </div>
      </div>

      {/* Justificatif famille déjà soumis */}
      {absence.familyJustification && (
        <div className="sp-ab-justif">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>Votre justificatif</div>
          <div style={{ fontSize: 13, color: 'var(--amc-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {absence.familyJustification}
          </div>
          {absence.justificationStatus === 'REJECTED' && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#DC2626', fontStyle: 'italic' }}>
              Ce justificatif a été refusé. Vous pouvez en soumettre un nouveau.
            </div>
          )}
        </div>
      )}

      {/* Note professeur */}
      {absence.justification && (
        <div className="sp-ab-justif" style={{ background: '#F0FDF4' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>Note du professeur</div>
          <div style={{ fontSize: 13, color: '#166534', fontStyle: 'italic' }}>{absence.justification}</div>
        </div>
      )}

      {/* Formulaire */}
      {open && (
        <div className="sp-justify-form">
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            Motif d'absence
          </label>
          <textarea
            className="form-control"
            rows={3}
            placeholder="Expliquez le motif de l'absence (maladie, rendez-vous médical…)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            style={{ marginBottom: 8, fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Annuler</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── main ──────────────────────────────────────────────────────────────────── */
export default function FamilyPedagogy() {
  const [students,          setStudents]          = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [tab,               setTab]               = useState('dashboard');
  const [loading,           setLoading]           = useState(true);
  const [dataLoading,       setDataLoading]       = useState(false);
  const [error,             setError]             = useState('');
  const [absences,          setAbsences]          = useState([]);
  const [homeworks,         setHomeworks]         = useState([]);
  const [notes,             setNotes]             = useState([]);

  useEffect(() => {
    api.get('/family/pedagogy/students')
      .then(({ data }) => {
        const s = data.students || [];
        setStudents(s);
        if (s.length > 0) setSelectedStudentId(s[0].id);
      })
      .catch(() => setError('Impossible de charger vos élèves.'))
      .finally(() => setLoading(false));
  }, []);

  const loadData = (studentId) => {
    if (!studentId) return;
    setDataLoading(true);
    setError('');
    Promise.all([
      api.get('/family/pedagogy/absences', { params: { studentId } }),
      api.get('/family/pedagogy/homework',  { params: { studentId } }),
      api.get('/family/pedagogy/notes',     { params: { studentId } }),
    ])
      .then(([absRes, hwRes, notesRes]) => {
        setAbsences(absRes.data.absences  || []);
        setHomeworks(hwRes.data.homeworks || []);
        setNotes(notesRes.data.notes      || []);
      })
      .catch((e) => setError(e.response?.data?.error || 'Erreur lors du chargement.'))
      .finally(() => setDataLoading(false));
  };

  useEffect(() => { loadData(selectedStudentId); }, [selectedStudentId]);

  const reloadAbsences = () => {
    api.get('/family/pedagogy/absences', { params: { studentId: selectedStudentId } })
      .then(({ data }) => setAbsences(data.absences || []));
  };

  /* ── derived ── */
  const selectedStudent  = students.find((s) => s.id === selectedStudentId);
  const validGrades      = notes.filter((n) => n.grade != null);
  const avgGrade         = validGrades.length > 0
    ? (validGrades.reduce((s, n) => s + Number(n.grade), 0) / validGrades.length).toFixed(1)
    : null;
  const recentNotes      = [...notes].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
  const recentHomeworks  = [...homeworks].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
  const notesByMatiere   = notes.reduce((acc, n) => {
    const k = n.classLabel || 'Autre';
    if (!acc[k]) acc[k] = [];
    acc[k].push(n);
    return acc;
  }, {});
  const pendingCount = absences.filter((a) => a.justificationStatus === 'PENDING').length;
  const hasCoranEnrollment = (selectedStudent?.enrollments || []).some((e) => (e.classLabel || '').toLowerCase().includes('coran'));
  const visibleTabs = hasCoranEnrollment ? [...TABS, { id: 'coran', label: 'Suivi Coran', icon: '📖' }] : TABS;

  if (loading) return <p style={{ padding: 32, color: '#6B7280', textAlign: 'center' }}>Chargement…</p>;

  if (students.length === 0) {
    return (
      <div className="sp-empty">
        <div style={{ fontSize: 40, marginBottom: 12 }}>👨‍👩‍👧‍👦</div>
        <p style={{ color: '#6B7280' }}>
          Aucun enfant associé à votre compte.<br />
          Ajoutez un enfant dans <strong>Mes enfants</strong> pour accéder au suivi pédagogique.
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{STYLES}</style>

      {/* ── header ── */}
      <div className="sp-header">
        <h2 style={{ margin: 0, color: 'var(--amc-primary)', fontSize: 20, fontWeight: 800 }}>Suivi pédagogique</h2>
        <div className="sp-pills">
          {students.map((s) => {
            const active = s.id === selectedStudentId;
            return (
              <button key={s.id} className="sp-pill-btn"
                onClick={() => { setSelectedStudentId(s.id); setTab('dashboard'); }}
                style={{ background: active ? 'var(--amc-primary)' : '#fff', color: active ? '#fff' : 'var(--amc-text)', boxShadow: active ? '0 2px 8px rgba(33,59,136,.3)' : 'var(--amc-shadow)', outline: `1.5px solid ${active ? 'var(--amc-primary)' : 'var(--amc-border)'}` }}
              >
                <Avatar name={s.firstName} size={26} />
                {s.firstName || 'Élève'}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="sp-tabs" style={{ gridTemplateColumns: `repeat(${visibleTabs.length},1fr)` }}>
        {visibleTabs.map((t) => (
          <button key={t.id} className={`sp-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="sp-tab-icon">{t.icon}</span>
            <span className="sp-tab-label">
              {t.label}
              {t.id === 'absences' && pendingCount > 0 && (
                <span style={{ marginLeft: 4, background: '#DC2626', color: '#fff', borderRadius: 999, padding: '0 5px', fontSize: 10 }}>{pendingCount}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div style={{ display: 'block', padding: '8px 12px', borderRadius: 'var(--amc-border-radius)', marginBottom: 12, fontSize: 13, background: '#FEF3C7', color: '#92400E' }}>
          ⚠️ {error}
        </div>
      )}

      {dataLoading ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>Chargement des données…</p>
      ) : (
        <>
          {/* ════════ DASHBOARD ════════ */}
          {tab === 'dashboard' && (
            <div>
              <div className="stats-grid" style={{ marginBottom: 16 }}>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('absences')}>
                  <div className={`stat-icon ${absences.length > 0 ? 'danger' : 'success'}`}>📅</div>
                  <div className="stat-info">
                    <h4 style={{ color: absences.length > 0 ? 'var(--amc-danger)' : 'var(--amc-success)' }}>{absences.length}</h4>
                    <p>Absence{absences.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon warning">⭐</div>
                  <div className="stat-info">
                    <h4 style={{ color: avgGrade != null ? gradeColor(Number(avgGrade)) : '#6B7280' }}>
                      {avgGrade != null ? `${avgGrade}/10` : '—'}
                    </h4>
                    <p>Moyenne générale</p>
                  </div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('devoirs')}>
                  <div className="stat-icon primary">📚</div>
                  <div className="stat-info">
                    <h4>{homeworks.length}</h4>
                    <p>Devoir{homeworks.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon primary">📖</div>
                  <div className="stat-info">
                    <h4>{selectedStudent?.enrollments?.length ?? 0}</h4>
                    <p>Cours inscrits</p>
                  </div>
                </div>
              </div>

              <div className="sp-dash-grid">
                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                  {selectedStudent?.enrollments?.length > 0 && (
                    <div className="sp-sec">
                      <div className="sp-sec-head">📖 Cours inscrits</div>
                      <div style={{ padding: '10px 12px' }}>
                        {selectedStudent.enrollments.map((e) => (
                          <span key={e.id} className="sp-course-chip">{e.classLabel || 'Cours'}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {recentNotes.length > 0 && (
                    <div className="sp-sec">
                      <div className="sp-sec-head">
                        ⭐ Dernières notes
                        <button className="sp-link-btn" onClick={() => setTab('notes')}>Voir tout →</button>
                      </div>
                      <div className="sp-sec-body">
                        {recentNotes.map((n) => (
                          <div key={n.id} className="sp-note-row" style={{ background: gradeBg(n.grade) }}>
                            <NoteCircle grade={n.grade} size={40} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{n.lessonTitle || 'Évaluation'}</div>
                              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{n.classLabel} · {fmtDate(n.date)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Absences récentes dans le dashboard */}
                  {absences.length > 0 && (
                    <div className="sp-sec">
                      <div className="sp-sec-head">
                        📅 Absences récentes
                        <button className="sp-link-btn" onClick={() => setTab('absences')}>Voir tout →</button>
                      </div>
                      <div className="sp-sec-body">
                        {[...absences].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3).map((a) => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--amc-border)' }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(a.date, { day: '2-digit', month: 'short' })}<span style={{ fontWeight: 400, color: '#6B7280', marginLeft: 6 }}>{a.classLabel}</span></div>
                            <JustifBadge status={a.justificationStatus} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {recentHomeworks.length > 0 && (
                  <div className="sp-sec" style={{ alignSelf: 'start' }}>
                    <div className="sp-sec-head">
                      📚 Derniers devoirs
                      <button className="sp-link-btn" onClick={() => setTab('devoirs')}>Voir tout →</button>
                    </div>
                    <div className="sp-sec-body">
                      {recentHomeworks.map((hw) => (
                        <div key={hw.id} className="sp-hw-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                            <strong style={{ fontSize: 12, color: 'var(--amc-primary)' }}>{hw.classLabel || 'Classe'}</strong>
                            <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>{fmtDate(hw.date, { day: '2-digit', month: 'short' })}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--amc-text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.5 }}>
                            {hw.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {recentNotes.length === 0 && recentHomeworks.length === 0 && absences.length === 0 && (
                <div className="sp-empty">
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                  <p style={{ color: '#6B7280', fontSize: 14 }}>Aucune donnée pédagogique disponible pour le moment.</p>
                </div>
              )}
            </div>
          )}

          {/* ════════ ABSENCES ════════ */}
          {tab === 'absences' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, color: 'var(--amc-primary)', fontSize: 16 }}>
                  Absences — {selectedStudent?.firstName}
                </h3>
                {absences.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-danger">{absences.length} absence{absences.length > 1 ? 's' : ''}</span>
                    {pendingCount > 0 && <span className="badge badge-warning">{pendingCount} en attente</span>}
                  </div>
                )}
              </div>

              {absences.length === 0 ? (
                <div className="sp-empty">
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                  <p style={{ color: '#16A34A', fontWeight: 700 }}>Aucune absence enregistrée — excellent !</p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>
                    Cliquez sur <strong>Justifier</strong> pour soumettre un motif d'absence. Le justificatif sera examiné par l'administrateur.
                  </p>
                  {[...absences].sort((a, b) => new Date(b.date) - new Date(a.date)).map((absence) => (
                    <AbsenceCard key={absence.id} absence={absence} onJustified={reloadAbsences} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════════ NOTES ════════ */}
          {tab === 'notes' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, color: 'var(--amc-primary)', fontSize: 16 }}>Notes — {selectedStudent?.firstName}</h3>
                {avgGrade != null && (
                  <div className="sp-avg-badge" style={{ background: gradeBg(Number(avgGrade)) }}>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>Moyenne générale</span>
                    <span style={{ fontWeight: 800, fontSize: 17, color: gradeColor(Number(avgGrade)) }}>
                      {avgGrade}<span style={{ fontSize: 11, fontWeight: 400, color: '#6B7280' }}>/10</span>
                    </span>
                  </div>
                )}
              </div>
              {notes.length === 0 ? (
                <div className="sp-empty">
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
                  <p style={{ color: '#6B7280', fontSize: 14 }}>Aucune note disponible pour le moment.</p>
                </div>
              ) : (
                <div className="sp-notes-grid">
                  {Object.entries(notesByMatiere).map(([matiere, matiereNotes]) => {
                    const valid = matiereNotes.filter((n) => n.grade != null);
                    const mAvg  = valid.length > 0 ? valid.reduce((s, n) => s + Number(n.grade), 0) / valid.length : null;
                    const pct   = mAvg != null ? (mAvg / 10) * 100 : 0;
                    return (
                      <div key={matiere} className="sp-sec" style={{ marginBottom: 0 }}>
                        <div className="sp-sec-head">
                          {matiere}
                          {mAvg != null && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 52, height: 5, background: 'var(--amc-border)', borderRadius: 999, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: gradeColor(mAvg), borderRadius: 999 }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: gradeColor(mAvg) }}>{mAvg.toFixed(1)}/10</span>
                            </div>
                          )}
                        </div>
                        <div className="sp-sec-body">
                          {[...matiereNotes].sort((a, b) => new Date(b.date) - new Date(a.date)).map((n) => (
                            <div key={n.id} className="sp-note-row" style={{ background: gradeBg(n.grade) }}>
                              <NoteCircle grade={n.grade} size={42} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{n.lessonTitle || 'Évaluation'}</div>
                                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{fmtDate(n.date)}</div>
                                {n.appreciation && (
                                  <div style={{ marginTop: 5, fontSize: 12, fontStyle: 'italic', color: 'var(--amc-text)', borderLeft: `3px solid ${gradeColor(n.grade)}`, paddingLeft: 8, lineHeight: 1.4 }}>
                                    « {n.appreciation} »
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════════ DEVOIRS ════════ */}
          {tab === 'devoirs' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, color: 'var(--amc-primary)', fontSize: 16 }}>Devoirs — {selectedStudent?.firstName}</h3>
                {homeworks.length > 0 && <span className="badge badge-info">{homeworks.length} message{homeworks.length > 1 ? 's' : ''}</span>}
              </div>
              {homeworks.length === 0 ? (
                <div className="sp-empty">
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📚</div>
                  <p style={{ color: '#6B7280', fontSize: 14 }}>Aucun devoir disponible pour le moment.</p>
                </div>
              ) : (
                [...homeworks].sort((a, b) => new Date(b.date) - new Date(a.date)).map((hw) => (
                  <div key={hw.id} className="sp-hw-full">
                    <div className="sp-hw-header">
                      <div>
                        <strong style={{ color: 'var(--amc-primary)', fontSize: 13 }}>{hw.classLabel || 'Classe'}</strong>
                        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{fmtDate(hw.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                      </div>
                      {hw.attachmentUrl && (
                        <a href={hw.attachmentUrl} download={hw.attachmentFilename || 'piece-jointe'} className="btn btn-outline btn-sm">
                          📥 Pièce jointe
                        </a>
                      )}
                    </div>
                    <div className="sp-hw-body">
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 14, color: 'var(--amc-text)', lineHeight: 1.7 }}>
                        {hw.body}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ════════ SUIVI CORAN ════════ */}
          {tab === 'coran' && hasCoranEnrollment && (
            <div>
              <h3 style={{ margin: '0 0 14px', color: 'var(--amc-primary)', fontSize: 16 }}>
                Suivi Coran — {selectedStudent?.firstName}
              </h3>
              <CoranFamilyPanel studentId={selectedStudentId} />
            </div>
          )}
        </>
      )}
    </>
  );
}
