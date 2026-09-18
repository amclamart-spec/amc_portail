import { useEffect, useMemo, useState } from 'react';
import { FiArrowLeft, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import ProfSuiviPedagogique from '../professeur/SuiviPedagogique';

const STYLES = `
  .ap-content     { max-width:900px; }
  .ap-filters     { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:16px; }
  .ap-card        { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); background:#fff; margin-bottom:10px; cursor:pointer; transition:box-shadow .15s; }
  .ap-card:hover  { box-shadow:var(--amc-shadow-md); }
  .ap-card.disabled { cursor:not-allowed; opacity:.55; }
  .ap-card-title  { font-weight:700; font-size:14px; color:var(--amc-text); }
  .ap-card-meta   { font-size:12px; color:#6B7280; margin-top:2px; }
  .ap-back-btn    { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700; color:var(--amc-primary); background:none; border:none; cursor:pointer; padding:0; margin-bottom:16px; }
  .ap-pole-badge  { display:inline-block; background:var(--amc-light-bg-2); color:var(--amc-primary); padding:1px 8px; border-radius:999px; font-size:11px; font-weight:700; margin-right:6px; }
  @media(max-width:700px){ .ap-filters { grid-template-columns:1fr 1fr; } }
`;

const DAY_LABELS = { LUNDI: 'Lun', MARDI: 'Mar', MERCREDI: 'Mer', JEUDI: 'Jeu', VENDREDI: 'Ven', SAMEDI: 'Sam', DIMANCHE: 'Dim' };

export default function AdminSuiviPedagogique() {
  const [schoolYears,      setSchoolYears]      = useState([]);
  const [schoolYearId,     setSchoolYearId]     = useState('');
  const [classes,          setClasses]          = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [selectedClass,    setSelectedClass]    = useState(null);
  const [search,           setSearch]           = useState('');
  const [poleFilter,       setPoleFilter]       = useState('');
  const [levelFilter,      setLevelFilter]      = useState('');

  useEffect(() => {
    api.get('/admin/school-years')
      .then(({ data }) => {
        const years = data.schoolYears || [];
        setSchoolYears(years);
        setSchoolYearId(String((years.find((y) => y.isCurrent) || years[0])?.id || ''));
      })
      .catch(() => toast.error('Impossible de charger les années scolaires'));
  }, []);

  useEffect(() => {
    if (!schoolYearId) return;
    setLoading(true);
    api.get('/admin/classes', { params: { schoolYearId } })
      .then(({ data }) => setClasses(data.classes || []))
      .catch(() => toast.error('Impossible de charger les classes'))
      .finally(() => setLoading(false));
  }, [schoolYearId]);

  const poleOptions = useMemo(() => {
    const map = new Map();
    classes.forEach((cls) => {
      const pole = cls.level?.pole;
      if (pole && !map.has(pole.id)) map.set(pole.id, pole.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  const levelOptions = useMemo(() => {
    const map = new Map();
    classes.forEach((cls) => {
      const level = cls.level;
      if (!level) return;
      if (poleFilter && level.poleId !== poleFilter) return;
      if (!map.has(level.id)) map.set(level.id, level.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, poleFilter]);

  const filteredClasses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes.filter((cls) => {
      if (poleFilter && cls.level?.poleId !== poleFilter) return false;
      if (levelFilter && cls.levelId !== levelFilter) return false;
      if (!q) return true;
      const teacherName = `${cls.teacher?.firstName || ''} ${cls.teacher?.lastName || ''}`.trim();
      const haystack = [cls.level?.name, cls.level?.pole?.name, teacherName].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [classes, search, poleFilter, levelFilter]);

  if (selectedClass) {
    return (
      <div>
        <button type="button" className="ap-back-btn" onClick={() => setSelectedClass(null)}>
          <FiArrowLeft /> Retour à la liste des classes
        </button>
        <style>{STYLES}</style>
        <ProfSuiviPedagogique initialClasses={[selectedClass]} hideClassPicker />
      </div>
    );
  }

  return (
    <div className="ap-content">
      <style>{STYLES}</style>
      <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, color: 'var(--amc-primary)' }}>
        Suivi pédagogique — sélectionner une classe
      </h2>

      <div className="ap-filters">
        <select className="form-control" value={schoolYearId} onChange={(e) => setSchoolYearId(e.target.value)}>
          {schoolYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
        <select className="form-control" value={poleFilter} onChange={(e) => { setPoleFilter(e.target.value); setLevelFilter(''); }}>
          <option value="">Tous les pôles</option>
          {poleOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="form-control" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">Tous les niveaux</option>
          {levelOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <div style={{ position: 'relative' }}>
          <FiSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6B7280' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Rechercher (classe, professeur…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>Chargement…</p>
      ) : filteredClasses.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 'var(--amc-border-radius-lg)', border: '1px solid var(--amc-border)', boxShadow: 'var(--amc-shadow)', padding: '32px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📚</div>
          <p style={{ color: '#6B7280', fontSize: 14 }}>Aucune classe ne correspond à ces critères.</p>
        </div>
      ) : (
        filteredClasses.map((cls) => {
          const teacherName = cls.teacher ? `${cls.teacher.firstName} ${cls.teacher.lastName}` : null;
          const additionalTeacherNames = (cls.classTeachers || []).map((ct) => `${ct.teacher.firstName} ${ct.teacher.lastName}`);
          const hasTeacher = !!teacherName;
          const cardClass = {
            id: cls.id,
            level: cls.level ? { name: cls.level.name, pole: cls.level.pole ? { name: cls.level.pole.name, period: cls.level.pole.period } : null } : null,
            dayOfWeek: cls.dayOfWeek,
            startTime: cls.startTime,
            endTime: cls.endTime,
            teacherName,
            additionalTeacherNames,
          };
          return (
            <div
              key={cls.id}
              className={`ap-card${hasTeacher ? '' : ' disabled'}`}
              onClick={() => { if (hasTeacher) setSelectedClass(cardClass); }}
            >
              <div>
                <div className="ap-card-title">
                  {cls.level?.pole?.name && <span className="ap-pole-badge">{cls.level.pole.name}</span>}
                  {cls.level?.name || 'Classe'}
                </div>
                <div className="ap-card-meta">
                  {DAY_LABELS[cls.dayOfWeek] || cls.dayOfWeek} {cls.startTime}–{cls.endTime}
                  {' · '}
                  {hasTeacher ? `Professeur : ${teacherName}` : 'Aucun professeur assigné'}
                  {additionalTeacherNames.length > 0 && ` (+ ${additionalTeacherNames.join(', ')})`}
                </div>
              </div>
              {hasTeacher && <span style={{ color: 'var(--amc-primary)', fontSize: 13, fontWeight: 700 }}>Voir le détail →</span>}
            </div>
          );
        })
      )}
    </div>
  );
}
