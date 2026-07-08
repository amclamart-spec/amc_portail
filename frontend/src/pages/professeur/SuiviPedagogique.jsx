import { useEffect, useMemo, useState } from 'react';
import { FiLoader, FiPrinter, FiDownload, FiCheck, FiX, FiSave, FiEdit2, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import useEvaluations from '../../hooks/useEvaluations';

/* ─── Teal teacher palette ─────────────────────────────────────────────────── */
const T = {
  primary: '#0f766e',
  hover:   '#0d6761',
  light:   '#f0fdfa',
  light2:  '#ccfbf1',
  border:  '#5eead4',
  dark:    '#134e4a',
  mid:     '#14b8a6',
};

/* ─── Responsive styles ────────────────────────────────────────────────────── */
const STYLES = `
  :root { --ep: #0f766e; --ep-light: #f0fdfa; --ep-light2: #ccfbf1; --ep-border: #5eead4; }

  .ep-header     { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px; }
  .ep-pills      { display:flex; gap:6px; flex-wrap:wrap; }
  .ep-pill       { display:flex; align-items:center; gap:6px; padding:5px 14px 5px 7px; border-radius:999px; border:none; cursor:pointer; font-family:var(--amc-font-family); font-size:13px; font-weight:600; transition:all .15s; background:#fff; color:var(--amc-text); box-shadow:var(--amc-shadow); outline:1.5px solid var(--amc-border); white-space:nowrap; }
  .ep-pill.active{ background:var(--ep); color:#fff; outline-color:var(--ep); box-shadow:0 2px 8px rgba(15,118,110,.35); }

  .ep-tabs       { display:grid; grid-template-columns:repeat(5,1fr); border-radius:var(--amc-border-radius-lg); overflow:hidden; border:1px solid var(--amc-border); background:var(--amc-light-bg-2); margin-bottom:18px; box-shadow:var(--amc-shadow); }
  .ep-tab        { display:flex; flex-direction:column; align-items:center; gap:3px; padding:9px 4px; border:none; cursor:pointer; background:transparent; color:#6B7280; font-family:var(--amc-font-family); font-size:11px; font-weight:500; transition:background .15s,color .15s; text-align:center; line-height:1.2; }
  .ep-tab.active { background:var(--ep); color:#fff; font-weight:700; }
  .ep-tab-icon   { font-size:16px; line-height:1; }
  .ep-tab + .ep-tab { border-left:1px solid var(--amc-border); }
  .ep-tab.active + .ep-tab { border-left-color:var(--ep); }

  .ep-sec        { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); overflow:hidden; margin-bottom:14px; }
  .ep-sec-head   { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 14px; background:var(--ep-light); border-bottom:1px solid var(--ep-border); font-weight:700; font-size:13px; color:var(--ep); }
  .ep-sec-body   { padding:12px 14px; }

  .ep-2col       { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }
  .ep-3col       { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }

  .ep-student-card  { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:var(--amc-border-radius); background:var(--amc-light-bg-2); border:1px solid var(--amc-border); margin-bottom:8px; }
  .ep-student-card:last-child { margin-bottom:0; }
  .ep-toggle        { display:flex; border-radius:6px; overflow:hidden; border:1.5px solid var(--amc-border); flex-shrink:0; }
  .ep-toggle-btn    { padding:4px 9px; border:none; cursor:pointer; font-size:12px; font-weight:700; background:#fff; color:#6B7280; font-family:var(--amc-font-family); transition:all .1s; }
  .ep-toggle-btn.present  { background:#DCFCE7; color:#166534; }
  .ep-toggle-btn.absent   { background:#FEE2E2; color:#991B1B; }
  .ep-toggle-btn.retard   { background:#FEF3C7; color:#92400E; }

  .ep-hw-card    { padding:10px 12px; border-radius:var(--amc-border-radius); background:var(--amc-light-bg-2); border:1px solid var(--amc-border); margin-bottom:8px; }
  .ep-hw-card:last-child { margin-bottom:0; }

  .ep-note-input { width:60px; padding:4px 6px; border:1px solid var(--amc-border); border-radius:4px; font-size:13px; text-align:center; font-family:var(--amc-font-family); }
  .ep-note-input:focus { outline:2px solid var(--ep); }

  .ep-rank-row   { display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:var(--amc-border-radius); margin-bottom:6px; }
  .ep-rank-row:last-child { margin-bottom:0; }

  /* bulletin print */
  .ep-bulletin        { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); padding:24px; }
  .ep-bulletin-header { text-align:center; border-bottom:2px solid var(--ep); padding-bottom:14px; margin-bottom:18px; }
  .ep-bulletin table  { width:100%; border-collapse:collapse; }
  .ep-bulletin td,
  .ep-bulletin th     { border:1px solid #D1D5DB; padding:7px 12px; font-size:13px; }
  .ep-bulletin th     { background:var(--ep-light); color:var(--ep); font-weight:700; }
  .ep-bulletin-avg    { margin-top:16px; padding:12px; background:var(--ep-light); border-radius:var(--amc-border-radius); border:1px solid var(--ep-border); }
  .ep-mention         { display:inline-block; padding:3px 10px; border-radius:999px; font-weight:700; font-size:13px; }

  @media print {
    body > *:not(.ep-print-zone) { display:none !important; }
    .ep-print-zone { display:block !important; }
    .ep-bulletin { border:none; box-shadow:none; }
    .ep-no-print { display:none !important; }
  }

  @media (max-width: 640px) {
    .ep-tab-label { display:none; }
    .ep-header    { flex-direction:column; align-items:flex-start; }
    .ep-note-input { width:48px; }
  }

  @media (max-width: 480px) {
    .ep-2col, .ep-3col { grid-template-columns:1fr; }
  }
`;

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function gradeColor(g, max = 10) {
  if (g == null || g === '') return '#6B7280';
  const pct = (g / max) * 100;
  return pct >= 80 ? '#16A34A' : pct >= 70 ? '#0891B2' : pct >= 60 ? '#D97706' : '#DC2626';
}
function gradeBg(g, max = 10) {
  if (g == null || g === '') return '#F9FAFB';
  const pct = (g / max) * 100;
  return pct >= 80 ? '#F0FDF4' : pct >= 70 ? '#F0F9FF' : pct >= 60 ? '#FFFBEB' : '#FEF2F2';
}
function mention(avg, max = 10) {
  if (avg == null) return null;
  const pct = (Number(avg) / max) * 100;
  if (pct >= 80) return { text: 'Très Bien',   color: '#16A34A', bg: '#F0FDF4' };
  if (pct >= 70) return { text: 'Bien',         color: '#0891B2', bg: '#F0F9FF' };
  if (pct >= 60) return { text: 'Assez Bien',   color: '#D97706', bg: '#FFFBEB' };
  return           { text: 'Passable',        color: '#DC2626', bg: '#FEF2F2' };
}
function fmtDate(d, opts) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', opts || { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── sub-components ───────────────────────────────────────────────────────── */
function Avatar({ name, size = 30 }) {
  const initial = String(name || '?')[0].toUpperCase();
  const palette = [T.primary, '#0891B2', '#7C3AED', '#0369A1', '#047857'];
  const bg = palette[initial.charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.4), fontWeight: 800, flexShrink: 0, userSelect: 'none',
    }}>
      {initial}
    </div>
  );
}

