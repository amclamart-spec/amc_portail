import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { FiMail, FiFileText, FiUsers, FiPaperclip, FiX, FiSearch, FiEye, FiClock } from 'react-icons/fi';
import {
  BsTypeBold, BsTypeItalic, BsTypeUnderline, BsTypeStrikethrough,
  BsListUl, BsListOl, BsTextLeft, BsTextCenter, BsTextRight,
  BsPalette, BsLink45Deg, BsEraser,
} from 'react-icons/bs';

// Contenu du mail : une vraie chaîne HTML produite par l'éditeur enrichi ci-dessous
// (plus de conversion texte brut -> HTML, le backend attend déjà du HTML).
function isRichTextEmpty(html) {
  if (!html) return true;
  const stripped = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return stripped.length === 0;
}

const RICH_TEXT_COLORS = ['#111827', '#DC2626', '#D97706', '#059669', '#2563EB', '#7C3AED'];

function RichTextToolbarButton({ icon: Icon, title, onClick, active }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, border: 'none', borderRadius: 6,
        background: active ? '#DBEAFE' : 'transparent', color: active ? '#1D4ED8' : '#374151',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      <Icon size={15} />
    </button>
  );
}

// Éditeur enrichi basé sur contentEditable + document.execCommand — non contrôlé côté
// React (le HTML vit dans le DOM, pas dans un state), pour ne pas perturber la position
// du curseur à chaque frappe. Le parent est notifié via onChange à chaque saisie ;
// pour vider/réinitialiser l'éditeur, remonter le composant avec une nouvelle `key`.
function RichTextEditor({ initialHtml, onChange, placeholder }) {
  const editorRef = useRef(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (command, value) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    onChange(editorRef.current?.innerHTML || '');
  };

  const handleLink = () => {
    const url = window.prompt('URL du lien :', 'https://');
    if (url && url.trim()) exec('createLink', url.trim());
  };

  return (
    <div style={{ border: '1px solid #D1D5DB', borderRadius: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
        <RichTextToolbarButton icon={BsTypeBold} title="Gras" onClick={() => exec('bold')} />
        <RichTextToolbarButton icon={BsTypeItalic} title="Italique" onClick={() => exec('italic')} />
        <RichTextToolbarButton icon={BsTypeUnderline} title="Souligné" onClick={() => exec('underline')} />
        <RichTextToolbarButton icon={BsTypeStrikethrough} title="Barré" onClick={() => exec('strikeThrough')} />
        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />
        <RichTextToolbarButton icon={BsListUl} title="Liste à puces" onClick={() => exec('insertUnorderedList')} />
        <RichTextToolbarButton icon={BsListOl} title="Liste numérotée" onClick={() => exec('insertOrderedList')} />
        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />
        <RichTextToolbarButton icon={BsTextLeft} title="Aligner à gauche" onClick={() => exec('justifyLeft')} />
        <RichTextToolbarButton icon={BsTextCenter} title="Centrer" onClick={() => exec('justifyCenter')} />
        <RichTextToolbarButton icon={BsTextRight} title="Aligner à droite" onClick={() => exec('justifyRight')} />
        <div style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />
        <div style={{ position: 'relative' }}>
          <RichTextToolbarButton icon={BsPalette} title="Couleur du texte" onClick={() => setColorPickerOpen((v) => !v)} active={colorPickerOpen} />
          {colorPickerOpen && (
            <div style={{ position: 'absolute', top: 34, left: 0, zIndex: 20, display: 'flex', gap: 6, padding: 8, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              {RICH_TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onMouseDown={(e) => { e.preventDefault(); exec('foreColor', color); setColorPickerOpen(false); }}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: color, border: '1px solid #E5E7EB', cursor: 'pointer', padding: 0 }}
                />
              ))}
            </div>
          )}
        </div>
        <RichTextToolbarButton icon={BsLink45Deg} title="Insérer un lien" onClick={handleLink} />
        <RichTextToolbarButton icon={BsEraser} title="Effacer la mise en forme" onClick={() => exec('removeFormat')} />
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onBlur={() => setColorPickerOpen(false)}
        data-placeholder={placeholder}
        className="rich-text-editable"
        style={{ minHeight: 220, maxHeight: 420, overflowY: 'auto', padding: '10px 12px', fontSize: 14, lineHeight: 1.6, outline: 'none' }}
      />
    </div>
  );
}

const SENT_MAILS_PER_PAGE = 20;

function defaultSentFromDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}
function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}
function formatSentDate(value) {
  return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Historique des mails envoyés (rubrique Mailing) — filtrable par date (3 derniers
// mois par défaut) et recherche libre, listé du plus récent au plus ancien (façon
// Outlook), avec un détail par mail (destinataires + message) au clic.
function SentMailsPanel() {
  const [filters, setFilters] = useState({ from: defaultSentFromDate(), to: todayDateStr(), search: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    setLoading(true);
    const params = { page: pagination.page, limit: SENT_MAILS_PER_PAGE };
    if (appliedFilters.from) params.from = appliedFilters.from;
    if (appliedFilters.to) params.to = appliedFilters.to;
    if (appliedFilters.search.trim()) params.search = appliedFilters.search.trim();
    api.get('/admin/mailing/sent', { params })
      .then(({ data }) => {
        setLogs(data.logs || []);
        setPagination((prev) => ({ ...prev, total: data.total || 0, totalPages: data.totalPages || 1 }));
      })
      .catch(() => toast.error('Impossible de charger les mails envoyés'))
      .finally(() => setLoading(false));
  }, [appliedFilters, pagination.page]);

  const applyFilters = () => {
    setPagination((prev) => ({ ...prev, page: 1 }));
    setAppliedFilters(filters);
  };
  const resetFilters = () => {
    const next = { from: defaultSentFromDate(), to: todayDateStr(), search: '' };
    setFilters(next);
    setPagination((prev) => ({ ...prev, page: 1 }));
    setAppliedFilters(next);
  };

  const openDetail = async (id) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const { data } = await api.get(`/admin/mailing/sent/${id}`);
      setDetail(data.log);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Impossible de charger ce mail');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="card mb-4">
      <div className="card-header">
        <h3><FiClock style={{ marginRight: 6, display: 'inline' }} />Mails envoyés</h3>
      </div>

      {/* Filtres */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto auto', gap: 12, alignItems: 'end', marginBottom: 16 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Du</label>
          <input type="date" className="form-control" value={filters.from} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Au</label>
          <input type="date" className="form-control" value={filters.to} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Recherche</label>
          <input
            type="text"
            className="form-control"
            placeholder="Objet du mail ou email d'un destinataire…"
            value={filters.search}
            onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={applyFilters}>Filtrer</button>
        <button type="button" className="btn btn-outline" onClick={resetFilters}>Réinitialiser</button>
      </div>

      {/* Liste */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#6B7280', padding: 24 }}>Chargement…</p>
      ) : logs.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#6B7280', padding: 24 }}>Aucun mail envoyé sur cette période.</p>
      ) : (
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '10px 8px' }}>Date d'envoi</th>
                <th style={{ padding: '10px 8px' }}>Objet</th>
                <th style={{ padding: '10px 8px' }}>Destinataires</th>
                <th style={{ padding: '10px 8px' }}>Statut</th>
                <th style={{ padding: '10px 8px' }}>Envoyé par</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => openDetail(log.id)}
                  style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', color: '#6B7280' }}>{formatSentDate(log.createdAt)}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600, color: '#111827' }}>
                    {log.subject}
                    {log.attachmentFilename && <FiPaperclip size={12} style={{ marginLeft: 6, verticalAlign: 'middle', color: '#6B7280' }} />}
                  </td>
                  <td style={{ padding: '10px 8px', color: '#374151' }}>
                    {log.recipientLabel || '—'} <span style={{ color: '#6B7280' }}>({log.recipientCount})</span>
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <span className="badge badge-success" style={{ fontSize: 11 }}>{log.successCount} envoyé{log.successCount > 1 ? 's' : ''}</span>
                    {log.failedCount > 0 && (
                      <span className="badge badge-danger" style={{ fontSize: 11, marginLeft: 4 }}>{log.failedCount} échec{log.failedCount > 1 ? 's' : ''}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px', color: '#6B7280' }}>{log.sentByName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button type="button" className="btn btn-outline btn-sm" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>Précédent</button>
          <span style={{ fontSize: 13, color: '#6B7280' }}>Page {pagination.page} / {pagination.totalPages}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>Suivant</button>
        </div>
      )}

      {/* Modale détail */}
      {detailOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, color: 'var(--amc-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {detail?.subject || 'Chargement…'}
                </h3>
                {detail && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
                    Envoyé le {formatSentDate(detail.createdAt)} par {detail.sentByName || '—'}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setDetailOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', flexShrink: 0 }}>
                <FiX size={22} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              {detailLoading || !detail ? (
                <p style={{ textAlign: 'center', color: '#6B7280', padding: 24 }}>Chargement…</p>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Destinataires ({detail.recipientCount})
                      {detail.recipientLabel && <span style={{ fontWeight: 400, textTransform: 'none' }}> — {detail.recipientLabel}</span>}
                    </div>
                    <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8, padding: 10, background: '#F9FAFB' }}>
                      {(detail.recipients || []).map((r, i) => (
                        <div key={i} style={{ fontSize: 13, padding: '3px 0', color: '#374151' }}>
                          {r.name ? `${r.name} — ` : ''}<span style={{ color: '#6B7280' }}>{r.email}</span>
                        </div>
                      ))}
                    </div>
                    {detail.attachmentFilename && (
                      <p style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>
                        <FiPaperclip size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        Pièce jointe : {detail.attachmentFilename}
                      </p>
                    )}
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Message</div>
                  <div
                    style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, fontSize: 14, lineHeight: 1.6, color: '#1f2937' }}
                    dangerouslySetInnerHTML={{ __html: detail.content }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminMailing() {
  // --- Critères de ciblage ---
  const [criteria, setCriteria] = useState({ population: '', objet: '', statut: '' });
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  // --- Sous-critère "Classe" : pôle puis classes du pôle (sélection multiple) ---
  const [criteriaPoleId, setCriteriaPoleId] = useState('');
  const [criteriaClassIds, setCriteriaClassIds] = useState(new Set());

  // --- Modale destinataires ---
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRecipients, setModalRecipients] = useState([]);
  const [checkedEmails, setCheckedEmails] = useState(new Set());
  const [recipientSearch, setRecipientSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);
  const RECIPIENTS_PER_PAGE = 20;

  // --- Champ BCC ---
  const [bccEmails, setBccEmails] = useState('');

  // --- Formulaire mail ---
  const [form, setForm] = useState({ subject: '', content: '' });
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState(null);
  const [sending, setSending] = useState(false);
  // Incrémenté pour forcer le remontage (donc la remise à vide) de l'éditeur enrichi
  // non contrôlé après l'envoi d'un mail.
  const [editorResetKey, setEditorResetKey] = useState(0);

  // --- Ancien ciblage par type (conservé) ---
  const [recipientType, setRecipientType] = useState('ALL_FAMILIES');
  const [poleId, setPoleId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [classId, setClassId] = useState('');
  const [structure, setStructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // Mode d'utilisation : 'classic' (type destinataire) ou 'criteria' (ciblage par critères)
  const [mode, setMode] = useState('criteria');

  useEffect(() => {
    api.get('/admin/mailing/structure')
      .then(({ data }) => setStructure(data.structure || []))
      .catch(() => toast.error('Impossible de charger la structure'))
      .finally(() => setLoading(false));
  }, []);

  // URL locale (blob:) pour prévisualiser/ouvrir la pièce jointe avant envoi — recréée
  // à chaque changement de fichier, révoquée automatiquement pour ne pas fuiter la mémoire.
  useEffect(() => {
    if (!attachment) { setAttachmentPreviewUrl(null); return; }
    const url = URL.createObjectURL(attachment);
    setAttachmentPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  // --- Sous-critère "Classe" : classes du pôle sélectionné (toutes niveaux confondus) ---
  const criteriaSelectedPole = structure.find((p) => p.id === criteriaPoleId);
  const classesForCriteriaPole = criteriaSelectedPole
    ? criteriaSelectedPole.levels.flatMap((l) => l.classes.map((c) => ({ ...c, levelName: l.name })))
    : [];

  function toggleCriteriaClass(id) {
    setCriteriaClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllCriteriaClasses() {
    setCriteriaClassIds((prev) => (
      prev.size === classesForCriteriaPole.length
        ? new Set()
        : new Set(classesForCriteriaPole.map((c) => c.id))
    ));
  }

  // --- Recherche destinataires par critères ---
  async function searchByCriteria() {
    if (!criteria.population) {
      toast.error('Veuillez sélectionner une population');
      return;
    }
    if (criteria.population === 'CLASSE') {
      if (criteriaClassIds.size === 0) {
        toast.error('Veuillez sélectionner au moins une classe');
        return;
      }
      if (!criteria.statut) {
        toast.error('Veuillez sélectionner le statut d\'inscription');
        return;
      }
    } else if (criteria.population !== 'PROFESSEURS' && (!criteria.objet || !criteria.statut)) {
      toast.error('Veuillez sélectionner l\'objet et le statut');
      return;
    }
    setCriteriaLoading(true);
    try {
      const payload = criteria.population === 'CLASSE'
        ? { population: criteria.population, statut: criteria.statut, classIds: Array.from(criteriaClassIds) }
        : criteria;
      const { data } = await api.post('/admin/mailing/recipients-by-criteria', payload);
      const recipients = data.recipients || [];
      setModalRecipients(recipients);
      setCheckedEmails(new Set(recipients.map((r) => r.email)));
      setRecipientSearch('');
      setModalPage(1);
      setModalOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la recherche');
    } finally {
      setCriteriaLoading(false);
    }
  }

  function validateRecipients() {
    const emails = modalRecipients
      .filter((r) => checkedEmails.has(r.email))
      .map((r) => r.email)
      .join('; ');
    setBccEmails(emails);
    setModalOpen(false);
    toast.success(`${checkedEmails.size} destinataire(s) ajouté(s)`);
  }

  function toggleEmail(email) {
    setCheckedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  // --- Filtre + pagination de la modale destinataires ---
  const recipientSearchLower = recipientSearch.trim().toLowerCase();
  const filteredRecipients = recipientSearchLower
    ? modalRecipients.filter((r) => (
        (r.firstName || '').toLowerCase().includes(recipientSearchLower) ||
        (r.lastName || '').toLowerCase().includes(recipientSearchLower) ||
        (r.email || '').toLowerCase().includes(recipientSearchLower)
      ))
    : modalRecipients;
  const modalPageCount = Math.max(1, Math.ceil(filteredRecipients.length / RECIPIENTS_PER_PAGE));
  const currentModalPage = Math.min(modalPage, modalPageCount);
  const visibleRecipients = filteredRecipients.slice((currentModalPage - 1) * RECIPIENTS_PER_PAGE, currentModalPage * RECIPIENTS_PER_PAGE);
  const allFilteredChecked = filteredRecipients.length > 0 && filteredRecipients.every((r) => checkedEmails.has(r.email));
  const someFilteredChecked = filteredRecipients.some((r) => checkedEmails.has(r.email));

  function toggleAll() {
    setCheckedEmails((prev) => {
      const next = new Set(prev);
      if (allFilteredChecked) {
        filteredRecipients.forEach((r) => next.delete(r.email));
      } else {
        filteredRecipients.forEach((r) => next.add(r.email));
      }
      return next;
    });
  }

  // --- Pièce jointe ---
  function handleAttachmentChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('La pièce jointe ne doit pas dépasser 5 MB'); return; }
    const allowed = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','image/jpeg','image/png'];
    if (!allowed.includes(file.type)) { toast.error('Format non autorisé'); return; }
    setAttachment(file);
  }

  // --- Aperçu (mode classic) ---
  async function loadPreview() {
    if (!form.subject || isRichTextEmpty(form.content)) { toast.error('Veuillez remplir le sujet et le contenu'); return; }
    try {
      const { data } = await api.post('/admin/mailing/preview', {
        recipientType,
        poleId: poleId || undefined,
        levelId: levelId || undefined,
        classId: classId || undefined,
        subject: form.subject,
        content: form.content,
      });
      setPreview(data.preview);
      setShowPreview(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur chargement aperçu');
    }
  }

  // Libellé lisible du ciblage par critères, envoyé au backend pour l'historique
  // "Mails envoyés" (colonne Destinataires).
  function buildCriteriaRecipientLabel() {
    const POPULATION_LABEL = { TOUS: 'Tous', FAMILLES: 'Familles', PROFESSEURS: 'Professeurs', CLASSE: 'Classe' };
    const OBJET_LABEL = { INSCRIPTION: 'Inscription', PAIEMENT: 'Paiement' };
    const STATUT_LABEL = { EN_ATTENTE: 'En attente', VALIDE: 'Validé' };
    if (criteria.population === 'PROFESSEURS') return 'Professeurs';
    if (criteria.population === 'CLASSE') {
      return `Classe (${criteriaClassIds.size} classe${criteriaClassIds.size > 1 ? 's' : ''}) — ${STATUT_LABEL[criteria.statut] || ''}`.trim();
    }
    const parts = [POPULATION_LABEL[criteria.population] || criteria.population];
    if (criteria.objet) parts.push(OBJET_LABEL[criteria.objet] || criteria.objet);
    if (criteria.statut) parts.push(STATUT_LABEL[criteria.statut] || criteria.statut);
    return parts.join(' — ');
  }

  // --- Envoi BCC (mode critères) ---
  async function submitBcc() {
    if (!form.subject || isRichTextEmpty(form.content)) { toast.error('Sujet et contenu sont requis'); return; }
    const emails = bccEmails.split(/[;,\n]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) { toast.error('Aucun destinataire CCI renseigné'); return; }
    const confirmed = window.confirm(`Confirmer l'envoi du mail à ${emails.length} destinataire(s) ?`);
    if (!confirmed) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('bccEmails', JSON.stringify(emails));
      formData.append('subject', form.subject);
      formData.append('content', form.content);
      formData.append('recipientLabel', buildCriteriaRecipientLabel());
      if (attachment) formData.append('attachment', attachment);
      const { data } = await api.post('/admin/mailing/send-bcc', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const ok = data.successCount ?? emails.length;
      const ko = data.failedCount ?? 0;
      toast.success(ko > 0 ? `Mail envoyé : ${ok} succès, ${ko} échec(s)` : `Mail envoyé à ${ok} destinataire(s) !`);
      setForm({ subject: '', content: '' });
      setEditorResetKey((k) => k + 1);
      setBccEmails('');
      setAttachment(null);
      setCriteria({ population: '', objet: '', statut: '' });
      setCriteriaPoleId('');
      setCriteriaClassIds(new Set());
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur envoi mail');
    } finally {
      setSending(false);
    }
  }

  // --- Envoi classic ---
  async function submitMailing() {
    if (!form.subject || isRichTextEmpty(form.content)) { toast.error('Sujet et contenu sont requis'); return; }
    if (!preview) { toast.error('Veuillez d\'abord générer un aperçu'); return; }
    const confirmed = window.confirm(`Confirmer l'envoi du mail à ${preview.recipientCount} destinataire(s) ?\n\n${preview.recipientInfo}`);
    if (!confirmed) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('recipientType', recipientType);
      if (poleId) formData.append('poleId', poleId);
      if (levelId) formData.append('levelId', levelId);
      if (classId) formData.append('classId', classId);
      formData.append('subject', form.subject);
      formData.append('content', form.content);
      if (attachment) formData.append('attachment', attachment);
      const { data } = await api.post('/admin/mailing/send', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const result = data.result || {};
      toast.success(`Mail envoyé ! ${result.successCount} succès / ${result.failedCount} échoués`);
      setForm({ subject: '', content: '' });
      setEditorResetKey((k) => k + 1);
      setAttachment(null);
      setPreview(null);
      setShowPreview(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur envoi mail');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  const selectedPole = structure.find((p) => p.id === poleId);
  const selectedLevel = selectedPole?.levels.find((l) => l.id === levelId);

  return (
    <div>
      <style>{`
        .rich-text-editable:empty:before { content: attr(data-placeholder); color: #9CA3AF; pointer-events: none; }
        .rich-text-editable ul, .rich-text-editable ol { margin: 0 0 0 20px; padding: 0; }
        .rich-text-editable a { color: #2563EB; }
      `}</style>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>
        <FiMail style={{ marginRight: 8, display: 'inline' }} />
        Envoi de mails en masse
      </h2>

      {/* Sélecteur de mode */}
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn ${mode === 'criteria' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMode('criteria')}
          >
            Ciblage par critères
          </button>
          <button
            type="button"
            className={`btn ${mode === 'classic' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMode('classic')}
          >
            Ciblage par type
          </button>
          <button
            type="button"
            className={`btn ${mode === 'sent' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMode('sent')}
          >
            <FiClock style={{ marginRight: 6, display: 'inline' }} />
            Mails envoyés
          </button>
        </div>
      </div>

      {/* ===== MODE CRITÈRES ===== */}
      {mode === 'criteria' && (
        <div className="card mb-4">
          <div className="card-header">
            <h3>
              <FiUsers style={{ marginRight: 6, display: 'inline' }} />
              Ciblage par critères
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Population</label>
              <select
                className="form-control"
                value={criteria.population}
                onChange={(e) => {
                  const population = e.target.value;
                  setCriteria({ population, objet: '', statut: '' });
                  setCriteriaPoleId('');
                  setCriteriaClassIds(new Set());
                }}
              >
                <option value="">-- Choisir --</option>
                <option value="TOUS">Tous</option>
                <option value="FAMILLES">Familles</option>
                <option value="PROFESSEURS">Professeurs</option>
                <option value="CLASSE">Classe</option>
              </select>
            </div>

            {criteria.population === 'CLASSE' ? (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Pôle</label>
                <select
                  className="form-control"
                  value={criteriaPoleId}
                  onChange={(e) => { setCriteriaPoleId(e.target.value); setCriteriaClassIds(new Set()); }}
                >
                  <option value="">-- Choisir un pôle --</option>
                  {structure.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Objet</label>
                <select
                  className="form-control"
                  value={criteria.objet}
                  onChange={(e) => setCriteria((p) => ({ ...p, objet: e.target.value }))}
                  disabled={!criteria.population || criteria.population === 'PROFESSEURS'}
                >
                  <option value="">-- Choisir --</option>
                  <option value="INSCRIPTION">Inscription</option>
                  <option value="PAIEMENT">Paiement</option>
                </select>
              </div>
            )}

            {criteria.population !== 'PROFESSEURS' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Statut {criteria.population === 'CLASSE' ? 'd\'inscription' : ''}</label>
                <select
                  className="form-control"
                  value={criteria.statut}
                  onChange={(e) => setCriteria((p) => ({ ...p, statut: e.target.value }))}
                  disabled={criteria.population === 'CLASSE' ? false : !criteria.objet}
                >
                  <option value="">-- Choisir --</option>
                  <option value="EN_ATTENTE">En attente</option>
                  <option value="VALIDE">Validé</option>
                </select>
              </div>
            )}
          </div>

          {criteria.population === 'PROFESSEURS' && (
            <p style={{ marginTop: 12, fontSize: 13, color: '#6B7280' }}>
              Pour les professeurs, tous les professeurs actifs seront sélectionnés (objet et statut non applicables).
            </p>
          )}

          {criteria.population === 'CLASSE' && (
            <p style={{ marginTop: 12, fontSize: 13, color: '#6B7280' }}>
              Seules les familles des élèves dont l'inscription correspond au statut choisi ci-dessus seront ciblées.
            </p>
          )}

          {/* Sélection des classes du pôle choisi */}
          {criteria.population === 'CLASSE' && criteriaPoleId && (
            <div className="form-group" style={{ marginTop: 16 }}>
              <label style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  Classes <span style={{ fontWeight: 400, fontSize: 12, color: '#6B7280' }}>({criteriaClassIds.size} sélectionnée{criteriaClassIds.size > 1 ? 's' : ''})</span>
                </span>
                {classesForCriteriaPole.length > 0 && (
                  <button type="button" className="sp-link-btn" style={{ fontSize: 12, color: 'var(--amc-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }} onClick={toggleAllCriteriaClasses}>
                    {criteriaClassIds.size === classesForCriteriaPole.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </button>
                )}
              </label>
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, maxHeight: 260, overflowY: 'auto', background: '#F9FAFB' }}>
                {classesForCriteriaPole.length === 0 ? (
                  <p style={{ color: '#6B7280', margin: 0 }}>Aucune classe pour ce pôle</p>
                ) : classesForCriteriaPole.map((cls) => {
                  const checked = criteriaClassIds.has(cls.id);
                  return (
                    <label key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCriteriaClass(cls.id)} style={{ cursor: 'pointer', width: 16, height: 16, flexShrink: 0 }} />
                      <span><strong>{cls.levelName}</strong> — {cls.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={searchByCriteria}
              disabled={
                criteriaLoading ||
                !criteria.population ||
                (criteria.population === 'CLASSE' && (criteriaClassIds.size === 0 || !criteria.statut)) ||
                (!['PROFESSEURS', 'CLASSE'].includes(criteria.population) && (!criteria.objet || !criteria.statut))
              }
            >
              <FiSearch style={{ marginRight: 6, display: 'inline' }} />
              {criteriaLoading ? 'Recherche...' : 'Rechercher les destinataires'}
            </button>
          </div>

          {/* Champ destinataires */}
          <div className="form-group" style={{ marginTop: 20 }}>
            <label style={{ fontWeight: 600 }}>
              Destinataires&nbsp;
              <span style={{ fontWeight: 400, fontSize: 13, color: '#6B7280' }}>
                — Chaque destinataire reçoit son propre email (confidentialité préservée)
              </span>
            </label>
            <textarea
              rows={5}
              className="form-control"
              placeholder="Les adresses email s'ajouteront ici après validation. Vous pouvez aussi les saisir manuellement séparées par ;"
              value={bccEmails}
              onChange={(e) => setBccEmails(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            {bccEmails && (
              <small style={{ color: '#374151', marginTop: 4, display: 'block' }}>
                {bccEmails.split(/[;,\n]+/).filter((e) => e.trim()).length} adresse(s) renseignée(s)
              </small>
            )}
          </div>
        </div>
      )}

      {/* ===== MODE CLASSIC ===== */}
      {mode === 'classic' && (
        <div className="card mb-4">
          <div className="card-header">
            <h3>Configuration des destinataires</h3>
          </div>
          <div className="form-group">
            <label>Type de destinataires</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { value: 'ALL_FAMILIES', label: 'Toutes les familles inscrites' },
                { value: 'TEACHERS', label: 'Tous les professeurs' },
                { value: 'POLE_FAMILIES', label: 'Familles d\'un pôle' },
                { value: 'LEVEL_FAMILIES', label: 'Familles d\'un niveau' },
                { value: 'CLASS_FAMILIES', label: 'Familles d\'une classe' },
              ].map((option) => (
                <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio"
                    name="recipientType"
                    value={option.value}
                    checked={recipientType === option.value}
                    onChange={(e) => { setRecipientType(e.target.value); setPoleId(''); setLevelId(''); setClassId(''); setPreview(null); }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          {['POLE_FAMILIES','LEVEL_FAMILIES','CLASS_FAMILIES'].includes(recipientType) && (
            <>
              <div className="form-group">
                <label>Sélectionner un Pôle</label>
                <select className="form-control" value={poleId} onChange={(e) => { setPoleId(e.target.value); setLevelId(''); setClassId(''); }}>
                  <option value="">-- Choisir un pôle --</option>
                  {structure.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {['LEVEL_FAMILIES','CLASS_FAMILIES'].includes(recipientType) && poleId && (
                <div className="form-group">
                  <label>Sélectionner un Niveau</label>
                  <select className="form-control" value={levelId} onChange={(e) => { setLevelId(e.target.value); setClassId(''); }}>
                    <option value="">-- Choisir un niveau --</option>
                    {selectedPole?.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              {recipientType === 'CLASS_FAMILIES' && levelId && (
                <div className="form-group">
                  <label>Sélectionner une Classe</label>
                  <select className="form-control" value={classId} onChange={(e) => setClassId(e.target.value)}>
                    <option value="">-- Choisir une classe --</option>
                    {selectedLevel?.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {mode !== 'sent' && (
      <>
      {/* ===== RÉDACTION ===== */}
      <div className="card mb-4">
        <div className="card-header">
          <h3>Rédaction du mail</h3>
        </div>

        <div className="form-group">
          <label>Objet du mail</label>
          <input
            className="form-control"
            placeholder="Ex: Informations importantes concernant les inscriptions"
            value={form.subject}
            onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>Message</label>
          <RichTextEditor
            key={editorResetKey}
            initialHtml={form.content}
            onChange={(html) => setForm((p) => ({ ...p, content: html }))}
            placeholder="Entrez votre message ici."
          />
        </div>

        <div className="form-group">
          <label>Pièce jointe (optionnel)</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <label style={{ display: 'inline-block', padding: '12px 16px', background: '#f0f9ff', border: '2px dashed #0088CC', borderRadius: 8, cursor: 'pointer', fontWeight: 500, color: '#0088CC' }}>
              <FiPaperclip style={{ marginRight: 6, display: 'inline' }} />
              Sélectionner un fichier
              <input type="file" onChange={handleAttachmentChange} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png" />
            </label>
            {attachment && (
              <div style={{ flex: 1, padding: 12, background: '#ecfdf5', border: '1px solid #86efac', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {attachment.type.startsWith('image/') && attachmentPreviewUrl && (
                    <img
                      src={attachmentPreviewUrl}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #86efac', flexShrink: 0 }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 500, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✓ {attachment.name}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>{(attachment.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <a
                    href={attachmentPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Visualiser la pièce jointe"
                    className="btn btn-outline btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <FiEye size={14} /> Aperçu
                  </a>
                  <button type="button" title="Retirer la pièce jointe" onClick={() => setAttachment(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>
                    <FiX size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          {mode === 'criteria' ? (
            <button className="btn btn-primary" onClick={submitBcc} disabled={sending || !form.subject || isRichTextEmpty(form.content) || !bccEmails.trim()}>
              {sending ? 'Envoi en cours...' : 'Envoyer aux destinataires'}
            </button>
          ) : (
            <>
              <button className="btn btn-outline" onClick={loadPreview} disabled={sending || !form.subject || isRichTextEmpty(form.content)}>
                <FiFileText style={{ marginRight: 6, display: 'inline' }} />
                Générer aperçu
              </button>
              <button className="btn btn-primary" onClick={submitMailing} disabled={sending || !preview}>
                {sending ? 'Envoi en cours...' : 'Envoyer le mail'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Aperçu (mode classic) */}
      {mode === 'classic' && showPreview && preview && (
        <div className="card">
          <div className="card-header">
            <h3><FiUsers style={{ marginRight: 6, display: 'inline' }} />Aperçu et confirmation</h3>
          </div>
          <p><strong>{preview.recipientInfo}</strong></p>
          <p style={{ color: '#6B7280', fontSize: 14 }}>Total: <strong>{preview.totalRecipients}</strong> destinataire(s)</p>
          {preview.recipients.length > 0 && (
            <ul style={{ fontSize: 13, color: '#1f2937' }}>
              {preview.recipients.map((r, i) => <li key={i}>{r.name} &lt;{r.email}&gt;</li>)}
            </ul>
          )}
          {preview.hasMore && <p style={{ fontSize: 13, color: '#6B7280' }}>... et {preview.totalRecipients - preview.recipients.length} autre(s)</p>}
        </div>
      )}
      </>
      )}

      {mode === 'sent' && (
        <SentMailsPanel />
      )}

      {/* ===== MODALE DESTINATAIRES ===== */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {/* Header modale */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--amc-primary)' }}>Destinataires trouvés</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
                  {modalRecipients.length} résultat(s) — {checkedEmails.size} sélectionné(s)
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}>
                <FiX size={22} />
              </button>
            </div>

            {/* Filtre nom / email */}
            {modalRecipients.length > 0 && (
              <div style={{ padding: '16px 24px 0' }}>
                <div style={{ position: 'relative' }}>
                  <FiSearch size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Filtrer par nom ou email…"
                    value={recipientSearch}
                    onChange={(e) => { setRecipientSearch(e.target.value); setModalPage(1); }}
                    style={{ paddingLeft: 32 }}
                  />
                </div>
              </div>
            )}

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px 0' }}>
              {modalRecipients.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6B7280', padding: 32 }}>Aucun destinataire trouvé pour ces critères.</p>
              ) : filteredRecipients.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6B7280', padding: 32 }}>Aucun destinataire ne correspond à « {recipientSearch} ».</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                      <th style={{ padding: '12px 8px', width: 36 }}>
                        <input
                          type="checkbox"
                          checked={allFilteredChecked}
                          ref={(el) => { if (el) el.indeterminate = !allFilteredChecked && someFilteredChecked; }}
                          onChange={toggleAll}
                          title="Tout sélectionner / désélectionner (résultats filtrés)"
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                      </th>
                      <th style={{ padding: '12px 8px', color: '#374151', fontWeight: 600 }}>Nom</th>
                      <th style={{ padding: '12px 8px', color: '#374151', fontWeight: 600 }}>Prénom</th>
                      <th style={{ padding: '12px 8px', color: '#374151', fontWeight: 600 }}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecipients.map((r, i) => {
                      const checked = checkedEmails.has(r.email);
                      return (
                        <tr
                          key={i}
                          style={{ borderBottom: '1px solid #f3f4f6', background: checked ? '#F0F9FF' : 'transparent', cursor: 'pointer' }}
                          onClick={() => toggleEmail(r.email)}
                        >
                          <td style={{ padding: '10px 8px' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEmail(r.email)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: 'pointer', width: 16, height: 16 }}
                            />
                          </td>
                          <td style={{ padding: '10px 8px', color: checked ? '#111827' : '#6B7280' }}>{r.lastName || '—'}</td>
                          <td style={{ padding: '10px 8px', color: checked ? '#111827' : '#6B7280' }}>{r.firstName || '—'}</td>
                          <td style={{ padding: '10px 8px', color: checked ? '#2563EB' : '#9CA3AF' }}>{r.email}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {filteredRecipients.length > RECIPIENTS_PER_PAGE && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 24px' }}>
                <button type="button" className="btn btn-outline btn-sm" disabled={currentModalPage <= 1} onClick={() => setModalPage(currentModalPage - 1)}>Précédent</button>
                <span style={{ fontSize: 13, color: '#6B7280' }}>Page {currentModalPage} / {modalPageCount}</span>
                <button type="button" className="btn btn-outline btn-sm" disabled={currentModalPage >= modalPageCount} onClick={() => setModalPage(currentModalPage + 1)}>Suivant</button>
              </div>
            )}

            {/* Footer modale */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6B7280' }}>
                {checkedEmails.size} / {modalRecipients.length} sélectionné(s)
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>Annuler</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={validateRecipients}
                  disabled={checkedEmails.size === 0}
                >
                  Valider ({checkedEmails.size} destinataire(s))
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
