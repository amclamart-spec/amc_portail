import { useEffect, useState } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import ProfSuiviPedagogique from '../professeur/SuiviPedagogique';

const STYLES = `
  .rp-content     { max-width:760px; }
  .rp-card        { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); background:#fff; margin-bottom:10px; cursor:pointer; transition:box-shadow .15s; }
  .rp-card:hover  { box-shadow:var(--amc-shadow-md); }
  .rp-card.disabled { cursor:not-allowed; opacity:.55; }
  .rp-card-title  { font-weight:700; font-size:14px; color:var(--amc-text); }
  .rp-card-meta   { font-size:12px; color:#6B7280; margin-top:2px; }
  .rp-back-btn    { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700; color:var(--amc-primary); background:none; border:none; cursor:pointer; padding:0; margin-bottom:16px; }
`;

const DAY_LABELS = { LUNDI: 'Lun', MARDI: 'Mar', MERCREDI: 'Mer', JEUDI: 'Jeu', VENDREDI: 'Ven', SAMEDI: 'Sam', DIMANCHE: 'Dim' };

export default function ResponsablePoleSuiviPedagogique() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState(null);

  useEffect(() => {
    api.get('/pole-manager/classes')
      .then(({ data }) => setClasses(data.classes || []))
      .catch(() => toast.error('Impossible de charger les classes du pôle'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>Chargement…</p>;

  if (selectedClass) {
    return (
      <div>
        <button type="button" className="rp-back-btn" onClick={() => setSelectedClass(null)}>
          <FiArrowLeft /> Retour à la liste des classes
        </button>
        <style>{STYLES}</style>
        <ProfSuiviPedagogique initialClasses={[selectedClass]} hideClassPicker />
      </div>
    );
  }

  return (
    <div className="rp-content">
      <style>{STYLES}</style>
      <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, color: 'var(--amc-primary)' }}>
        Suivi pédagogique — sélectionner une classe
      </h2>

      {classes.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 'var(--amc-border-radius-lg)', border: '1px solid var(--amc-border)', boxShadow: 'var(--amc-shadow)', padding: '32px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📚</div>
          <p style={{ color: '#6B7280', fontSize: 14 }}>Aucune classe trouvée pour ce pôle.</p>
        </div>
      ) : (
        classes.map((cls) => {
          const hasTeacher = !!cls.teacherName;
          return (
            <div
              key={cls.id}
              className={`rp-card${hasTeacher ? '' : ' disabled'}`}
              onClick={() => { if (hasTeacher) setSelectedClass(cls); }}
            >
              <div>
                <div className="rp-card-title">{cls.level?.name || 'Classe'}</div>
                <div className="rp-card-meta">
                  {DAY_LABELS[cls.dayOfWeek] || cls.dayOfWeek} {cls.startTime}–{cls.endTime}
                  {' · '}
                  {hasTeacher ? `Professeur : ${cls.teacherName}` : 'Aucun professeur assigné'}
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
