import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import MonthCalendar from './MonthCalendar';
import { APPRECIATION_OPTIONS, fmtDate, isoWeekNumber, MAX_MUSHAF_PAGE, computeCoranKpis } from './sourateUtils';

const PAGE_SIZE = 10;

const REVISION_TYPE_LABELS = { NOUVELLE_PAGE: 'Nouvelle page', ANCIENNE_PAGE: 'Ancienne page' };

const STYLES = `
  .cor-t-subtabs  { display:grid; grid-template-columns:repeat(3,1fr); border-radius:var(--amc-border-radius-lg); overflow:hidden; border:1px solid var(--amc-border); background:var(--amc-light-bg-2); margin-bottom:16px; box-shadow:var(--amc-shadow); }
  .cor-t-subtab   { display:flex; flex-direction:column; align-items:center; gap:3px; padding:10px 6px; border:none; cursor:pointer; background:transparent; color:#6B7280; font-family:var(--amc-font-family); font-size:11px; font-weight:600; min-height:44px; }
  .cor-t-subtab.active { background:#0891B2; color:#fff; }
  .cor-t-subtab + .cor-t-subtab { border-left:1px solid var(--amc-border); }

  .cor-t-grid     { display:grid; grid-template-columns:1fr; gap:14px; }
  @media(min-width:768px) { .cor-t-grid.cor-t-2col { grid-template-columns:1fr 1fr; } }

  .cor-t-table-wrap { overflow-x:auto; border:1px solid var(--amc-border); border-radius:var(--amc-border-radius-lg); background:#fff; box-shadow:var(--amc-shadow); }
  .cor-t-table      { width:100%; border-collapse:collapse; font-size:13px; }
  .cor-t-table th   { text-align:left; padding:9px 12px; background:var(--amc-light-bg-2); font-size:12px; color:#6B7280; font-weight:700; white-space:nowrap; }
  .cor-t-table td   { padding:9px 12px; border-top:1px solid var(--amc-light-bg-2); vertical-align:top; }
  .cor-t-table td.nowrap { white-space:nowrap; }

  .cor-t-eval-cell    { display:flex; flex-direction:column; gap:6px; min-width:200px; }
  .cor-t-apprec-btns-sm { display:flex; gap:4px; }
  .cor-t-apprec-btn-sm  { width:34px; height:30px; border-radius:var(--amc-border-radius); border:1.5px solid var(--amc-border); background:#fff; cursor:pointer; font-size:15px; display:flex; align-items:center; justify-content:center; }
  .cor-t-apprec-btn-sm.active { border-width:2px; }
  .cor-t-comment-input  { font-size:12px !important; padding:5px 8px !important; }

  .cor-t-pagination { display:flex; align-items:center; justify-content:space-between; margin-top:12px; flex-wrap:wrap; gap:8px; }

  .cor-t-layout   { display:grid; grid-template-columns:1fr; gap:16px; align-items:start; }
  @media(min-width:960px) { .cor-t-layout { grid-template-columns:1fr 280px; } }
`;

function EvalCell({ item, onSave }) {
  const [appreciation, setAppreciation] = useState(item.appreciation || '');
  const [commentaire, setCommentaire] = useState(item.commentaireProf || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAppreciation(item.appreciation || '');
    setCommentaire(item.commentaireProf || '');
  }, [item.id, item.appreciation, item.commentaireProf]);

  const dirty = appreciation !== (item.appreciation || '') || commentaire !== (item.commentaireProf || '');

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ appreciation: appreciation || null, commentaireProf: commentaire || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cor-t-eval-cell">
      <div className="cor-t-apprec-btns-sm">
        {APPRECIATION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            aria-label={opt.label}
            className={`cor-t-apprec-btn-sm${appreciation === opt.value ? ' active' : ''}`}
            style={{ color: opt.color, background: appreciation === opt.value ? opt.bg : '#fff', borderColor: appreciation === opt.value ? opt.color : undefined }}
            onClick={() => setAppreciation(appreciation === opt.value ? '' : opt.value)}
          >
            {opt.icon}
          </button>
        ))}
      </div>
      <input
        type="text"
        className="form-control cor-t-comment-input"
        placeholder="Commentaire du jour…"
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
      />
      <div style={{ minHeight: 20 }}>
        {dirty ? (
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={handleSave}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        ) : item.evaluatedAt ? (
          <span style={{ fontSize: 10, color: '#6B7280' }}>Évalué le {fmtDate(item.evaluatedAt)}</span>
        ) : null}
      </div>
    </div>
  );
}

