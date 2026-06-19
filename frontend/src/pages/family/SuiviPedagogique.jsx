import { useEffect, useState } from 'react';
import api from '../../api/axios';

/* ─── responsive styles ────────────────────────────────────────────────────── */
const STYLES = `
  .sp-header       { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px; }
  .sp-pills        { display:flex; gap:8px; flex-wrap:wrap; }
  .sp-tabs         { display:grid; grid-template-columns:repeat(4,1fr); border-radius:var(--amc-border-radius-lg); overflow:hidden; border:1px solid var(--amc-border); background:var(--amc-light-bg-2); margin-bottom:18px; box-shadow:var(--amc-shadow); }
  .sp-tab          { display:flex; flex-direction:column; align-items:center; gap:3px; padding:10px 6px; border:none; cursor:pointer; background:transparent; color:#6B7280; font-family:var(--amc-font-family); font-size:11px; font-weight:500; transition:background .15s,color .15s; line-height:1.2; text-align:center; }
  .sp-tab.active   { background:var(--amc-primary); color:#fff; font-weight:700; }
  .sp-tab-icon     { font-size:16px; line-height:1; }
  .sp-tab + .sp-tab{ border-left:1px solid var(--amc-border); }
  .sp-tab.active + .sp-tab { border-left-color:var(--amc-primary); }
  .sp-dash-grid    { display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:14px; }
  .sp-notes-grid   { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:12px; }
  .sp-sec          { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); overflow:hidden; }
  .sp-sec-head     { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 14px; background:var(--amc-light-bg-2); border-bottom:1px solid var(--amc-border); font-weight:700; font-size:13px; color:var(--amc-text); }
  .sp-sec-body     { padding:10px 12px; }
  .sp-note-row     { display:flex; align-items:flex-start; gap:10px; padding:8px 10px; border-radius:var(--amc-border-radius); margin-bottom:6px; }
  .sp-note-row:last-child { margin-bottom:0; }
  .sp-hw-card      { padding:9px 10px; background:var(--amc-light-bg-2); border-radius:var(--amc-border-radius); border:1px solid var(--amc-border); margin-bottom:8px; }
  .sp-hw-card:last-child  { margin-bottom:0; }
  .sp-absence-card { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); overflow:hidden; margin-bottom:8px; }
  .sp-absence-card:last-child { margin-bottom:0; }
  .sp-absence-body { padding:10px 14px; }
  .sp-link-btn     { font-size:12px; color:var(--amc-primary-light); background:none; border:none; cursor:pointer; font-weight:700; font-family:var(--amc-font-family); padding:0; white-space:nowrap; }
  .sp-link-btn:hover { text-decoration:underline; }
  .sp-pill-btn     { display:inline-flex; align-items:center; gap:7px; padding:5px 12px 5px 5px; border-radius:999px; border:none; cursor:pointer; font-family:var(--amc-font-family); font-weight:600; font-size:13px; transition:all .15s; white-space:nowrap; }
  .sp-avg-badge    { display:inline-flex; align-items:center; gap:8px; padding:4px 12px; border-radius:var(--amc-border-radius); border:1px solid var(--amc-border); }
  .sp-empty        { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); padding:32px 16px; text-align:center; }
  .sp-course-chip  { display:inline-block; background:#DBEAFE; color:#1E40AF; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; border:1px solid #BFDBFE; margin:3px; }

  @media (max-width: 600px) {
    .sp-tab-label   { font-size:9px; }
    .sp-dash-grid   { grid-template-columns:1fr; }
  }
  @media (max-width: 480px) {
    .sp-notes-grid  { grid-template-columns:1fr; }
    .sp-header      { flex-direction:column; align-items:flex-start; }
  }
`;

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function gradeColor(grade, max = 10) {
  if (grade == null) return '#6B7280';
  const pct = (grade / max) * 100;
  return pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#DC2626';
}
function gradeBg(grade, max = 10) {
  if (grade == null) return 'var(--amc-light-bg-2)';
  const pct = (grade / max) * 100;
  return pct >= 80 ? '#F0FDF4' : pct >= 60 ? '#FFFBEB' : '#FEF2F2';
}
function fmtDate(d, opts) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', opts || { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── sub-components ───────────────────────────────────────────────────────── */
function Avatar({ name, size = 28 }) {
  const initial = String(name || '?')[0].toUpperCase();
  const palette = ['#213B88', '#0088CC', '#0891B2', '#059669', '#7C3AED', '#D97706'];
  const bg = palette[initial.charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.42), fontWeight: 800, flexShrink: 0, userSelect: 'none',
    }}>
      {initial}
    </div>
  );
}

