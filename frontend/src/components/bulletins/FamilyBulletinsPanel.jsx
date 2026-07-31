import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const STYLES = `
  .blt-content   { max-width:760px; }
  .blt-group      { margin-bottom:22px; }
  .blt-group:last-child { margin-bottom:0; }
  .blt-group-head { font-weight:800; font-size:14px; color:var(--amc-text); margin-bottom:10px; }
  .blt-card       { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); background:#fff; margin-bottom:10px; }
  .blt-card:last-child { margin-bottom:0; }
`;

const PERIOD_LABELS = {
  TRIMESTRE_1: 'Trimestre 1',
  TRIMESTRE_2: 'Trimestre 2',
  TRIMESTRE_3: 'Trimestre 3',
  SEMESTRE_1: 'Semestre 1',
  SEMESTRE_2: 'Semestre 2',
  ANNUEL: 'Année complète',
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function FamilyBulletinsPanel({ studentId }) {
  const [bulletins, setBulletins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/bulletins/${studentId}`)
      .then(({ data }) => { if (!cancelled) setBulletins(data.bulletins || []); })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger les bulletins'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  if (loading) return <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement…</p>;

  if (bulletins.length === 0) {
    return (
      <div className="sp-empty">
        <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Aucun bulletin publié pour le moment.</p>
      </div>
    );
  }

  const byCourse = bulletins.reduce((acc, b) => {
    const k = b.classLabel || 'Autre';
    if (!acc[k]) acc[k] = [];
    acc[k].push(b);
    return acc;
  }, {});

  return (
    <div className="blt-content">
      <style>{STYLES}</style>
      {Object.entries(byCourse).map(([course, courseBulletins]) => (
        <div key={course} className="blt-group">
          <div className="blt-group-head">{course}</div>
          {[...courseBulletins].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((b) => (
            <div key={b.id} className="blt-card">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{PERIOD_LABELS[b.period] || b.period}</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Publié le {fmtDate(b.createdAt)}</div>
              </div>
              <a href={b.fileUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">📄 Voir / Télécharger</a>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
