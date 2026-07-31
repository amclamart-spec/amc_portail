import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { MAX_MUSHAF_PAGE, computeCoranKpis } from './sourateUtils';

// Même thème que le bulletin du pôle Arabe (palette `T` dans professeur/SuiviPedagogique.jsx)
// — un seul accent teal, pas une couleur par bloc, pour rester cohérent visuellement.
const TEAL = { primary: '#0f766e', light: '#f0fdfa', light2: '#ccfbf1', border: '#5eead4', dark: '#134e4a' };

function formatMinutes(totalMinutes) {
  if (!totalMinutes) return '0 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes ? `${minutes} min` : ''}`.trim();
}

function BulletinBlock({ icon, title, figures }) {
  return (
    <div style={{ flex: '1 1 240px', border: `1px solid ${TEAL.border}`, borderRadius: 'var(--amc-border-radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: TEAL.light2, color: TEAL.dark, fontWeight: 700, fontSize: 13 }}>{icon} {title}</div>
      <div style={{ padding: '16px 16px', display: 'grid', gap: 12 }}>
        {figures.map((f) => (
          <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>{f.label}</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--amc-text)' }}>{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Bulletin Coran (professeur) : 3 périmètres (Apprentissage, Révision, Lecture)
 * avec des chiffres cumulés d'avancement, plus une appréciation générale de
 * l'enseignant. `appreciation`/`onAppreciationChange` sont contrôlés par le
 * parent pour rester cohérents avec les boutons Imprimer/Télécharger existants.
 */
export default function CoranBulletin({ studentId, studentName, classLabel, appreciation, onAppreciationChange }) {
  const [loading, setLoading] = useState(true);
  const [repetitions, setRepetitions] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [lectures, setLectures] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/coran/repetitions/${studentId}`),
      api.get(`/coran/revisions/${studentId}`),
      api.get(`/coran/lectures/${studentId}`),
    ])
      .then(([repRes, revRes, lecRes]) => {
        if (cancelled) return;
        setRepetitions(repRes.data.repetitions || []);
        setRevisions(revRes.data.revisions || []);
        setLectures(lecRes.data.lectures || []);
      })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger le suivi Coran de l\'élève'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  if (loading) return <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement du bulletin…</p>;

  const kpis = computeCoranKpis({ repetitions, revisions, lectures });

  return (
    <div className="ep-bulletin ep-print-zone">
      <div className="ep-bulletin-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <img src="/amc_logo.png" alt="AMC" style={{ height: 48, objectFit: 'contain' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>
              Association Partage et des Musulmans de Clamart
            </div>
            <h2 style={{ margin: '6px 0', color: TEAL.primary, fontSize: 20 }}>Bulletin de suivi Coran</h2>
            <div style={{ fontSize: 14, color: 'var(--amc-text)', fontWeight: 600 }}>{classLabel}</div>
          </div>
          <img src="/amc_logo_partner.png" alt="PARTAGE" style={{ height: 40, objectFit: 'contain' }} />
        </div>
      </div>

      <div style={{ marginBottom: 24, marginTop: 8 }}>
        <div style={{ fontSize: 12, color: '#6B7280' }}>Élève</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{studentName}</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 26 }}>
        <BulletinBlock
          icon="🔁" title="Apprentissage (الحفظ)"
          figures={[
            { label: 'Pages apprises', value: `${kpis.pagesApprises} / ${MAX_MUSHAF_PAGE} (${kpis.pctApprises}%)` },
            { label: 'Pages maîtrisées (≥30 rép.)', value: kpis.mastered },
            { label: 'Moyenne par semaine', value: `${kpis.avgApprentissagePerWeek.toFixed(1)} page(s)` },
          ]}
        />
        <BulletinBlock
          icon="📖" title="Révision (المراجعة)"
          figures={[
            { label: 'Pages révisées au total', value: kpis.totalRevisionPages },
            { label: 'Moyenne par semaine', value: `${kpis.avgRevisionPerWeek.toFixed(1)} page(s)` },
            { label: 'Nombre de révisions', value: kpis.totalRevisions },
          ]}
        />
        <BulletinBlock
          icon="🎤" title="Lecture (التلاوة)"
          figures={[
            { label: 'Pages récitées', value: `${kpis.pagesRecitees} / ${MAX_MUSHAF_PAGE} (${kpis.pctRecitees}%)` },
            { label: 'Séances de lecture', value: kpis.totalLectureSeances },
            { label: 'Temps total', value: formatMinutes(kpis.totalLectureMinutes) },
          ]}
        />
      </div>

      <div style={{ marginTop: 22 }}>
        <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'block', color: 'var(--amc-text)' }}>
          Appréciation de l'enseignant
        </label>
        <textarea
          className="form-control ep-no-print"
          rows={3}
          placeholder="Saisissez votre appréciation générale…"
          value={appreciation}
          onChange={(e) => onAppreciationChange(e.target.value)}
        />
        {appreciation && (
          <div style={{ marginTop: 8, padding: '10px 14px', background: TEAL.light, border: `1px solid ${TEAL.border}`, borderRadius: 'var(--amc-border-radius)', fontStyle: 'italic', fontSize: 14, color: TEAL.dark }}>
            « {appreciation} »
          </div>
        )}
      </div>

      <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 36 }}>Cachet et signature de l'enseignant</div>
          <div style={{ width: 160, borderTop: '1px solid #D1D5DB' }} />
        </div>
      </div>
    </div>
  );
}
