import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import SourateSelect from './SourateSelect';
import MonthCalendar from './MonthCalendar';
import { ApprentissageKpis, RevisionKpis, LectureKpis } from './CoranKpis';
import { MAX_MUSHAF_PAGE, fmtDate, isoWeekNumber, appreciationMeta } from './sourateUtils';

const PAGE_SIZE = 10;

const STYLES = `
  .cor-subtabs    { display:grid; grid-template-columns:repeat(3,1fr); border-radius:var(--amc-border-radius-lg); overflow:hidden; border:1px solid var(--amc-border); background:var(--amc-light-bg-2); margin-bottom:16px; box-shadow:var(--amc-shadow); }
  .cor-subtab     { display:flex; flex-direction:column; align-items:center; gap:3px; padding:10px 6px; border:none; cursor:pointer; background:transparent; color:#6B7280; font-family:var(--amc-font-family); font-size:11px; font-weight:600; min-height:44px; }
  .cor-subtab.active { background:#0891B2; color:#fff; }
  .cor-subtab + .cor-subtab { border-left:1px solid var(--amc-border); }

  .cor-add-box    { padding:14px; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); background:var(--amc-light-bg-2); margin-bottom:16px; }
  .cor-filters    { display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end; margin-bottom:12px; }
  .cor-filter-clear { font-size:11px; color:var(--amc-primary); background:none; border:none; cursor:pointer; padding:2px 0; font-weight:700; }

  .cor-mini-plus  { width:30px; height:30px; border-radius:50%; border:none; background:#0891B2; color:#fff; font-size:16px; font-weight:700; cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
  .cor-mini-plus:disabled { opacity:.6; cursor:default; }
  .cor-badge-valide  { background:#DCFCE7; color:#166534; border:1px solid #BBF7D0; padding:2px 9px; border-radius:999px; font-size:11px; font-weight:700; white-space:nowrap; }
  .cor-badge-attente { background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; padding:2px 9px; border-radius:999px; font-size:11px; font-weight:700; white-space:nowrap; }

  .cor-pagination { display:flex; align-items:center; justify-content:space-between; margin-top:12px; flex-wrap:wrap; gap:8px; }

  .cor-section-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:18px 0 10px; }
  .cor-section-head:first-child { margin-top:0; }
  .cor-badge-nv   { background:#DBEAFE; color:#1E40AF; border:1px solid #BFDBFE; }
  .cor-badge-anc  { background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; }
  .cor-badge-nv, .cor-badge-anc { display:inline-block; padding:2px 10px; border-radius:999px; font-size:11px; font-weight:700; }

  .cor-table-wrap { overflow-x:auto; border:1px solid var(--amc-border); border-radius:var(--amc-border-radius-lg); background:#fff; box-shadow:var(--amc-shadow); }
  .cor-table      { width:100%; border-collapse:collapse; font-size:13px; }
  .cor-table th   { text-align:left; padding:9px 12px; background:var(--amc-light-bg-2); font-size:12px; color:#6B7280; font-weight:700; white-space:nowrap; }
  .cor-table td   { padding:9px 12px; border-top:1px solid var(--amc-light-bg-2); white-space:nowrap; }

  .cor-modal-grid { display:grid; gap:12px; }
  @media(min-width:480px) { .cor-modal-grid.cor-2col { grid-template-columns:1fr 1fr; } }

  .cor-layout     { display:grid; grid-template-columns:1fr; gap:16px; align-items:start; }
  @media(min-width:960px) { .cor-layout { grid-template-columns:1fr 280px; } }
`;

function barColor(compteur) {
  if (compteur >= 30) return '#16A34A';
  if (compteur > 0) return '#D97706';
  return '#D1D5DB';
}

function AppreciationBadge({ value }) {
  const meta = appreciationMeta(value);
  if (!meta) return <span className="cor-badge-attente">Non évaluée</span>;
  return <span className="cor-badge-valide" style={{ color: meta.color, background: meta.bg, borderColor: meta.color }}>{meta.icon} {meta.label}</span>;
}

