import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const T = { primary: '#0f766e', light: '#f0fdfa', light2: '#ccfbf1', border: '#5eead4', dark: '#134e4a' };

const STYLES = `
  .pd-header  { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:20px; }
  .pd-classes { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; margin-bottom:20px; }
  .pd-cls-card{ background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); overflow:hidden; transition:box-shadow .15s; }
  .pd-cls-card:hover { box-shadow:var(--amc-shadow-md); }
  .pd-cls-top { padding:12px 14px; background:var(--ep-light,#f0fdfa); border-bottom:1px solid #5eead4; display:flex; align-items:center; gap:10px; }
  .pd-cls-body{ padding:12px 14px; }
  .pd-cls-row { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#6B7280; margin-bottom:6px; }
  .pd-cls-row:last-child { margin-bottom:0; }
  @media (max-width:480px) { .pd-classes { grid-template-columns:1fr; } }
`;

function Avatar({ name, size = 36 }) {
  const initial = String(name || '?')[0].toUpperCase();
  const palette = [T.primary, '#0891B2', '#7C3AED', '#0369A1', '#047857'];
  const bg = palette[initial.charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.4), fontWeight: 800, flexShrink: 0, userSelect: 'none',
    }}>{initial}</div>
  );
}

const DAY_ABBR = { LUNDI: 'Lun', MARDI: 'Mar', MERCREDI: 'Mer', JEUDI: 'Jeu', VENDREDI: 'Ven', SAMEDI: 'Sam', DIMANCHE: 'Dim' };

export default function ProfesseurDashboard() {
  const { user }    = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/teacher/dashboard')
      .then(({ data: d }) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const classes        = data?.classes         || [];
  const totalStudents  = data?.summary?.totalStudents || classes.reduce((s, c) => s + (c.enrolledCount || c.enrollments?.length || 0), 0);
  const totalClasses   = data?.summary?.totalClasses  || classes.length;

  if (loading) return <p style={{ padding: 32, color: '#6B7280', textAlign: 'center' }}>Chargement…</p>;

  return (
    <>
      <style>{STYLES}</style>

      {/* Header */}
      <div className="pd-header">
        <div>
          <h2 style={{ margin: 0, color: T.primary, fontSize: 20, fontWeight: 800 }}>
            Espace Enseignant
          </h2>
          {user?.firstName && (
            <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: 14 }}>
              Bonjour, <strong>{user.firstName}</strong> 👋
            </p>
          )}
        </div>
        <Link to="/suivi-pedagogique" className="btn" style={{ background: T.primary, color: '#fff' }}>
          📊 Ouvrir le suivi pédagogique
        </Link>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: T.light2, color: T.primary }}>🏫</div>
          <div className="stat-info">
            <h4>{totalClasses}</h4>
            <p>Classe{totalClasses !== 1 ? 's' : ''} assignée{totalClasses !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: T.light2, color: T.primary }}>👥</div>
          <div className="stat-info">
            <h4>{totalStudents}</h4>
            <p>Élève{totalStudents !== 1 ? 's' : ''} suivi{totalStudents !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Classes grid */}
      <h3 style={{ marginBottom: 12, color: T.primary, fontSize: 15 }}>Mes classes</h3>
      {classes.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 'var(--amc-border-radius-lg)', border: '1px solid var(--amc-border)', padding: '32px 16px', textAlign: 'center', color: '#6B7280' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📚</div>
          <p style={{ margin: 0 }}>Aucune classe affectée. Contactez l'administrateur.</p>
        </div>
      ) : (
        <div className="pd-classes">
          {classes.map((c) => {
            const count = c.enrolledCount ?? c.enrollments?.length ?? 0;
            const pole  = c.level?.pole?.name;
            const level = c.level?.name;
            const day   = DAY_ABBR[c.dayOfWeek] || c.dayOfWeek || '';
            return (
              <div key={c.id} className="pd-cls-card">
                <div className="pd-cls-top">
                  <Avatar name={level || pole || 'C'} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: T.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {level || 'Classe'}
                    </div>
                    {pole && <div style={{ fontSize: 11, color: T.primary, fontWeight: 600 }}>{pole}</div>}
                  </div>
                </div>
                <div className="pd-cls-body">
                  <div className="pd-cls-row">
                    <span>📅 Horaire</span>
                    <span style={{ fontWeight: 600, color: 'var(--amc-text)' }}>
                      {day} {c.startTime}–{c.endTime}
                    </span>
                  </div>
                  <div className="pd-cls-row">
                    <span>👥 Inscrits</span>
                    <span style={{ fontWeight: 700, color: T.primary }}>{count} élève{count !== 1 ? 's' : ''}</span>
                  </div>
                  {c.room?.name && (
                    <div className="pd-cls-row">
                      <span>🏫 Salle</span>
                      <span style={{ fontWeight: 600, color: 'var(--amc-text)' }}>{c.room.name}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <Link
                      to="/suivi-pedagogique"
                      className="btn btn-sm"
                      style={{ width: '100%', background: T.primary, color: '#fff', justifyContent: 'center' }}
                    >
                      Gérer cette classe →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