function SecHead({ children, action }) {
  return (
    <div className="ep-sec-head">
      <span>{children}</span>
      {action && <span>{action}</span>}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ padding: '28px 16px', textAlign: 'center', color: '#6B7280' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <p style={{ margin: 0, fontSize: 13 }}>{text}</p>
    </div>
  );
}

/* ─── tabs config ──────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
  { id: 'absences',  label: 'Absences',         icon: '📅' },
  { id: 'devoirs',   label: 'Devoirs',           icon: '📚' },
  { id: 'notes',     label: 'Notes',             icon: '📝' },
  { id: 'bulletin',  label: 'Bulletin',           icon: '📄' },
];

/* ─── main component ───────────────────────────────────────────────────────── */
export default function SuiviPedagogique() {
  /* ── existing state ── */
  const [classes,             setClasses]             = useState([]);
  const [selectedClassId,     setSelectedClassId]     = useState('');
  const [selectedLessonId,    setSelectedLessonId]    = useState('');
  const [selectedPeriod,      setSelectedPeriod]      = useState('');
  const [dateFilter,          setDateFilter]           = useState('');
  const [rows,                setRows]                = useState([]);
  const [noteColumns,         setNoteColumns]         = useState([]);
  const [noteRows,            setNoteRows]            = useState([]);
  const [classStudents,       setClassStudents]       = useState([]);
  const [newNoteDiscipline,   setNewNoteDiscipline]   = useState('');
  const [newNoteGrade,        setNewNoteGrade]        = useState('');
  const [newNoteStudentId,    setNewNoteStudentId]    = useState('');
  const [saving,              setSaving]              = useState(false);
  const [activeModule,        setActiveModule]        = useState('absences');
  const [homeworkBody,        setHomeworkBody]        = useState('');
  const [homeworkAttachment,  setHomeworkAttachment]  = useState(null);
  const [homeworkAttachmentUrl, setHomeworkAttachmentUrl] = useState(null);
  const [absenceHistoryModalOpen, setAbsenceHistoryModalOpen] = useState(false);
  const [absenceHistoryRows,  setAbsenceHistoryRows]  = useState([]);
  const [historyLoading,      setHistoryLoading]      = useState(false);
  const [editHomework,        setEditHomework]        = useState(null);
  const [editBody,            setEditBody]            = useState('');

  /* ── new: tab + bulletin state ── */
  const [tab,                 setTab]                 = useState('dashboard');
  const [bulletinStudentId,   setBulletinStudentId]   = useState('');
  const [bulletinAppreciation, setBulletinAppreciation] = useState('');

  /* ── derived ── */
  const selectedClass  = classes.find((c) => String(c.id) === String(selectedClassId)) || null;
  const classPeriod    = selectedClass?.level?.pole?.period;
  const periodOptions  = useMemo(() => {
    if (classPeriod === 'TRIMESTRIEL') return [
      { label: 'Trimestre 1', value: 'TRIMESTRE_1' },
      { label: 'Trimestre 2', value: 'TRIMESTRE_2' },
      { label: 'Trimestre 3', value: 'TRIMESTRE_3' },
    ];
    if (classPeriod === 'SEMESTRIEL') return [
      { label: 'Semestre 1', value: 'SEMESTRE_1' },
      { label: 'Semestre 2', value: 'SEMESTRE_2' },
    ];
    return [];
  }, [classPeriod]);

  const {
    evaluations, stats, homeworkHistory, loading, error,
    fetchEvaluations, fetchStats, fetchLessons, fetchAbsences,
    fetchAbsenceHistory, fetchClassStudents, fetchHomeworkMessage, fetchHomeworkHistory,
    saveHomeworkMessage, deleteHomeworkMessage, saveAbsences, saveEvaluations,
    fetchPeriodNotes, savePeriodNote,
  } = useEvaluations();

  /* ── sync tab → activeModule ── */
  useEffect(() => {
    if (tab === 'absences')                setActiveModule('absences');
    else if (tab === 'devoirs')            setActiveModule('devoirs');
    else if (tab === 'notes' || tab === 'bulletin') setActiveModule('notes');
  }, [tab]);

  /* ── load classes ── */
  useEffect(() => {
    api.get('/teacher/classes')
      .then(({ data }) => {
        setClasses(data.classes || []);
        if (data.classes?.length) setSelectedClassId(String(data.classes[0].id));
      })
      .catch(() => toast.error('Impossible de charger les classes'));
  }, []);

  /* ── load lessons on class/date change ── */
  useEffect(() => {
    if (!selectedClassId) return;
    fetchLessons({ classId: selectedClassId, date: dateFilter })
      .then((items) => {
        if (items.length) {
          setSelectedLessonId((cur) => items.find((l) => l.id === cur)?.id || items[0].id);
        } else {
          setSelectedLessonId('');
        }
      });
  }, [selectedClassId, dateFilter]);

  /* ── load homework history ── */
  useEffect(() => {
    if (activeModule === 'devoirs' && selectedClassId) {
      fetchHomeworkHistory({ classId: selectedClassId });
    }
  }, [activeModule, selectedClassId, fetchHomeworkHistory]);

  /* ── load students list ── */
  useEffect(() => {
    if (!selectedClassId) return;
    if (activeModule === 'absences') {
      fetchClassStudents({ classId: selectedClassId }).then((students) => {
        setRows((students || []).map((s) => ({ ...s, status: s.status || 'on_time', justification: '' })));
      });
    }
    if (activeModule === 'notes') {
      fetchClassStudents({ classId: selectedClassId }).then((s) => setClassStudents(s || []));
    }
  }, [activeModule, selectedClassId, fetchClassStudents]);

  /* ── load data by module ── */
  useEffect(() => {
    if (!selectedClassId) { setRows([]); return; }

    if (activeModule === 'absences') {
      if (!dateFilter) return;
      fetchAbsences({ classId: selectedClassId, date: dateFilter }).then((data) => {
        if (data?.students) setRows(data.students.map((s) => ({ ...s })));
        else setRows([]);
      });
      fetchStats({ classId: selectedClassId, module: 'absences' });
      return;
    }

    if (activeModule === 'devoirs') {
      if (!dateFilter) { setRows([]); setHomeworkBody(''); setHomeworkAttachmentUrl(null); fetchStats({ classId: selectedClassId, module: 'devoirs' }); return; }
      fetchHomeworkMessage({ classId: selectedClassId, date: dateFilter }).then((hw) => {
        setHomeworkBody(hw?.body || '');
        setHomeworkAttachmentUrl(hw?.attachmentUrl || null);
      });
      fetchStats({ classId: selectedClassId, module: 'devoirs' });
      return;
    }

    if (activeModule === 'notes') {
      if (!selectedPeriod) { setNoteColumns([]); setNoteRows([]); return; }
      fetchPeriodNotes({ classId: selectedClassId, period: selectedPeriod }).then((result) => {
        setNoteColumns(result.lessons.map((l, i) => ({ header: l.label || `Note ${i + 1}`, accessorKey: `d_${i}` })));
        setNoteRows(result.students.map((s) => ({
          id: s.studentId || s.id,
          studentName: s.studentName || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
          ...s.notes.reduce((acc, g, i) => { acc[`d_${i}`] = g; return acc; }, {}),
        })));
      });
      fetchStats({ classId: selectedClassId, module: 'notes' });
    }
  }, [activeModule, dateFilter, selectedClassId, selectedPeriod, fetchAbsences, fetchHomeworkMessage, fetchStats, fetchPeriodNotes]);

  /* ── auto-select period ── */
  useEffect(() => {
    if (periodOptions.length) setSelectedPeriod(periodOptions[0].value);
    else setSelectedPeriod('');
  }, [classPeriod, periodOptions]);

  useEffect(() => { if (error) toast.error(error); }, [error]);

  /* ── day-of-week validation for absence date ── */
  const DAY_MAP = { DIMANCHE: 0, LUNDI: 1, MARDI: 2, MERCREDI: 3, JEUDI: 4, VENDREDI: 5, SAMEDI: 6 };
  const handleAbsenceDateChange = (value) => {
    if (!value) { setDateFilter(''); return; }
    const expectedDay = DAY_MAP[selectedClass?.dayOfWeek];
    if (expectedDay !== undefined) {
      const [year, month, day] = value.split('-').map(Number);
      const picked = new Date(year, month - 1, day).getDay();
      if (picked !== expectedDay) {
        toast.error(`Ce cours a lieu le ${selectedClass.dayOfWeek.charAt(0) + selectedClass.dayOfWeek.slice(1).toLowerCase()}. Veuillez choisir un autre jour.`);
        return;
      }
    }
    setDateFilter(value);
  };

  /* ── handlers ── */
  const handleStatusToggle = (studentId, status) => {
    setRows((prev) => prev.map((r) => r.studentId === studentId ? { ...r, status } : r));
  };
  const handleJustificationChange = (studentId, justification) => {
    setRows((prev) => prev.map((r) => r.studentId === studentId ? { ...r, justification } : r));
  };
  const handleGradeChange = (studentId, grade) => {
    setRows((prev) => prev.map((r) => r.studentId === studentId ? { ...r, grade: Math.min(10, Math.max(0, Number(grade))) } : r));
  };
  const handleAppreciationChange = (studentId, appreciation) => {
    setRows((prev) => prev.map((r) => r.studentId === studentId ? { ...r, appreciation } : r));
  };

  const handleSaveAbsences = async () => {
    if (!dateFilter) { toast.error('Sélectionnez une date'); return; }
    setSaving(true);
    const ok = await saveAbsences({
      classId: selectedClassId, date: dateFilter,
      students: rows.map((r) => ({ studentId: r.studentId, status: r.status || 'on_time', justification: r.justification || '', grade: 0, appreciation: '', submitted: false })),
    });
    setSaving(false);
    if (ok) {
      toast.success('Absences enregistrées');
      fetchAbsences({ classId: selectedClassId, date: dateFilter }).then((data) => { if (data?.students) setRows(data.students.map((s) => ({ ...s }))); });
    } else { toast.error('Échec de l\'enregistrement'); }
  };

  const handleSaveHomework = async () => {
    if (!dateFilter) { toast.error('Sélectionnez une date'); return; }
    if (!homeworkBody.trim()) { toast.error('Rédigez le message de devoirs'); return; }
    setSaving(true);
    const ok = await saveHomeworkMessage({ classId: selectedClassId, date: dateFilter, message: homeworkBody, attachmentFilename: homeworkAttachment?.name, attachmentBase64: homeworkAttachment?.base64 });
    setSaving(false);
    if (ok) { toast.success('Devoir publié'); fetchHomeworkHistory({ classId: selectedClassId }); setHomeworkBody(''); setHomeworkAttachment(null); setDateFilter(''); }
    else { toast.error('Échec de la publication'); }
  };

  const handleSavePeriodNote = async () => {
    if (!selectedPeriod || !newNoteStudentId || !newNoteDiscipline) { toast.error('Remplissez tous les champs'); return; }
    const g = Number(newNoteGrade);
    if (!Number.isFinite(g) || g < 0 || g > 10) { toast.error('Note entre 0 et 10'); return; }
    setSaving(true);
    const ok = await savePeriodNote({ classId: selectedClassId, period: selectedPeriod, studentId: newNoteStudentId, discipline: newNoteDiscipline, grade: g });
    setSaving(false);
    if (ok) {
      toast.success('Note enregistrée');
      setNewNoteDiscipline(''); setNewNoteGrade(''); setNewNoteStudentId('');
      fetchPeriodNotes({ classId: selectedClassId, period: selectedPeriod }).then((result) => {
        setNoteColumns(result.lessons.map((l, i) => ({ header: l.label || `Note ${i + 1}`, accessorKey: `d_${i}` })));
        setNoteRows(result.students.map((s) => ({ id: s.studentId || s.id, studentName: s.studentName || `${s.firstName || ''} ${s.lastName || ''}`.trim(), ...s.notes.reduce((acc, g2, i) => { acc[`d_${i}`] = g2; return acc; }, {}) })));
      });
    } else { toast.error('Impossible d\'enregistrer la note'); }
  };

  const handleDeleteHomework = async (id) => {
    if (!window.confirm('Supprimer ce devoir ?')) return;
    setSaving(true);
    const ok = await deleteHomeworkMessage({ homeworkId: id });
    setSaving(false);
    if (ok) { toast.success('Devoir supprimé'); fetchHomeworkHistory({ classId: selectedClassId }); }
  };

  const openAbsenceHistory = async () => {
    setHistoryLoading(true);
    const history = await fetchAbsenceHistory({ classId: selectedClassId });
    setAbsenceHistoryRows(history || []);
    setHistoryLoading(false);
    setAbsenceHistoryModalOpen(true);
  };

  const exportLessonPdf = async (lessonId, lessonTitle) => {
    try {
      const response = await api.get(`/absences/history/${lessonId}/export`, { responseType: 'blob' });
      const href = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = Object.assign(document.createElement('a'), { href, download: `presence-${lessonTitle || lessonId}.pdf` });
      a.click(); URL.revokeObjectURL(href);
    } catch { toast.error('Impossible de télécharger le PDF'); }
  };

  /* ── dashboard derived ── */
  const ranking = useMemo(() => {
    return [...(evaluations || [])].filter((r) => r.grade != null).sort((a, b) => b.grade - a.grade);
  }, [evaluations]);
  const studentsInDifficulty = useMemo(() => (evaluations || []).filter((r) => r.grade != null && r.grade < 6).length, [evaluations]);

  /* ── bulletin derived ── */
  const bulletinRow   = noteRows.find((r) => String(r.id) === String(bulletinStudentId));
  const bulletinGrades = bulletinRow
    ? noteColumns.map((c) => ({ label: c.header, grade: bulletinRow[c.accessorKey] }))
    : [];
  const validBulletinGrades = bulletinGrades.filter((g) => g.grade != null && g.grade !== '');
  const bulletinAvg   = validBulletinGrades.length > 0
    ? (validBulletinGrades.reduce((s, g) => s + Number(g.grade), 0) / validBulletinGrades.length).toFixed(2)
    : null;
  const bulletinMention = mention(bulletinAvg);

  /* ── render ── */
  return (
    <>
      <style>{STYLES}</style>

      {/* ── header: title + class pills ── */}
      <div className="ep-header">
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.primary }}>
          Suivi pédagogique
          {loading && <FiLoader className="spin" style={{ marginLeft: 10, fontSize: 16 }} />}
        </h2>
        <div className="ep-pills">
          {classes.map((cls) => {
            const active = String(cls.id) === selectedClassId;
            return (
              <button
                key={cls.id}
                className={`ep-pill${active ? ' active' : ''}`}
                onClick={() => setSelectedClassId(String(cls.id))}
              >
                <span style={{ fontSize: 10, background: active ? 'rgba(255,255,255,.25)' : T.light2, color: active ? '#fff' : T.primary, padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                  {cls.level?.pole?.name?.slice(0, 3) || ''}
                </span>
                {cls.level?.name || 'Classe'} — {cls.dayOfWeek?.slice(0, 3)} {cls.startTime}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── tab bar ── */}
      <div className="ep-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`ep-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="ep-tab-icon">{t.icon}</span>
            <span className="ep-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════ TABLEAU DE BORD ══════════════════════ */}
      {tab === 'dashboard' && (
        <div>
          {/* stat cards */}
          <div className="stats-grid" style={{ marginBottom: 14 }}>
            <div className="stat-card">
              <div className="stat-icon primary" style={{ background: T.light2, color: T.primary }}>👥</div>
              <div className="stat-info">
                <h4>{stats?.totalStudents ?? '—'}</h4>
                <p>Élèves</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon danger">📅</div>
              <div className="stat-info">
                <h4>{stats?.absenceRate != null ? `${stats.absenceRate}%` : '—'}</h4>
                <p>Taux d'absences</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon warning" style={{ background: T.light2, color: T.primary }}>📚</div>
              <div className="stat-info">
                <h4>{stats?.homeworkCount ?? homeworkHistory?.length ?? '—'}</h4>
                <p>Devoirs publiés</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon danger">⚠️</div>
              <div className="stat-info">
                <h4>{studentsInDifficulty}</h4>
                <p>En difficulté</p>
                <small style={{ color: '#6B7280' }}>Moy. &lt; 6/10</small>
              </div>
            </div>
          </div>

          <div className="ep-2col">
            {/* Classement */}
            <div className="ep-sec">
              <SecHead>🏆 Classement des élèves</SecHead>
              <div className="ep-sec-body">
                {ranking.length === 0 ? (
                  <EmptyState icon="📊" text="Aucune note enregistrée pour cette classe" />
                ) : (
                  ranking.map((r, i) => {
                    const color = gradeColor(r.grade);
                    return (
                      <div key={r.studentId} className="ep-rank-row" style={{ background: gradeBg(r.grade) }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', minWidth: 20 }}>#{i + 1}</span>
                        <Avatar name={r.studentName} size={28} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--amc-text)' }}>{r.studentName}</span>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', border: `2.5px solid ${color}`, background: gradeBg(r.grade), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1 }}>{r.grade}</span>
                          <span style={{ fontSize: 8, color: '#6B7280', lineHeight: 1 }}>/10</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Derniers devoirs */}
            <div className="ep-sec" style={{ alignSelf: 'start' }}>
              <SecHead>📚 Derniers devoirs publiés</SecHead>
              <div className="ep-sec-body">
                {(homeworkHistory || []).length === 0 ? (
                  <EmptyState icon="📚" text="Aucun devoir publié pour l'instant" />
                ) : (
                  [...(homeworkHistory || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5).map((hw) => (
                    <div key={hw.id} className="ep-hw-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                        <strong style={{ fontSize: 12, color: T.primary }}>{fmtDate(hw.date, { day: '2-digit', month: 'short' })}</strong>
                        {hw.attachmentUrl && <span className="badge badge-info" style={{ fontSize: 10 }}>📎</span>}
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--amc-text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {hw.body}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ ABSENCES ══════════════════════════════ */}
      {tab === 'absences' && (
        <div>
          {/* Filters */}
          <div className="ep-sec" style={{ marginBottom: 14 }}>
            <SecHead>Filtres</SecHead>
            <div className="ep-sec-body">
              <div className="ep-2col">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'block' }}>
                    Date de la séance
                    {selectedClass?.dayOfWeek && (
                      <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: T.primary }}>
                        (cours le {selectedClass.dayOfWeek.charAt(0) + selectedClass.dayOfWeek.slice(1).toLowerCase()})
                      </span>
                    )}
                  </label>
                  <input type="date" className="form-control" value={dateFilter} onChange={(e) => handleAbsenceDateChange(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={openAbsenceHistory} disabled={historyLoading || !selectedClassId}>
                    {historyLoading ? 'Chargement…' : '📋 Historique'}
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: T.primary, color: '#fff' }}
                    onClick={handleSaveAbsences}
                    disabled={saving || !dateFilter || rows.length === 0}
                  >
                    <FiSave size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer l\'appel'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Call sheet */}
          <div className="ep-sec">
            <SecHead>
              📋 Feuille d'appel
              {dateFilter && <span style={{ fontWeight: 400, fontSize: 12, color: '#6B7280' }}>{fmtDate(dateFilter, { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
            </SecHead>
            <div className="ep-sec-body">
              {rows.length === 0 ? (
                <EmptyState icon="👥" text="Aucun élève trouvé pour cette classe" />
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', fontSize: 12, color: '#6B7280' }}>
                    <span>✅ Présent</span>
                    <span>❌ Absent</span>
                    <span>⏰ Retard</span>
                  </div>
                  {rows.map((r) => {
                    const st = r.status || 'on_time';
                    return (
                      <div key={r.studentId} className="ep-student-card">
                        <Avatar name={r.studentName} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.studentName}
                          </div>
                          {r.absenceCount > 0 && (
                            <span className="badge badge-danger" style={{ fontSize: 10 }}>{r.absenceCount} abs.</span>
                          )}
                        </div>
                        <div className="ep-toggle">
                          <button className={`ep-toggle-btn${st === 'on_time' ? ' present' : ''}`} onClick={() => handleStatusToggle(r.studentId, 'on_time')}>✓ P</button>
                          <button className={`ep-toggle-btn${st === 'missing' ? ' absent' : ''}`} onClick={() => handleStatusToggle(r.studentId, 'missing')}>✗ A</button>
                          <button className={`ep-toggle-btn${st === 'late' ? ' retard' : ''}`} onClick={() => handleStatusToggle(r.studentId, 'late')}>⏱ R</button>
                        </div>
                        {st === 'missing' && (
                          <input
                            className="form-control"
                            style={{ maxWidth: 180, fontSize: 12, padding: '4px 8px' }}
                            placeholder="Justification"
                            value={r.justification || ''}
                            onChange={(e) => handleJustificationChange(r.studentId, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ DEVOIRS ═══════════════════════════════ */}
      {tab === 'devoirs' && (
        <div>
          <div className="ep-2col">
            {/* Publication form */}
            <div>
              <div className="ep-sec">
                <SecHead>✏️ Publier un devoir</SecHead>
                <div className="ep-sec-body">
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Date du devoir</label>
                    <input type="date" className="form-control" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Consignes / message</label>
                    <textarea
                      className="form-control"
                      rows={5}
                      placeholder="Rédigez les consignes visibles par les familles…"
                      value={homeworkBody}
                      onChange={(e) => setHomeworkBody(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Pièce jointe (optionnelle)</label>
                    <input type="file" className="form-control" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) { setHomeworkAttachment(null); return; }
                      const reader = new FileReader();
                      reader.onload = () => setHomeworkAttachment({ name: file.name, base64: reader.result?.toString().split(',')[1] });
                      reader.readAsDataURL(file);
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn"
                      style={{ background: T.primary, color: '#fff' }}
                      onClick={handleSaveHomework}
                      disabled={saving || !dateFilter || !homeworkBody.trim()}
                    >
                      <FiSave size={14} /> {saving ? 'Publication…' : 'Publier'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* History list */}
            <div className="ep-sec" style={{ alignSelf: 'start' }}>
              <SecHead>📋 Historique des devoirs</SecHead>
              <div className="ep-sec-body">
                {(homeworkHistory || []).length === 0 ? (
                  <EmptyState icon="📚" text="Aucun devoir publié" />
                ) : (
                  [...(homeworkHistory || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((hw) => {
                    const editing = editHomework?.id === hw.id;
                    return (
                      <div key={hw.id} className="ep-hw-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                          <strong style={{ fontSize: 12, color: T.primary }}>{fmtDate(hw.date, { day: '2-digit', month: 'long' })}</strong>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-outline" style={{ padding: '2px 8px' }} onClick={() => {
                              if (editing) { setEditHomework(null); }
                              else { setEditHomework(hw); setEditBody(hw.body || ''); }
                            }}>
                              <FiEdit2 size={12} />
                            </button>
                            <button className="btn btn-sm btn-danger" style={{ padding: '2px 8px' }} onClick={() => handleDeleteHomework(hw.id)}>
                              <FiTrash2 size={12} />
                            </button>
                          </div>
                        </div>
                        {editing ? (
                          <>
                            <textarea className="form-control" rows={3} value={editBody} onChange={(e) => setEditBody(e.target.value)} style={{ marginBottom: 8, fontSize: 12 }} />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-outline btn-sm" onClick={() => setEditHomework(null)}>Annuler</button>
                              <button className="btn btn-sm" style={{ background: T.primary, color: '#fff' }} disabled={saving} onClick={async () => {
                                setSaving(true);
                                const ok = await saveHomeworkMessage({ classId: selectedClassId, date: hw.date, message: editBody });
                                setSaving(false);
                                if (ok) { toast.success('Devoir mis à jour'); setEditHomework(null); fetchHomeworkHistory({ classId: selectedClassId }); }
                              }}>
                                {saving ? '…' : 'Sauvegarder'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--amc-text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', lineHeight: 1.5 }}>
                            {hw.body}
                          </p>
                        )}
                        {hw.attachmentUrl && !editing && (
                          <a href={hw.attachmentUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: T.primary, marginTop: 6, display: 'inline-block' }}>
                            📎 Pièce jointe
                          </a>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ NOTES ═════════════════════════════════ */}
      {tab === 'notes' && (
        <div>
          {/* Controls */}
          <div className="ep-sec" style={{ marginBottom: 14 }}>
            <SecHead>Filtres</SecHead>
            <div className="ep-sec-body">
              <div className="ep-2col">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'block' }}>Période</label>
                  <select className="form-control" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {periodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {stats?.averageGrade != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: gradeBg(stats.averageGrade), borderRadius: 'var(--amc-border-radius)', border: '1px solid var(--amc-border)', alignSelf: 'end' }}>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>Moyenne de classe</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: gradeColor(stats.averageGrade) }}>{stats.averageGrade.toFixed(1)}/10</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="ep-2col">
            {/* Notes table */}
            {noteColumns.length > 0 ? (
              <div className="ep-sec" style={{ overflowX: 'auto' }}>
                <SecHead>📊 Notes enregistrées</SecHead>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 12px', background: T.primary, color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap' }}>Élève</th>
                        {noteColumns.map((c) => (
                          <th key={c.accessorKey} style={{ padding: '8px 10px', background: T.primary, color: '#fff', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{c.header}</th>
                        ))}
                        <th style={{ padding: '8px 10px', background: T.dark, color: '#fff', fontWeight: 700, fontSize: 12 }}>Moy.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {noteRows.map((row) => {
                        const grades = noteColumns.map((c) => row[c.accessorKey]).filter((g) => g != null && g !== '');
                        const avg = grades.length > 0 ? (grades.reduce((s, g) => s + Number(g), 0) / grades.length).toFixed(1) : null;
                        return (
                          <tr key={row.id}>
                            <td style={{ padding: '7px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--amc-border)', whiteSpace: 'nowrap' }}>
                              {row.studentName}
                            </td>
                            {noteColumns.map((c) => {
                              const g = row[c.accessorKey];
                              return (
                                <td key={c.accessorKey} style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid var(--amc-border)', background: gradeBg(g) }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: gradeColor(g) }}>{g != null && g !== '' ? g : '—'}</span>
                                </td>
                              );
                            })}
                            <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800, fontSize: 13, borderBottom: '1px solid var(--amc-border)', background: gradeBg(avg), color: gradeColor(avg) }}>
                              {avg ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="ep-sec">
                <SecHead>📊 Notes enregistrées</SecHead>
                <EmptyState icon="📝" text={selectedPeriod ? 'Aucune note pour cette période' : 'Sélectionnez une période'} />
              </div>
            )}

            {/* Add note form */}
            <div className="ep-sec" style={{ alignSelf: 'start' }}>
              <SecHead>➕ Saisir une note</SecHead>
              <div className="ep-sec-body">
                <div className="form-group">
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Élève</label>
                  <select className="form-control" value={newNoteStudentId} onChange={(e) => setNewNoteStudentId(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {classStudents.map((s) => (
                      <option key={s.studentId || s.id} value={String(s.studentId || s.id)}>
                        {s.studentName || `${s.firstName || ''} ${s.lastName || ''}`.trim()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Intitulé de l'évaluation</label>
                  <input className="form-control" value={newNoteDiscipline} onChange={(e) => setNewNoteDiscipline(e.target.value)} placeholder="Ex : Contrôle sourates" />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Note /10</label>
                  <input type="number" className="form-control" min={0} max={10} step="0.5" value={newNoteGrade} onChange={(e) => setNewNoteGrade(e.target.value)} placeholder="0 – 10" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn"
                    style={{ background: T.primary, color: '#fff' }}
                    onClick={handleSavePeriodNote}
                    disabled={saving || !selectedPeriod}
                  >
                    <FiCheck size={14} /> {saving ? 'Enregistrement…' : 'Valider'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ BULLETIN ══════════════════════════════ */}
      {tab === 'bulletin' && (
        <div>
          {/* Controls */}
          <div className="ep-sec" style={{ marginBottom: 14 }}>
            <SecHead>⚙️ Paramètres du bulletin</SecHead>
            <div className="ep-sec-body">
              <div className="ep-3col">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'block' }}>Période</label>
                  <select className="form-control" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {periodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'block' }}>Élève</label>
                  <select className="form-control" value={bulletinStudentId} onChange={(e) => { setBulletinStudentId(e.target.value); setBulletinAppreciation(''); }}>
                    <option value="">— Sélectionner —</option>
                    {noteRows.map((r) => <option key={r.id} value={String(r.id)}>{r.studentName}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <button
                    className="btn ep-no-print"
                    style={{ background: T.primary, color: '#fff' }}
                    disabled={!bulletinStudentId}
                    onClick={() => window.print()}
                  >
                    <FiPrinter size={14} /> Imprimer
                  </button>
                  <button
                    className="btn ep-no-print"
                    style={{ background: T.dark, color: '#fff' }}
                    disabled={!bulletinStudentId || !selectedPeriod || saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const response = await api.post(
                          '/evaluations/bulletin/pdf',
                          { classId: selectedClassId, period: selectedPeriod, studentId: bulletinStudentId, appreciation: bulletinAppreciation },
                          { responseType: 'blob' },
                        );
                        const studentName = noteRows.find((r) => String(r.id) === bulletinStudentId)?.studentName || bulletinStudentId;
                        const url = window.URL.createObjectURL(new Blob([response.data]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', `bulletin-${studentName.replace(/\s+/g, '-')}-${selectedPeriod}.pdf`);
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.URL.revokeObjectURL(url);
                      } catch (e) {
                        console.error('Erreur téléchargement bulletin', e);
                        toast.error('Impossible de générer le bulletin PDF');
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    <FiDownload size={14} /> Télécharger PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bulletin preview */}
          {!bulletinStudentId ? (
            <EmptyState icon="📄" text="Sélectionnez une période et un élève pour générer le bulletin" />
          ) : (
            <div className="ep-bulletin ep-print-zone">
              {/* Bulletin header */}
              <div className="ep-bulletin-header">
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Association Mosquée Colmar
                </div>
                <h2 style={{ margin: '6px 0', color: T.primary, fontSize: 20 }}>Bulletin de {periodOptions.find((o) => o.value === selectedPeriod)?.label || 'période'}</h2>
                <div style={{ fontSize: 14, color: 'var(--amc-text)', fontWeight: 600 }}>
                  {selectedClass?.level?.name} — {selectedClass?.level?.pole?.name}
                </div>
              </div>

              {/* Student info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>Élève</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{bulletinRow?.studentName}</div>
                </div>
                {bulletinAvg != null && bulletinMention && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: '#6B7280' }}>Moyenne générale</div>
                    <div style={{ fontWeight: 800, fontSize: 22, color: gradeColor(Number(bulletinAvg)) }}>{bulletinAvg}/10</div>
                    <span className="ep-mention" style={{ background: bulletinMention.bg, color: bulletinMention.color }}>
                      {bulletinMention.text}
                    </span>
                  </div>
                )}
              </div>

              {/* Grades table */}
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Évaluation</th>
                    <th style={{ textAlign: 'center' }}>Note</th>
                    <th style={{ textAlign: 'center' }}>Appréciation</th>
                  </tr>
                </thead>
                <tbody>
                  {bulletinGrades.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: '#6B7280', padding: 16 }}>Aucune évaluation pour cette période</td></tr>
                  ) : (
                    bulletinGrades.map((g, i) => {
                      const g2 = g.grade != null && g.grade !== '' ? Number(g.grade) : null;
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{g.label}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: gradeColor(g2), background: gradeBg(g2) }}>
                            {g2 != null ? `${g2}/10` : '—'}
                          </td>
                          <td style={{ textAlign: 'center', color: '#6B7280', fontSize: 12 }}>—</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Progress bar */}
              {bulletinAvg != null && (
                <div className="ep-bulletin-avg">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <span style={{ fontWeight: 700 }}>Progression globale</span>
                    <span style={{ fontWeight: 700, color: gradeColor(Number(bulletinAvg)) }}>{Math.round((Number(bulletinAvg) / 10) * 100)}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--amc-border)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round((Number(bulletinAvg) / 10) * 100)}%`, height: '100%', background: gradeColor(Number(bulletinAvg)), borderRadius: 999, transition: 'width .4s' }} />
                  </div>
                </div>
              )}

              {/* Teacher appreciation */}
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'block', color: 'var(--amc-text)' }}>
                  Appréciation de l'enseignant
                </label>
                <textarea
                  className="form-control ep-no-print"
                  rows={3}
                  placeholder="Saisissez votre appréciation générale…"
                  value={bulletinAppreciation}
                  onChange={(e) => setBulletinAppreciation(e.target.value)}
                />
                {bulletinAppreciation && (
                  <div style={{ marginTop: 8, padding: '10px 14px', background: T.light, border: `1px solid ${T.border}`, borderRadius: 'var(--amc-border-radius)', fontStyle: 'italic', fontSize: 14, color: T.dark }}>
                    « {bulletinAppreciation} »
                  </div>
                )}
              </div>

              {/* Signature zone */}
              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 32 }}>Cachet et signature de l'enseignant</div>
                  <div style={{ width: 160, borderTop: '1px solid #D1D5DB' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Absence history modal ── */}
      {absenceHistoryModalOpen && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 720 }}>
            <div className="card-header">
              <h3 style={{ color: T.primary }}>📋 Historique des absences</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setAbsenceHistoryModalOpen(false)}>Fermer</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>Date</th><th>Cours / séance</th><th>Export</th></tr>
                  </thead>
                  <tbody>
                    {absenceHistoryRows.length === 0 ? (
                      <tr><td colSpan={3} style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>Aucune saisie enregistrée</td></tr>
                    ) : (
                      absenceHistoryRows.map((l) => (
                        <tr key={l.id}>
                          <td>{fmtDate(l.date, { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                          <td>{l.title}</td>
                          <td><button className="btn btn-sm btn-primary" onClick={() => exportLessonPdf(l.id, l.title)}>PDF</button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
