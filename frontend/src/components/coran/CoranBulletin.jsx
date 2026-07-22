import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { MAX_MUSHAF_PAGE, computeCoranKpis, fmtDate } from './sourateUtils';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function formatMinutes(totalMinutes) {
  if (!totalMinutes) return '0 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes ? `${minutes} min` : ''}`.trim();
}

function BulletinBlock({ icon, title, color, bg, figures }) {
  return (
    <div style={{ flex: '1 1 220px', border: `1px solid ${color}33`, borderRadius: 'var(--amc-border-radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', background: bg, color, fontWeight: 700, fontSize: 13 }}>{icon} {title}</div>
      <div style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
        {figures.map((f) => (
          <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
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
export default function CoranBulletin({ studentId, studentName, classLabel, classId, appreciation, onAppreciationChange }) {
  const [loading, setLoading] = useState(true);
  const [repetitions, setRepetitions] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [lectures, setLectures] = useState([]);

  const [bulletinUpload, setBulletinUpload] = useState(null);
  const [loadingUpload, setLoadingUpload] = useState(true);
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setLoadingUpload(true);
    api.get(`/coran/bulletin-upload/${studentId}`)
      .then(({ data }) => { if (!cancelled) setBulletinUpload(data.upload || null); })
      .catch(() => { if (!cancelled) setBulletinUpload(null); })
      .finally(() => { if (!cancelled) setLoadingUpload(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('Fichier trop volumineux (10 Mo max)');
      e.target.value = '';
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const fileBase64 = reader.result?.toString().split(',')[1];
        const { data } = await api.post('/coran/bulletin-upload', { studentId, classId, fileName: file.name, fileBase64 });
        setBulletinUpload(data.upload);
        toast.success('Bulletin importé');
      } catch (err) {
        toast.error(err.response?.data?.error || 'Erreur lors de l\'import du bulletin');
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteUpload = async () => {
    if (!bulletinUpload || !window.confirm('Supprimer le bulletin importé ?')) return;
    try {
      await api.delete(`/coran/bulletin-upload/${bulletinUpload.id}`);
      setBulletinUpload(null);
      toast.success('Bulletin importé supprimé');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  if (loading) return <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement du bulletin…</p>;

  const kpis = computeCoranKpis({ repetitions, revisions, lectures });

  return (
    <div className="ep-bulletin ep-print-zone">
      <div className="ep-bulletin-header">
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>
          Association Mosquée Colmar
        </div>
        <h2 style={{ margin: '6px 0', color: '#0891B2', fontSize: 20 }}>Bulletin de suivi Coran</h2>
        <div style={{ fontSize: 14, color: 'var(--amc-text)', fontWeight: 600 }}>{classLabel}</div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: '#6B7280' }}>Élève</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{studentName}</div>
      </div>

      <div className="ep-no-print" style={{ marginBottom: 18, padding: '10px 14px', border: '1px dashed var(--amc-border)', borderRadius: 'var(--amc-border-radius-lg)', background: 'var(--amc-light-bg-2)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📎 Bulletin importé</div>
        {loadingUpload ? (
          <span style={{ fontSize: 12, color: '#6B7280' }}>Chargement…</span>
        ) : bulletinUpload ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <a href={bulletinUpload.fileUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">📄 {bulletinUpload.fileName}</a>
            <span style={{ fontSize: 11, color: '#6B7280' }}>importé le {fmtDate(bulletinUpload.createdAt)}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleDeleteUpload}>🗑️ Supprimer</button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>Aucun bulletin importé pour le moment.</div>
        )}
        <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
          {uploading ? 'Import…' : (bulletinUpload ? '🔄 Remplacer le fichier' : '⬆️ Importer un bulletin (PDF, image…)')}
          <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={handleFileChange} disabled={uploading} />
        </label>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <BulletinBlock
          icon="🔁" title="Apprentissage (الحفظ)" color="#0891B2" bg="#ECFEFF"
          figures={[
            { label: 'Pages apprises', value: `${kpis.pagesApprises} / ${MAX_MUSHAF_PAGE} (${kpis.pctApprises}%)` },
            { label: 'Pages maîtrisées (≥30 rép.)', value: kpis.mastered },
          ]}
        />
        <BulletinBlock
          icon="📖" title="Révision (المراجعة)" color="#D97706" bg="#FFFBEB"
          figures={[
            { label: 'Pages révisées au total', value: kpis.totalRevisionPages },
            { label: 'Moyenne par semaine', value: `${kpis.avgRevisionPerWeek.toFixed(1)} page(s)` },
            { label: 'Nombre de révisions', value: kpis.totalRevisions },
          ]}
        />
        <BulletinBlock
          icon="🎤" title="Lecture (التلاوة)" color="#16A34A" bg="#F0FDF4"
          figures={[
            { label: 'Pages récitées', value: `${kpis.pagesRecitees} / ${MAX_MUSHAF_PAGE} (${kpis.pctRecitees}%)` },
            { label: 'Séances de lecture', value: kpis.totalLectureSeances },
            { label: 'Temps total', value: formatMinutes(kpis.totalLectureMinutes) },
          ]}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'block', color: 'var(--amc-text)' }}>
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
          <div style={{ marginTop: 8, padding: '10px 14px', background: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: 'var(--amc-border-radius)', fontStyle: 'italic', fontSize: 14, color: '#0E7490' }}>
            « {appreciation} »
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 32 }}>Cachet et signature de l'enseignant</div>
          <div style={{ width: 160, borderTop: '1px solid #D1D5DB' }} />
        </div>
      </div>
    </div>
  );
}
