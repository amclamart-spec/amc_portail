import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { FiMail, FiFileText, FiUsers, FiPaperclip, FiX } from 'react-icons/fi';

/**
 * Convertit le texte brut en HTML lisible
 * Gère les sauts de ligne, espaces multiples, et crée des paragraphes
 */
function plainTextToHtml(plainText) {
  if (!plainText) return '';

  // Échapper les caractères HTML spéciaux
  const escaped = plainText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Convertir les double sauts de ligne en paragraphes
  const paragraphs = escaped.split(/\n\n+/);

  return paragraphs
    .map((para) => {
      // Convertir les simple sauts de ligne en <br>
      const lines = para.split('\n').map((line) => line.trim()).filter((line) => line);
      return `<p>${lines.join('<br>')}</p>`;
    })
    .join('');
}

export default function AdminMailing() {
  const [form, setForm] = useState({
    recipientType: 'ALL_FAMILIES',
    poleId: '',
    levelId: '',
    classId: '',
    subject: '',
    content: '',
  });

  const [attachment, setAttachment] = useState(null);
  const [structure, setStructure] = useState([]);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Charger la structure des pôles/niveaux/classes
  useEffect(() => {
    async function loadStructure() {
      try {
        const { data } = await api.get('/admin/mailing/structure');
        setStructure(data.structure || []);
      } catch (error) {
        toast.error('Impossible de charger la structure');
      } finally {
        setLoading(false);
      }
    }
    loadStructure();
  }, []);

  // Réinitialiser les sélections si le type de destinataire change
  const handleRecipientTypeChange = (newType) => {
    setForm((prev) => ({
      ...prev,
      recipientType: newType,
      poleId: '',
      levelId: '',
      classId: '',
    }));
    setPreview(null);
  };

  // Récupérer un aperçu des destinataires
  async function loadPreview() {
    if (!form.subject || !form.content) {
      toast.error('Veuillez remplir le sujet et le contenu');
      return;
    }

    try {
      const htmlContent = plainTextToHtml(form.content);
      const { data } = await api.post('/admin/mailing/preview', {
        recipientType: form.recipientType,
        poleId: form.poleId || undefined,
        levelId: form.levelId || undefined,
        classId: form.classId || undefined,
        subject: form.subject,
        content: htmlContent,
      });

      setPreview(data.preview);
      setShowPreview(true);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur chargement aperçu');
    }
  }

  // Gérer la sélection du fichier
  function handleAttachmentChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vérifier la taille (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('La pièce jointe ne doit pas dépasser 5 MB');
      return;
    }

    // Vérifier les formats autorisés
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/png',
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error('Format non autorisé. Acceptés: PDF, Word, Excel, texte, images');
      return;
    }

    setAttachment(file);
  }

  function removeAttachment() {
    setAttachment(null);
  }

  // Envoyer le mailing
  async function submitMailing() {
    if (!form.subject || !form.content) {
      toast.error('Sujet et contenu sont requis');
      return;
    }

    if (!preview) {
      toast.error('Veuillez d\'abord générer un aperçu');
      return;
    }

    const confirmed = window.confirm(
      `Confirmer l'envoi du mail à ${preview.recipientCount} destinataire(s) ?\n\n${preview.recipientInfo}`
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('recipientType', form.recipientType);
      if (form.poleId) formData.append('poleId', form.poleId);
      if (form.levelId) formData.append('levelId', form.levelId);
      if (form.classId) formData.append('classId', form.classId);
      formData.append('subject', form.subject);
      formData.append('content', plainTextToHtml(form.content));

      if (attachment) {
        formData.append('attachment', attachment);
      }

      const { data } = await api.post('/admin/mailing/send', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const result = data.result || {};
      toast.success(
        `Mail envoyé!\n${result.successCount} succès / ${result.failedCount} échoués`
      );

      // Réinitialiser le formulaire
      setForm({
        recipientType: 'ALL_FAMILIES',
        poleId: '',
        levelId: '',
        classId: '',
        subject: '',
        content: '',
      });
      setAttachment(null);
      setPreview(null);
      setShowPreview(false);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur envoi mail');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  const selectedPole = structure.find((p) => p.id === form.poleId);
  const selectedLevel = selectedPole?.levels.find((l) => l.id === form.levelId);

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>
        <FiMail style={{ marginRight: 8, display: 'inline' }} />
        Envoi de mails en masse
      </h2>

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
                  checked={form.recipientType === option.value}
                  onChange={(e) => handleRecipientTypeChange(e.target.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {(form.recipientType === 'POLE_FAMILIES' ||
          form.recipientType === 'LEVEL_FAMILIES' ||
          form.recipientType === 'CLASS_FAMILIES') && (
          <>
            <div className="form-group">
              <label>Sélectionner un Pôle</label>
              <select
                className="form-control"
                value={form.poleId}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    poleId: e.target.value,
                    levelId: '',
                    classId: '',
                  }))
                }
              >
                <option value="">-- Choisir un pôle --</option>
                {structure.map((pole) => (
                  <option key={pole.id} value={pole.id}>
                    {pole.name}
                  </option>
                ))}
              </select>
            </div>

            {(form.recipientType === 'LEVEL_FAMILIES' ||
              form.recipientType === 'CLASS_FAMILIES') &&
              form.poleId && (
                <div className="form-group">
                  <label>Sélectionner un Niveau</label>
                  <select
                    className="form-control"
                    value={form.levelId}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        levelId: e.target.value,
                        classId: '',
                      }))
                    }
                  >
                    <option value="">-- Choisir un niveau --</option>
                    {selectedPole?.levels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

            {form.recipientType === 'CLASS_FAMILIES' &&
              form.levelId && (
                <div className="form-group">
                  <label>Sélectionner une Classe</label>
                  <select
                    className="form-control"
                    value={form.classId}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        classId: e.target.value,
                      }))
                    }
                  >
                    <option value="">-- Choisir une classe --</option>
                    {selectedLevel?.classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
          </>
        )}
      </div>

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
            onChange={(e) =>
              setForm((p) => ({ ...p, subject: e.target.value }))
            }
          />
        </div>

        <div className="form-group">
          <label>Message (texte brut)</label>
          <textarea
            rows={12}
            className="form-control"
            placeholder="Entrez votre message ici. Les sauts de ligne seront conservés et bien formatés dans le mail."
            value={form.content}
            onChange={(e) =>
              setForm((p) => ({ ...p, content: e.target.value }))
            }
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <small style={{ color: '#6B7280', marginTop: 8, display: 'block' }}>
            💡 Conseil: Tapez votre message naturellement. Les espaces et les retours à la ligne seront préservés.
            Laissez une ligne vide entre les paragraphes pour les séparer.
          </small>
        </div>

        <div className="form-group">
          <label>Pièce jointe (optionnel)</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'inline-block',
                  padding: '12px 16px',
                  background: '#f0f9ff',
                  border: '2px dashed #0088CC',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: '#0088CC',
                  transition: 'all 0.2s',
                }}
              >
                <FiPaperclip style={{ marginRight: 6, display: 'inline' }} />
                Sélectionner un fichier
                <input
                  type="file"
                  onChange={handleAttachmentChange}
                  style={{ display: 'none' }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
                />
              </label>
            </div>

            {attachment && (
              <div
                style={{
                  flex: 1,
                  padding: 12,
                  background: '#ecfdf5',
                  border: '1px solid #86efac',
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 500, color: '#166534' }}>
                    ✓ {attachment.name}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>
                    {(attachment.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={removeAttachment}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <FiX size={20} />
                </button>
              </div>
            )}
          </div>
          <small style={{ color: '#6B7280', marginTop: 8, display: 'block' }}>
            Formats acceptés: PDF, Word, Excel, texte, images (max 5 MB)
          </small>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <button
            className="btn btn-outline"
            onClick={loadPreview}
            disabled={sending || !form.subject || !form.content}
          >
            <FiFileText style={{ marginRight: 6, display: 'inline' }} />
            Générer aperçu
          </button>
          <button
            className="btn btn-primary"
            onClick={submitMailing}
            disabled={sending || !preview}
          >
            {sending ? 'Envoi en cours...' : 'Envoyer le mail'}
          </button>
        </div>
      </div>

      {showPreview && preview && (
        <div className="card">
          <div className="card-header">
            <h3>
              <FiUsers style={{ marginRight: 6, display: 'inline' }} />
              Aperçu et confirmation
            </h3>
          </div>

          <div style={{ marginBottom: 24 }}>
            <h4 style={{ color: '#213B88', marginBottom: 12 }}>Destinataires</h4>
            <p style={{ color: '#1f2937', marginBottom: 8 }}>
              <strong>{preview.recipientInfo}</strong>
            </p>
            <p style={{ color: '#6B7280', fontSize: 14 }}>
              Total: <strong>{preview.totalRecipients}</strong> destinataire(s)
            </p>

            {preview.recipients.length > 0 && (
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 12,
                }}
              >
                <p style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
                  Premiers destinataires:
                </p>
                <ul style={{ fontSize: 13, color: '#1f2937', margin: 0, paddingLeft: 20 }}>
                  {preview.recipients.map((r, idx) => (
                    <li key={idx}>
                      {r.name} &lt;{r.email}&gt;
                    </li>
                  ))}
                </ul>
                {preview.hasMore && (
                  <p style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>
                    ... et {preview.totalRecipients - preview.recipients.length} autre(s)
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <h4 style={{ color: '#213B88', marginBottom: 12 }}>Aperçu du mail</h4>
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#f3f4f6',
              }}
            >
              <div
                style={{
                  background: '#213B88',
                  color: 'white',
                  padding: 20,
                  textAlign: 'center',
                  fontSize: 24,
                }}
              >
                Logo AMC
              </div>
              <div style={{ background: 'white', padding: 24 }}>
                <h5 style={{ color: '#1f2937', marginBottom: 16 }}>
                  {form.subject}
                </h5>
                <div
                  style={{
                    color: '#1f2937',
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                  dangerouslySetInnerHTML={{ __html: plainTextToHtml(form.content) }}
                />
              </div>
              <div
                style={{
                  background: '#f8fafc',
                  padding: 16,
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#64748b',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <p style={{ margin: 0, marginBottom: 4 }}>
                  Association Partage et des Musulmans de Clamart (AMC)
                </p>
                <p style={{ margin: 0, opacity: 0.7 }}>
                  École de Langue Arabe et Sciences Islamiques
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
