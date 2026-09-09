import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { FiMail, FiFileText, FiUsers, FiPaperclip, FiX, FiSearch } from 'react-icons/fi';

function plainTextToHtml(plainText) {
  if (!plainText) return '';
  const escaped = plainText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const paragraphs = escaped.split(/\n\n+/);
  return paragraphs
    .map((para) => {
      const lines = para.split('\n').map((line) => line.trim()).filter((line) => line);
      return `<p>${lines.join('<br>')}</p>`;
    })
    .join('');
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
  const [sending, setSending] = useState(false);

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
    if (!form.subject || !form.content) { toast.error('Veuillez remplir le sujet et le contenu'); return; }
    try {
      const { data } = await api.post('/admin/mailing/preview', {
        recipientType,
        poleId: poleId || undefined,
        levelId: levelId || undefined,
        classId: classId || undefined,
        subject: form.subject,
        content: plainTextToHtml(form.content),
      });
      setPreview(data.preview);
      setShowPreview(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur chargement aperçu');
    }
  }

  // --- Envoi BCC (mode critères) ---
  async function submitBcc() {
    if (!form.subject || !form.content) { toast.error('Sujet et contenu sont requis'); return; }
    const emails = bccEmails.split(/[;,\n]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) { toast.error('Aucun destinataire CCI renseigné'); return; }
    const confirmed = window.confirm(`Confirmer l'envoi du mail à ${emails.length} destinataire(s) ?`);
    if (!confirmed) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('bccEmails', JSON.stringify(emails));
      formData.append('subject', form.subject);
      formData.append('content', plainTextToHtml(form.content));
      if (attachment) formData.append('attachment', attachment);
      const { data } = await api.post('/admin/mailing/send-bcc', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const ok = data.successCount ?? emails.length;
      const ko = data.failedCount ?? 0;
      toast.success(ko > 0 ? `Mail envoyé : ${ok} succès, ${ko} échec(s)` : `Mail envoyé à ${ok} destinataire(s) !`);
      setForm({ subject: '', content: '' });
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
    if (!form.subject || !form.content) { toast.error('Sujet et contenu sont requis'); return; }
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
      formData.append('content', plainTextToHtml(form.content));
      if (attachment) formData.append('attachment', attachment);
      const { data } = await api.post('/admin/mailing/send', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const result = data.result || {};
      toast.success(`Mail envoyé ! ${result.successCount} succès / ${result.failedCount} échoués`);
      setForm({ subject: '', content: '' });
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
          <label>Message (texte brut)</label>
          <textarea
            rows={12}
            className="form-control"
            placeholder="Entrez votre message ici."
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
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
              <div style={{ flex: 1, padding: 12, background: '#ecfdf5', border: '1px solid #86efac', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 500, color: '#166534' }}>✓ {attachment.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>{(attachment.size / 1024).toFixed(1)} KB</p>
                </div>
                <button type="button" onClick={() => setAttachment(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>
                  <FiX size={20} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          {mode === 'criteria' ? (
            <button className="btn btn-primary" onClick={submitBcc} disabled={sending || !form.subject || !form.content || !bccEmails.trim()}>
              {sending ? 'Envoi en cours...' : 'Envoyer aux destinataires'}
            </button>
          ) : (
            <>
              <button className="btn btn-outline" onClick={loadPreview} disabled={sending || !form.subject || !form.content}>
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