function Pagination({ total, currentPage, totalPages, onPrev, onNext, label }) {
  return (
    <div className="cor-t-pagination">
      <span style={{ fontSize: 12, color: '#6B7280' }}>{total} {label} — page {currentPage}/{totalPages}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn-outline btn-sm" disabled={currentPage <= 1} onClick={onPrev}>← Précédent</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={currentPage >= totalPages} onClick={onNext}>Suivant →</button>
      </div>
    </div>
  );
}

function KpiCard({ icon, iconClass, value, label }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconClass}`}>{icon}</div>
      <div className="stat-info">
        <h4>{value}</h4>
        <p>{label}</p>
      </div>
    </div>
  );
}

function ApprentissageGrid({ repetitions, setRepetitions }) {
  const [currentPage, setCurrentPage] = useState(1);

  const handleEvaluate = async (id, payload) => {
    try {
      const { data } = await api.put(`/coran/repetitions/${id}/evaluate`, payload);
      setRepetitions((prev) => prev.map((r) => (r.id === id ? data.repetition : r)));
      toast.success('Appréciation enregistrée');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de l\'enregistrement');
    }
  };

  const sorted = useMemo(() => [...repetitions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [repetitions]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="cor-t-layout">
      <div>
        {repetitions.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Aucune page ajoutée par l'élève pour le moment.</div>
        ) : (
          <>
            <div className="cor-t-table-wrap">
              <table className="cor-t-table">
                <thead>
                  <tr><th>Sourate</th><th>Page</th><th>Date début</th><th>Semaine</th><th>Répétitions</th><th>Appréciation</th></tr>
                </thead>
                <tbody>
                  {pageItems.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{r.sourate?.nomFr || '—'}</td>
                      <td className="nowrap" style={{ fontWeight: 800 }}>{r.numeroPage}</td>
                      <td className="nowrap">{fmtDate(r.createdAt)}</td>
                      <td className="nowrap">S{isoWeekNumber(r.createdAt)}</td>
                      <td className="nowrap">{r.compteur} / 30</td>
                      <td><EvalCell item={r} onSave={(payload) => handleEvaluate(r.id, payload)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={sorted.length} currentPage={currentPage} totalPages={totalPages} label={`page${sorted.length !== 1 ? 's' : ''}`}
              onPrev={() => setCurrentPage((p) => p - 1)} onNext={() => setCurrentPage((p) => p + 1)} />
          </>
        )}
      </div>
      <MonthCalendar markedDates={repetitions.map((r) => r.createdAt)} legendLabel="Jour d'ajout d'une page" />
    </div>
  );
}

function RevisionGrid({ revisions, setRevisions }) {
  const handleEvaluate = async (id, payload) => {
    try {
      const { data } = await api.put(`/coran/revisions/${id}/evaluate`, payload);
      setRevisions((prev) => prev.map((r) => (r.id === id ? data.revision : r)));
      toast.success('Appréciation enregistrée');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de l\'enregistrement');
    }
  };

  const sorted = [...revisions].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="cor-t-layout">
      <div>
        {revisions.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Aucune révision enregistrée par l'élève pour le moment.</div>
        ) : (
          <div className="cor-t-table-wrap">
            <table className="cor-t-table">
              <thead>
                <tr><th>Sourate</th><th>Pages</th><th>Type</th><th>Date</th><th>Appréciation</th></tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{r.sourate?.nomFr || '—'}</td>
                    <td className="nowrap">{r.pageDebut}–{r.pageFin}</td>
                    <td className="nowrap">{REVISION_TYPE_LABELS[r.type] || r.type}</td>
                    <td className="nowrap">{fmtDate(r.date)}</td>
                    <td><EvalCell item={r} onSave={(payload) => handleEvaluate(r.id, payload)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <MonthCalendar markedDates={revisions.map((r) => r.date)} legendLabel="Jour de révision" />
    </div>
  );
}

function LectureGrid({ lectures, setLectures }) {
  const handleEvaluate = async (id, payload) => {
    try {
      const { data } = await api.put(`/coran/lectures/${id}/evaluate`, payload);
      setLectures((prev) => prev.map((l) => (l.id === id ? data.lecture : l)));
      toast.success('Appréciation enregistrée');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de l\'enregistrement');
    }
  };

  const sorted = [...lectures].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="cor-t-layout">
      <div>
        {lectures.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Aucune séance de lecture enregistrée par l'élève pour le moment.</div>
        ) : (
          <div className="cor-t-table-wrap">
            <table className="cor-t-table">
              <thead>
                <tr><th>Sourate</th><th>Pages</th><th>Durée</th><th>Date</th><th>Appréciation</th></tr>
              </thead>
              <tbody>
                {sorted.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap">{l.sourate?.nomFr || '—'}</td>
                    <td className="nowrap">{l.pageDebut}–{l.pageFin}</td>
                    <td className="nowrap">{l.dureeMinutes ? `${l.dureeMinutes} min` : '—'}</td>
                    <td className="nowrap">{fmtDate(l.date)}</td>
                    <td><EvalCell item={l} onSave={(payload) => handleEvaluate(l.id, payload)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <MonthCalendar markedDates={lectures.map((l) => l.date)} legendLabel="Jour de lecture" />
    </div>
  );
}

const SUBTABS = [
  { id: 'apprentissage', label: 'Apprentissage (الحفظ)', icon: '🔁' },
  { id: 'revision', label: 'Révision (المراجعة)', icon: '📖' },
  { id: 'lecture', label: 'Lecture (التلاوة)', icon: '🎤' },
];

export default function CoranTeacherPanel({ classId }) {
  const [classStudents, setClassStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [subTab, setSubTab] = useState('apprentissage');

  const [repetitions, setRepetitions] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [lectures, setLectures] = useState([]);
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
    setRepetitions([]);
    setRevisions([]);
    setLectures([]);
    if (!selectedStudentId) return;

    let cancelled = false;
    setLoadingData(true);
    Promise.all([
      api.get(`/coran/repetitions/${selectedStudentId}`),
      api.get(`/coran/revisions/${selectedStudentId}`),
      api.get(`/coran/lectures/${selectedStudentId}`),
    ])
      .then(([repRes, revRes, lecRes]) => {
        if (cancelled) return;
        setRepetitions(repRes.data.repetitions || []);
        setRevisions(revRes.data.revisions || []);
        setLectures(lecRes.data.lectures || []);
      })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger le suivi de l\'élève'); })
      .finally(() => { if (!cancelled) setLoadingData(false); });

    return () => { cancelled = true; };
  }, [selectedStudentId]);

  const kpis = useMemo(() => computeCoranKpis({ repetitions, revisions, lectures }), [repetitions, revisions, lectures]);

  return (
    <div>
      <style>{STYLES}</style>

      <div className="ep-sec">
        <div className="ep-sec-head">🕌 Élève</div>
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
        <div className="ep-sec"><div style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>Sélectionnez un élève pour afficher son suivi.</div></div>
      ) : loadingData ? (
        <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement du suivi…</p>
      ) : (
        <>
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <KpiCard icon="🔁" iconClass="primary" value={`${kpis.pagesApprises} / ${MAX_MUSHAF_PAGE} (${kpis.pctApprises}%)`} label="Avancement apprentissage (pages apprises sur le Coran)" />
            <KpiCard icon="📖" iconClass="warning" value={`${kpis.avgRevisionPerWeek.toFixed(1)} / sem.`} label="Avancement révision (pages / semaine en moyenne)" />
            <KpiCard icon="🎤" iconClass="success" value={`${kpis.pagesRecitees} / ${MAX_MUSHAF_PAGE} (${kpis.pctRecitees}%)`} label="Avancement lecture (pages récitées sur le Coran)" />
          </div>

          <div className="cor-t-subtabs">
            {SUBTABS.map((t) => (
              <button key={t.id} type="button" className={`cor-t-subtab${subTab === t.id ? ' active' : ''}`} onClick={() => setSubTab(t.id)}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {subTab === 'apprentissage' && <ApprentissageGrid key={selectedStudentId} repetitions={repetitions} setRepetitions={setRepetitions} />}
          {subTab === 'revision' && <RevisionGrid key={selectedStudentId} revisions={revisions} setRevisions={setRevisions} />}
          {subTab === 'lecture' && <LectureGrid key={selectedStudentId} lectures={lectures} setLectures={setLectures} />}
        </>
      )}
    </div>
  );
}