/* ─── Sous-onglet 1 : Apprentissage (الحفظ) — pages en cours de mémorisation ── */
function ApprentissageTab({ studentId, sourates }) {
  const [repetitions, setRepetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState({});

  const [addSourateId, setAddSourateId] = useState('');
  const [addPageDebut, setAddPageDebut] = useState('');
  const [addPageFin, setAddPageFin] = useState('');
  const [adding, setAdding] = useState(false);

  const [filterSourateId, setFilterSourateId] = useState('');
  const [filterPage, setFilterPage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api.get(`/coran/repetitions/${studentId}`)
      .then(({ data }) => setRepetitions(data.repetitions || []))
      .catch(() => toast.error('Impossible de charger les pages en apprentissage'))
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => { setCurrentPage(1); }, [filterSourateId, filterPage]);

  const existingPagesSet = useMemo(() => new Set(repetitions.map((r) => r.numeroPage)), [repetitions]);

  const addRangeConflicts = useMemo(() => {
    const debut = Number(addPageDebut);
    const fin = addPageFin ? Number(addPageFin) : debut;
    if (!addPageDebut || !Number.isInteger(debut) || !Number.isInteger(fin) || debut > fin) return [];
    const conflicts = [];
    for (let p = debut; p <= fin; p += 1) if (existingPagesSet.has(p)) conflicts.push(p);
    return conflicts;
  }, [addPageDebut, addPageFin, existingPagesSet]);

  const handleAddPages = async () => {
    const debut = Number(addPageDebut);
    const fin = addPageFin ? Number(addPageFin) : debut;
    if (!Number.isInteger(debut) || !Number.isInteger(fin) || debut < 1 || fin > MAX_MUSHAF_PAGE || debut > fin) {
      toast.error(`Plage de pages invalide (1 à ${MAX_MUSHAF_PAGE}, début ≤ fin)`);
      return;
    }
    const conflictsBeforeSubmit = addRangeConflicts;
    setAdding(true);
    try {
      const { data } = await api.post('/coran/repetitions', { studentId, sourateId: addSourateId || undefined, pageDebut: debut, pageFin: fin });
      setRepetitions((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        (data.created || []).forEach((row) => byId.set(row.id, row));
        return Array.from(byId.values());
      });
      if (data.addedCount > 0) toast.success(`${data.addedCount} page${data.addedCount > 1 ? 's' : ''} ajoutée${data.addedCount > 1 ? 's' : ''}`);
      if (data.skippedCount > 0) {
        toast(`Déjà dans votre liste, ignorée${conflictsBeforeSubmit.length > 1 ? 's' : ''} : page${conflictsBeforeSubmit.length > 1 ? 's' : ''} ${conflictsBeforeSubmit.join(', ') || data.skippedCount}`);
      }
      setAddPageDebut('');
      setAddPageFin('');
      setCurrentPage(1);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de l\'ajout');
    } finally {
      setAdding(false);
    }
  };

  const handleIncrement = async (rep) => {
    if (pendingIds[rep.id]) return;
    setPendingIds((p) => ({ ...p, [rep.id]: true }));
    const previous = rep;
    setRepetitions((prev) => prev.map((r) => (r.id === rep.id ? { ...r, compteur: r.compteur + 1, derniereDate: new Date().toISOString() } : r)));
    try {
      const { data } = await api.post('/coran/repetitions/increment', { studentId, numeroPage: rep.numeroPage, sourateId: rep.sourateId || undefined });
      setRepetitions((prev) => prev.map((r) => (r.id === rep.id ? data.repetition : r)));
    } catch (e) {
      setRepetitions((prev) => prev.map((r) => (r.id === rep.id ? previous : r)));
      toast.error(e.response?.data?.error || 'Impossible d\'incrémenter cette page');
    } finally {
      setPendingIds((p) => { const next = { ...p }; delete next[rep.id]; return next; });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette page de la liste ?')) return;
    try {
      await api.delete(`/coran/repetitions/${id}`);
      setRepetitions((prev) => prev.filter((r) => r.id !== id));
      toast.success('Page supprimée');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const filtered = useMemo(() => repetitions
    .filter((r) => !filterSourateId || r.sourateId === filterSourateId)
    .filter((r) => !filterPage.trim() || String(r.numeroPage) === filterPage.trim())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [repetitions, filterSourateId, filterPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) return <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement…</p>;

  return (
    <div className="cor-layout">
      <div>
      <ApprentissageKpis repetitions={repetitions} />
      <div className="cor-add-box">
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>➕ Ajouter une ou plusieurs pages à apprendre</div>
        <div className="cor-modal-grid cor-2col" style={{ marginBottom: 10 }}>
          <div className="form-group">
            <label>Sourate (optionnel)</label>
            <SourateSelect sourates={sourates} value={addSourateId} onChange={setAddSourateId} />
          </div>
          <div className="cor-modal-grid cor-2col">
            <div className="form-group">
              <label>Page début</label>
              <input type="number" min={1} max={MAX_MUSHAF_PAGE} className="form-control" value={addPageDebut} onChange={(e) => setAddPageDebut(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Page fin (optionnel)</label>
              <input type="number" min={1} max={MAX_MUSHAF_PAGE} className="form-control" value={addPageFin} onChange={(e) => setAddPageFin(e.target.value)} placeholder="= page début si vide" />
            </div>
          </div>
        </div>
        {addRangeConflicts.length > 0 && (
          <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 'var(--amc-border-radius)', padding: '6px 10px', marginBottom: 10 }}>
            ⚠️ Déjà dans votre liste : page{addRangeConflicts.length > 1 ? 's' : ''} {addRangeConflicts.join(', ')}. Chaque page ne peut être ajoutée qu'une seule fois.
          </div>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={handleAddPages} disabled={adding || !addPageDebut}>
          {adding ? 'Ajout…' : '+ Ajouter'}
        </button>
      </div>

      <div className="cor-filters">
        <div style={{ minWidth: 220 }}>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Filtrer par sourate</label>
          <SourateSelect sourates={sourates} value={filterSourateId} onChange={setFilterSourateId} placeholder="Toutes les sourates" />
          {filterSourateId && <button type="button" className="cor-filter-clear" onClick={() => setFilterSourateId('')}>Réinitialiser</button>}
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Filtrer par page</label>
          <input type="number" min={1} max={MAX_MUSHAF_PAGE} className="form-control" style={{ width: 120 }} value={filterPage} onChange={(e) => setFilterPage(e.target.value)} placeholder="N° page" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Aucune page ajoutée pour le moment.</div>
      ) : (
        <>
          <div className="cor-table-wrap">
            <table className="cor-table">
              <thead>
                <tr>
                  <th>Sourate</th><th>Page</th><th>Date début</th><th>Semaine</th><th>Répétitions</th><th>Appréciation</th><th></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => (
                  <tr key={r.id}>
                    <td>{r.sourate?.nomFr || '—'}</td>
                    <td style={{ fontWeight: 800 }}>{r.numeroPage}</td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td>S{isoWeekNumber(r.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: barColor(r.compteur) }}>{r.compteur} / 30</span>
                        <button
                          type="button"
                          className="cor-mini-plus"
                          aria-label={`Incrémenter la page ${r.numeroPage}`}
                          disabled={!!pendingIds[r.id]}
                          onClick={() => handleIncrement(r)}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td><AppreciationBadge value={r.appreciation} /></td>
                    <td><button type="button" className="btn btn-outline btn-sm" onClick={() => handleDelete(r.id)}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cor-pagination">
            <span style={{ fontSize: 12, color: '#6B7280' }}>{filtered.length} page{filtered.length !== 1 ? 's' : ''} — page {currentPage}/{totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-outline btn-sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>← Précédent</button>
              <button type="button" className="btn btn-outline btn-sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Suivant →</button>
            </div>
          </div>
        </>
      )}
      </div>
      <MonthCalendar markedDates={repetitions.map((r) => r.createdAt)} legendLabel="Jour d'ajout d'une page" />
    </div>
  );
}

/* ─── Modale générique ajout (révision / lecture) ───────────────────────────── */
function EntryModal({ title, sourates, onClose, onSubmit, showDuree, showCommentaire, submitLabel }) {
  const [sourateId, setSourateId] = useState('');
  const [pageDebut, setPageDebut] = useState('');
  const [pageFin, setPageFin] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dureeMinutes, setDureeMinutes] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!sourateId) { toast.error('Sélectionnez une sourate'); return; }
    const debut = Number(pageDebut);
    const fin = Number(pageFin);
    if (!Number.isInteger(debut) || !Number.isInteger(fin) || debut < 1 || fin > MAX_MUSHAF_PAGE || debut > fin) {
      toast.error(`Plage de pages invalide (1 à ${MAX_MUSHAF_PAGE}, début ≤ fin)`);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ sourateId, pageDebut: debut, pageFin: fin, date, dureeMinutes: dureeMinutes || undefined, commentaire: commentaire || undefined });
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="card modal-card" style={{ maxWidth: 460 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="card-header"><h3 style={{ margin: 0 }}>{title}</h3></div>
        <div style={{ padding: 16 }}>
          <div className="cor-modal-grid">
            <div className="form-group">
              <label>Sourate</label>
              <SourateSelect sourates={sourates} value={sourateId} onChange={setSourateId} />
            </div>
            <div className="cor-modal-grid cor-2col">
              <div className="form-group">
                <label>Page début</label>
                <input type="number" min={1} max={MAX_MUSHAF_PAGE} className="form-control" value={pageDebut} onChange={(e) => setPageDebut(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Page fin</label>
                <input type="number" min={1} max={MAX_MUSHAF_PAGE} className="form-control" value={pageFin} onChange={(e) => setPageFin(e.target.value)} />
              </div>
            </div>
            <div className="cor-modal-grid cor-2col">
              <div className="form-group">
                <label>Date</label>
                <input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {showDuree && (
                <div className="form-group">
                  <label>Durée (minutes)</label>
                  <input type="number" min={0} className="form-control" value={dureeMinutes} onChange={(e) => setDureeMinutes(e.target.value)} />
                </div>
              )}
            </div>
            {showCommentaire && (
              <div className="form-group">
                <label>Commentaire (optionnel)</label>
                <textarea className="form-control" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Enregistrement…' : (submitLabel || 'Valider')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sous-onglet 2 : Révisions ──────────────────────────────────────────────── */
function RevisionsTab({ studentId, sourates }) {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState(null); // 'NOUVELLE_PAGE' | 'ANCIENNE_PAGE' | null

  const load = () => {
    setLoading(true);
    api.get(`/coran/revisions/${studentId}`)
      .then(({ data }) => setRevisions(data.revisions || []))
      .catch(() => toast.error('Impossible de charger les révisions'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [studentId]);

  const handleAdd = async ({ sourateId, pageDebut, pageFin, date }) => {
    await api.post('/coran/revisions', { studentId, sourateId, pageDebut, pageFin, date, type: modalType });
    toast.success('Révision ajoutée');
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette révision ?')) return;
    try {
      await api.delete(`/coran/revisions/${id}`);
      toast.success('Révision supprimée');
      setRevisions((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const renderSection = (type, label, badgeClass) => {
    const items = revisions.filter((r) => r.type === type).sort((a, b) => new Date(b.date) - new Date(a.date));
    return (
      <div>
        <div className="cor-section-head">
          <span className={badgeClass}>{label}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setModalType(type)}>+ Ajouter</button>
        </div>
        {items.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>Aucune révision enregistrée.</div>
        ) : (
          <div className="cor-table-wrap">
            <table className="cor-table">
              <thead><tr><th>Sourate</th><th>Pages</th><th>Date</th><th>Appréciation</th><th></th></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.sourate?.nomFr}</td>
                    <td>{r.pageDebut}–{r.pageFin}</td>
                    <td>{fmtDate(r.date)}</td>
                    <td><AppreciationBadge value={r.appreciation} /></td>
                    <td><button type="button" className="btn btn-outline btn-sm" onClick={() => handleDelete(r.id)}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement…</p>;

  return (
    <div className="cor-layout">
      <div>
        <RevisionKpis revisions={revisions} />
        {renderSection('NOUVELLE_PAGE', 'Révision Nouvelle Page', 'cor-badge-nv')}
        {renderSection('ANCIENNE_PAGE', 'Révision Ancienne Page', 'cor-badge-anc')}
        {modalType && (
          <EntryModal
            title={modalType === 'NOUVELLE_PAGE' ? 'Ajouter une révision — Nouvelle Page' : 'Ajouter une révision — Ancienne Page'}
            sourates={sourates}
            onClose={() => setModalType(null)}
            onSubmit={handleAdd}
          />
        )}
      </div>
      <MonthCalendar markedDates={revisions.map((r) => r.date)} legendLabel="Jour de révision" />
    </div>
  );
}

/* ─── Sous-onglet 3 : Entraînement Lecture / Tajwid ─────────────────────────── */
function LectureTab({ studentId, sourates }) {
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/coran/lectures/${studentId}`)
      .then(({ data }) => setLectures(data.lectures || []))
      .catch(() => toast.error('Impossible de charger l\'historique de lecture'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [studentId]);

  const handleAdd = async ({ sourateId, pageDebut, pageFin, date, dureeMinutes, commentaire }) => {
    await api.post('/coran/lectures', { studentId, sourateId, pageDebut, pageFin, date, dureeMinutes, commentaire });
    toast.success('Séance de lecture ajoutée');
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette séance de lecture ?')) return;
    try {
      await api.delete(`/coran/lectures/${id}`);
      toast.success('Séance supprimée');
      setLectures((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  if (loading) return <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement…</p>;

  const sorted = [...lectures].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="cor-layout">
      <div>
        <LectureKpis lectures={lectures} />
        <div className="cor-section-head">
          <span style={{ fontSize: 13, color: '#6B7280' }}>{lectures.length} séance{lectures.length !== 1 ? 's' : ''} enregistrée{lectures.length !== 1 ? 's' : ''}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>+ Ajouter une séance</button>
        </div>
        {sorted.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Aucune séance de lecture enregistrée.</div>
        ) : (
          <div className="cor-table-wrap">
            <table className="cor-table">
              <thead><tr><th>Sourate</th><th>Pages</th><th>Durée</th><th>Date</th><th>Appréciation</th><th></th></tr></thead>
              <tbody>
                {sorted.map((l) => (
                  <tr key={l.id}>
                    <td>{l.sourate?.nomFr}</td>
                    <td>{l.pageDebut}–{l.pageFin}</td>
                    <td>{l.dureeMinutes ? `${l.dureeMinutes} min` : '—'}</td>
                    <td>{fmtDate(l.date)}</td>
                    <td><AppreciationBadge value={l.appreciation} /></td>
                    <td><button type="button" className="btn btn-outline btn-sm" onClick={() => handleDelete(l.id)}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {modalOpen && (
          <EntryModal
            title="Ajouter une séance de lecture"
            sourates={sourates}
            onClose={() => setModalOpen(false)}
            onSubmit={handleAdd}
            showDuree
            showCommentaire
          />
        )}
      </div>
      <MonthCalendar markedDates={lectures.map((l) => l.date)} legendLabel="Jour de lecture" />
    </div>
  );
}

/* ─── Panel principal ────────────────────────────────────────────────────────── */
const SUBTABS = [
  { id: 'repetitions', label: 'Apprentissage (الحفظ)', icon: '🔁' },
  { id: 'revisions', label: 'Révision (المراجعة)', icon: '📖' },
  { id: 'lecture', label: 'Lecture (التلاوة)', icon: '🎤' },
];

export default function CoranFamilyPanel({ studentId }) {
  const [sourates, setSourates] = useState([]);
  const [loadingSourates, setLoadingSourates] = useState(true);
  const [subTab, setSubTab] = useState('repetitions');

  useEffect(() => {
    api.get('/coran/sourates')
      .then(({ data }) => setSourates(data.sourates || []))
      .catch(() => toast.error('Impossible de charger la liste des sourates'))
      .finally(() => setLoadingSourates(false));
  }, []);

  if (loadingSourates) return <p style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Chargement…</p>;

  return (
    <div>
      <style>{STYLES}</style>
      <div className="cor-subtabs">
        {SUBTABS.map((t) => (
          <button key={t.id} type="button" className={`cor-subtab${subTab === t.id ? ' active' : ''}`} onClick={() => setSubTab(t.id)}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {subTab === 'repetitions' && <ApprentissageTab studentId={studentId} sourates={sourates} />}
      {subTab === 'revisions' && <RevisionsTab studentId={studentId} sourates={sourates} />}
      {subTab === 'lecture' && <LectureTab studentId={studentId} sourates={sourates} />}
    </div>
  );
}
