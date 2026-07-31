import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const STYLES = `
  .ns-f-content   { max-width:760px; }
  .ns-f-sec       { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); overflow:hidden; margin-bottom:16px; }
  .ns-f-sec-head  { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:11px 16px; background:var(--amc-light-bg-2); border-bottom:1px solid var(--amc-border); font-weight:700; font-size:13px; color:var(--amc-text); }
  .ns-f-sec-body  { padding:14px 16px; }
  .ns-f-note-row  { display:flex; align-items:center; gap:12px; padding:9px 0; border-bottom:1px solid var(--amc-border); }
  .ns-f-note-row:last-child { border-bottom:none; }
  .ns-f-note-badge { width:46px; height:46px; border-radius:50%; border:2.5px solid; display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; }
  .ns-f-note-badge strong { font-size:14px; font-weight:800; line-height:1; }
  .ns-f-note-badge span   { font-size:8px; color:#6B7280; line-height:1; margin-top:1px; }
  .ns-f-form-grid { display:grid; grid-template-columns:1fr; gap:12px; }
  @media(min-width:560px) { .ns-f-form-grid.cols-3 { grid-template-columns:2fr 1fr 1fr; } }
  @media(min-width:560px) { .ns-f-form-grid.cols-2 { grid-template-columns:2fr 1fr; } }
  .ns-f-period-select { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
  .ns-f-period-select label { font-weight:700; font-size:13px; color:var(--amc-text); white-space:nowrap; }
`;

function noteColor(note, bareme) {
  const pct = (note / bareme) * 100;
  return pct >= 80 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
}