function NoteCircle({ grade, max = 10, size = 42 }) {
  const color = gradeColor(grade, max);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2.5px solid ${color}`, background: gradeBg(grade, max),
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ fontSize: Math.round(size * 0.29), fontWeight: 800, color, lineHeight: 1 }}>
        {grade != null ? grade : '—'}
      </span>
      <span style={{ fontSize: 8, color: '#6B7280', lineHeight: 1 }}>/{max}</span>
    </div>
  );
}

/* ─── tab config ───────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
  { id: 'absences',  label: 'Absences',         icon: '📅' },
  { id: 'notes',     label: 'Notes',             icon: '⭐' },
  { id: 'devoirs',   label: 'Devoirs',           icon: '📚' },
];

/* ─── main component ───────────────────────────────────────────────────────── */
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

  useEffect(() => {
    if (!selectedStudentId) return;
    setDataLoading(true);
    setError('');
    Promise.all([
      api.get('/family/pedagogy/absences', { params: { studentId: selectedStudentId } }),
      api.get('/family/pedagogy/homework',  { params: { studentId: selectedStudentId } }),
      api.get('/family/pedagogy/notes',     { params: { studentId: selectedStudentId } }),
    ])
      .then(([absRes, hwRes, notesRes]) => {
        setAbsences(absRes.data.absences  || []);
        setHomeworks(hwRes.data.homeworks || []);
        setNotes(notesRes.data.notes      || []);
      })
      .catch((err) => setError(err.response?.data?.error || 'Erreur lors du chargement.'))
      .finally(() => setDataLoading(false));
  }, [selectedStudentId]);

  /* ── derived ── */
  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const validGrades     = notes.filter((n) => n.grade != null);
  const avgGrade        = validGrades.length > 0
    ? (validGrades.reduce((s, n) => s + Number(n.grade), 0) / validGrades.length).toFixed(1)
    : null;
  const recentNotes     = [...notes].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
  const recentHomeworks = [...homeworks].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
  const notesByMatiere  = notes.reduce((acc, n) => {
    const k = n.classLabel || 'Autre';
    if (!acc[k]) acc[k] = [];
    acc[k].push(n);
    return acc;
  }, {});

  /* ── guards ── */
  if (loading) {
    return <p style={{ padding: 32, color: '#6B7280', textAlign: 'center' }}>Chargement…</p>;
  }
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

  /* ── render ── */
  return (
    <>
      <style>{STYLES}</style>

      {/* ── header: title + child pills ── */}
      <div className="sp-header">
        <h2 style={{ margin: 0, color: 'var(--amc-primary)', fontSize: 20, fontWeight: 800 }}>
          Suivi pédagogique
        </h2>
        <div className="sp-pills">
          {students.map((s) => {
            const active = s.id === selectedStudentId;
            return (
              <button
                key={s.id}
                className="sp-pill-btn"
                onClick={() => { setSelectedStudentId(s.id); setTab('dashboard'); }}
                style={{
                  background: active ? 'var(--amc-primary)' : '#fff',
                  color: active ? '#fff' : 'var(--amc-text)',
                  boxShadow: active ? '0 2px 8px rgba(33,59,136,.3)' : 'var(--amc-shadow)',
                  outline: `1.5px solid ${active ? 'var(--amc-primary)' : 'var(--amc-border)'}`,
                }}
              >
                <Avatar name={s.firstName} size={26} />
                {s.firstName || 'Élève'}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── tab bar: 4 equal columns ── */}
      <div className="sp-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`sp-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="sp-tab-icon">{t.icon}</span>
            <span className="sp-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* error */}
      {error && (
        <div className="badge-warning" style={{ display: 'block', padding: '8px 12px', borderRadius: 'var(--amc-border-radius)', marginBottom: 12, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* loading */}
      {dataLoading ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>Chargement des données…</p>
      ) : (
        <>
          {/* ════════════════════ DASHBOARD ════════════════════ */}
          {tab === 'dashboard' && (
            <div>
              {/* stat cards — réutilise les classes CSS de l'app */}
              <div className="stats-grid" style={{ marginBottom: 16 }}>
                <div className="stat-card">
                  <div className={`stat-icon ${absences.length > 0 ? 'danger' : 'success'}`}>📅</div>
                  <div className="stat-info">
                    <h4 style={{ color: absences.length > 0 ? 'var(--amc-danger)' : 'var(--amc-success)' }}>
                      {absences.length}
                    </h4>
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
                <div className="stat-card">
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

              {/* 2-col: notes + devoirs */}
              <div className="sp-dash-grid">

                {/* col gauche */}
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
                              <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {n.lessonTitle || 'Évaluation'}
                              </div>
                              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>
                                {n.classLabel} · {fmtDate(n.date)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* col droite */}
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
                            <strong style={{ fontSize: 12, color: 'var(--amc-primary-light)' }}>{hw.classLabel || 'Classe'}</strong>
                            <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>
                              {fmtDate(hw.date, { day: '2-digit', month: 'short' })}
                            </span>
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

              {recentNotes.length === 0 && recentHomeworks.length === 0 && (
                <div className="sp-empty">
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                  <p style={{ color: '#6B7280', fontSize: 14 }}>Aucune donnée pédagogique disponible pour le moment.</p>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════ ABSENCES ════════════════════ */}
          {tab === 'absences' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, color: 'var(--amc-primary)', fontSize: 16 }}>
                  Absences — {selectedStudent?.firstName}
                </h3>
                {absences.length > 0 && (
                  <span className="badge badge-danger">
                    {absences.length} absence{absences.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {absences.length === 0 ? (
                <div className="sp-empty">
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                  <p style={{ color: '#16A34A', fontWeight: 700 }}>Aucune absence enregistrée — excellent !</p>
                </div>
              ) : (
                [...absences].sort((a, b) => new Date(b.date) - new Date(a.date)).map((absence) => {
                  const justified = Boolean(absence.justification);
                  return (
                    <div
                      key={absence.id}
                      className="sp-absence-card"
                      style={{ borderLeft: `4px solid ${justified ? '#D97706' : '#DC2626'}` }}
                    >
                      <div className="sp-absence-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {absence.lessonTitle || 'Leçon'}
                            </div>
                            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{absence.classLabel}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, color: '#6B7280' }}>
                              {fmtDate(absence.date, { day: '2-digit', month: 'long', year: 'numeric' })}
                            </span>
                            <span className={`badge ${justified ? 'badge-warning' : 'badge-danger'}`}>
                              {justified ? '✓ Justifiée' : '✗ Non justifiée'}
                            </span>
                          </div>
                        </div>
                        {justified && (
                          <div style={{ marginTop: 8, padding: '6px 10px', background: '#FFFBEB', borderRadius: 'var(--amc-border-radius)', fontSize: 12, color: '#78350F' }}>
                            {absence.justification}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ════════════════════ NOTES ════════════════════════ */}
          {tab === 'notes' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, color: 'var(--amc-primary)', fontSize: 16 }}>
                  Notes — {selectedStudent?.firstName}
                </h3>
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
                    const mAvg  = valid.length > 0
                      ? valid.reduce((s, n) => s + Number(n.grade), 0) / valid.length
                      : null;
                    const pct   = mAvg != null ? (mAvg / 10) * 100 : 0;
                    return (
                      <div key={matiere} className="sp-sec">
                        <div className="sp-sec-head">
                          {matiere}
                          {mAvg != null && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 52, height: 5, background: 'var(--amc-border)', borderRadius: 999, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: gradeColor(mAvg), borderRadius: 999 }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: gradeColor(mAvg) }}>
                                {mAvg.toFixed(1)}/10
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="sp-sec-body">
                          {[...matiereNotes].sort((a, b) => new Date(b.date) - new Date(a.date)).map((n) => (
                            <div key={n.id} className="sp-note-row" style={{ background: gradeBg(n.grade) }}>
                              <NoteCircle grade={n.grade} size={42} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {n.lessonTitle || 'Évaluation'}
                                </div>
                                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                                  {fmtDate(n.date)}
                                </div>
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

          {/* ════════════════════ DEVOIRS ═══════════════════════ */}
          {tab === 'devoirs' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, color: 'var(--amc-primary)', fontSize: 16 }}>
                  Devoirs — {selectedStudent?.firstName}
                </h3>
                {homeworks.length > 0 && (
                  <span className="badge badge-info">
                    {homeworks.length} message{homeworks.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {homeworks.length === 0 ? (
                <div className="sp-empty">
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📚</div>
                  <p style={{ color: '#6B7280', fontSize: 14 }}>Aucun devoir disponible pour le moment.</p>
                </div>
              ) : (
                [...homeworks].sort((a, b) => new Date(b.date) - new Date(a.date)).map((hw) => (
                  <div key={hw.id} className="sp-sec" style={{ marginBottom: 10 }}>
                    <div style={{ padding: '9px 14px', background: '#DBEAFE', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid #BFDBFE' }}>
                      <strong style={{ color: 'var(--amc-primary)', fontSize: 13 }}>{hw.classLabel || 'Classe'}</strong>
                      <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>
                        {fmtDate(hw.date, { day: '2-digit', month: 'long' })}
                      </span>
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13, color: 'var(--amc-text)', lineHeight: 1.65 }}>
                        {hw.body}
                      </p>
                      {hw.attachmentUrl && (
                        <a
                          href={hw.attachmentUrl}
                          download={hw.attachmentFilename || 'piece-jointe'}
                          className="btn btn-outline btn-sm"
                          style={{ marginTop: 10 }}
                        >
                          📥 {hw.attachmentFilename || 'Télécharger la pièce jointe'}
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
