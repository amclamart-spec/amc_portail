import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { StarRating } from './AppreciationsPanel';

const STYLES = `
  .apr-f-card      { padding:12px 14px; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); background:#fff; margin-bottom:12px; }
  .apr-f-card.unseen { border-left:3px solid var(--amc-warning); }
  .apr-f-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
  .apr-f-rating-row { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--amc-text); }
  .apr-f-rating-label { min-width:110px; font-weight:600; }
  .apr-f-vu-toggle { display:flex; align-items:center; gap:8px; margin-top:10px; padding-top:10px; border-top:1px solid var(--amc-border); font-size:13px; font-weight:600; color:var(--amc-text); cursor:pointer; user-select:none; }
  .apr-f-vu-toggle input { width:16px; height:16px; cursor:pointer; accent-color:var(--amc-success); flex-shrink:0; }
  .apr-f-vu-toggle.disabled { cursor:default; }
`;

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function FamilyAppreciationsPanel({ studentId }) {
  const [appreciations, setAppreciations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/appreciations/${studentId}`)
      .then(({ data }) => { if (!cancelled) setAppreciations(data.appreciations || []); })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger les appréciations'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const handleMarkSeen = (id) => {
    setAppreciations((prev) => prev.map((a) => (a.id === id ? { ...a, vu: true, vuAt: new Date().toISOString() } : a)));
    api.put(`/appreciations/${id}/vu`, { studentId })
      .catch((e) => {
        setAppreciations((prev) => prev.map((a) => (a.id === id ? { ...a, vu: false, vuAt: null } : a)));
        toast.error(e.response?.data?.error || 'Impossible de valider cette appréciation');
      });
  };

  if (loading) return <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement…</p>;

  return (
    <div>
      <style>{STYLES}</style>
      {appreciations.length === 0 ? (
        <div className="sp-empty">
          <div style={{ fontSize: 32, marginBottom: 10 }}>⭐</div>
          <p style={{ color: '#6B7280', fontSize: 14 }}>Aucune appréciation régulière pour le moment.</p>
        </div>
      ) : (
        [...appreciations].sort((a, b) => new Date(b.date) - new Date(a.date)).map((a) => (
          <div key={a.id} className={`apr-f-card${a.vu ? '' : ' unseen'}`}>
            <div className="apr-f-card-head">
              <strong style={{ fontSize: 13 }}>{fmtDate(a.date)}</strong>
              {!a.vu && <span className="badge badge-warning">Nouvelle</span>}
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: a.commentaire ? 8 : 0 }}>
              <div className="apr-f-rating-row"><span className="apr-f-rating-label">Travail</span><StarRating value={a.noteTravail} /></div>
              <div className="apr-f-rating-row"><span className="apr-f-rating-label">Comportement</span><StarRating value={a.noteComportement} /></div>
            </div>
            {a.commentaire && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--amc-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.commentaire}</p>
            )}
            <label className={`apr-f-vu-toggle${a.vu ? ' disabled' : ''}`}>
              <input type="checkbox" checked={!!a.vu} disabled={a.vu} onChange={() => handleMarkSeen(a.id)} />
              <span>{a.vu ? `Vue le ${fmtDate(a.vuAt)}` : 'J\'ai vu cette appréciation'}</span>
            </label>
          </div>
        ))
      )}
    </div>
  );
}