function noteBg(note, bareme) {
  const pct = (note / bareme) * 100;
  return pct >= 80 ? '#F0FDF4' : pct >= 50 ? '#FFFBEB' : '#FEF2F2';
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function NoteBadge({ note, bareme }) {
  const color = noteColor(note, bareme);
  return (
    <div className="ns-f-note-badge" style={{ borderColor: color, background: noteBg(note, bareme) }}>
      <strong style={{ color }}>{note}</strong>
      <span>/{bareme}</span>
    </div>
  );
}

export default function NotesScolaireFamilyPanel({ studentId, periodOptions }) {
  const options = periodOptions && periodOptions.length > 0 ? periodOptions : [{ label: 'Année complète', value: 'ANNUEL' }];
  const [selectedPeriod, setSelectedPeriod] = useState(options[0].value);

  useEffect(() => {
    setSelectedPeriod(options[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, options[0]?.value]);

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [matiere, setMatiere] = useState('');
  const [note, setNote] = useState('');
  const [bareme, setBareme] = useState('20');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [commentaire, setCommentaire] = useState('');
  const [saving, setSaving] = useState(false);

  const [bulletinUploads, setBulletinUploads] = useState([]);
  const [loadingUpload, setLoadingUpload] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/notes-scolaires/${studentId}`)
      .then(({ data }) => { if (!cancelled) setNotes(data.notes || []); })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger les notes scolaires'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingUpload(true);
    api.get(`/notes-scolaires/bulletin/${studentId}`)
      .then(({ data }) => { if (!cancelled) setBulletinUploads(data.uploads || []); })
      .catch(() => { if (!cancelled) setBulletinUploads([]); })
      .finally(() => { if (!cancelled) setLoadingUpload(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const bulletinForPeriod = bulletinUploads.find((u) => u.period === selectedPeriod) || null;

  const handleAddNote = async () => {
    if (!matiere.trim()) { toast.error('Indiquez la matière'); return; }
    if (note === '' || Number.isNaN(Number(note))) { toast.error('Indiquez une note valide'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/notes-scolaires', {
        studentId,
        period: selectedPeriod,
        matiere: matiere.trim(),
        note: Number(note),
        bareme: Number(bareme) || 20,
        date,
        commentaire: commentaire || undefined,
      });
      setNotes((prev) => [data.note, ...prev]);
      setMatiere('');
      setNote('');
      setCommentaire('');
      toast.success('Note ajoutée');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de l\'ajout de la note');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (id) => {
    if (!window.confirm('Supprimer cette note ?')) return;
    try {
      await api.delete(`/notes-scolaires/${id}`);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast.success('Note supprimée');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

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
        const { data } = await api.post('/notes-scolaires/bulletin', { studentId, period: selectedPeriod, fileName: file.name, fileBase64 });
        setBulletinUploads((prev) => [data.upload, ...prev]);
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
    if (!bulletinForPeriod || !window.confirm('Supprimer le bulletin importé pour cette période ?')) return;
    try {
      await api.delete(`/notes-scolaires/bulletin/${bulletinForPeriod.id}`);
      setBulletinUploads((prev) => prev.filter((u) => u.id !== bulletinForPeriod.id));
      toast.success('Bulletin supprimé');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  if (loading) return <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement…</p>;

  const notesForPeriod = notes.filter((n) => n.period === selectedPeriod);
  const notesByMatiere = notesForPeriod.reduce((acc, n) => {
    const k = n.matiere || 'Autre';
    if (!acc[k]) acc[k] = [];
    acc[k].push(n);
    return acc;
  }, {});

  return (
    <div className="ns-f-content">
      <style>{STYLES}</style>

      {options.length > 1 && (
        <div className="ns-f-period-select">
          <label>Période</label>
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: 180, maxWidth: '100%' }}
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      <div className="ns-f-sec">
        <div className="ns-f-sec-head">📎 Bulletin scolaire</div>
        <div className="ns-f-sec-body">
          {loadingUpload ? (
            <span style={{ fontSize: 12, color: '#6B7280' }}>Chargement…</span>
          ) : bulletinForPeriod ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <a href={bulletinForPeriod.fileUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">📄 {bulletinForPeriod.fileName}</a>
              <span style={{ fontSize: 11, color: '#6B7280' }}>importé le {fmtDate(bulletinForPeriod.createdAt)}</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={handleDeleteUpload}>🗑️ Supprimer</button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>Aucun bulletin importé pour cette période.</div>
          )}
          <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
            {uploading ? 'Import…' : (bulletinForPeriod ? '🔄 Remplacer le fichier' : '⬆️ Importer mon bulletin (PDF, image…)')}
            <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={handleFileChange} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="ns-f-sec">
        <div className="ns-f-sec-head">➕ Ajouter une note (Pronote)</div>
        <div className="ns-f-sec-body">
          <div className="ns-f-form-grid cols-3" style={{ marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Matière</label>
              <input type="text" className="form-control" placeholder="Mathématiques, Français…" value={matiere} onChange={(e) => setMatiere(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Note</label>
              <input type="number" step="0.5" className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Barème</label>
              <input type="number" step="0.5" className="form-control" value={bareme} onChange={(e) => setBareme(e.target.value)} />
            </div>
          </div>
          <div className="ns-f-form-grid cols-2" style={{ marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Commentaire (optionnel)</label>
              <input type="text" className="form-control" placeholder="Contrôle du…, devoir maison…" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Date</label>
              <input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={handleAddNote}>
              {saving ? 'Ajout…' : 'Ajouter la note'}
            </button>
          </div>
        </div>
      </div>

      {Object.keys(notesByMatiere).length === 0 ? (
        <div className="sp-empty">
          <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
          <p style={{ color: '#6B7280', fontSize: 14 }}>Aucune note scolaire pour cette période.</p>
        </div>
      ) : (
        Object.entries(notesByMatiere).map(([mat, matNotes]) => {
          const valid = matNotes.filter((n) => n.note != null);
          const avgPct = valid.length > 0 ? valid.reduce((s, n) => s + (n.note / n.bareme) * 100, 0) / valid.length : null;
          return (
            <div key={mat} className="ns-f-sec">
              <div className="ns-f-sec-head">
                <span>{mat}</span>
                {avgPct != null && <span style={{ color: noteColor(avgPct, 100), fontWeight: 800 }}>{(avgPct / 5).toFixed(1)}/20 moy.</span>}
              </div>
              <div className="ns-f-sec-body">
                {[...matNotes].sort((a, b) => new Date(b.date) - new Date(a.date)).map((n) => (
                  <div key={n.id} className="ns-f-note-row">
                    <NoteBadge note={n.note} bareme={n.bareme} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amc-text)' }}>{fmtDate(n.date)}</div>
                      {n.commentaire && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{n.commentaire}</div>}
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => handleDeleteNote(n.id)}>🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
