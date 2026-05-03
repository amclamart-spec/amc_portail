import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const INITIAL_FORM = {
  subject: '',
  body: '',
  recipientType: 'ALL_FAMILIES',
  recipientIds: [],
  templateId: '',
};

export default function AdminSendMessage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [templates, setTemplates] = useState([]);
  const [classes, setClasses] = useState([]);
  const [families, setFamilies] = useState([]);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [templatesRes, classesRes, familiesRes] = await Promise.all([
          api.get('/admin/email-templates'),
          api.get('/admin/classes'),
          api.get('/admin/families', { params: { limit: 200 } }),
        ]);

        setTemplates(templatesRes.data.templates || []);
        setClasses(classesRes.data.classes || []);
        setFamilies(familiesRes.data.families || []);
      } catch (error) {
        toast.error(error?.response?.data?.error || 'Impossible de charger les données de communication');
      }
    }

    load();
  }, []);

  const selectableItems = useMemo(() => {
    if (form.recipientType === 'SPECIFIC_CLASS') {
      return classes.map((item) => ({
        id: item.id,
        label: `${item.level?.pole?.name || 'Pôle'} - ${item.level?.name || 'Classe'} (${item.dayOfWeek} ${item.startTime})`,
      }));
    }

    if (form.recipientType === 'SPECIFIC_FAMILIES') {
      return families.map((family) => ({ id: family.id, label: `${family.familyName} (${family.user?.email || 'sans email'})` }));
    }

    return [];
  }, [form.recipientType, classes, families]);

  function toggleRecipient(id) {
    setForm((prev) => ({
      ...prev,
      recipientIds: prev.recipientIds.includes(id)
        ? prev.recipientIds.filter((value) => value !== id)
        : [...prev.recipientIds, id],
    }));
  }

  function onTemplateChange(templateId) {
    const selected = templates.find((tpl) => tpl.id === templateId);
    setForm((prev) => ({
      ...prev,
      templateId,
      subject: selected ? selected.subject : prev.subject,
      body: selected ? selected.body : prev.body,
    }));
  }

  async function submitMessage() {
    if (!form.subject || !form.body) {
      toast.error('Sujet et message sont requis');
      return;
    }

    if (form.recipientType !== 'ALL_FAMILIES' && form.recipientIds.length === 0) {
      toast.error('Sélectionnez au moins un destinataire');
      return;
    }

    const confirmed = window.confirm('Confirmer l’envoi du message ?');
    if (!confirmed) return;

    setSending(true);
    try {
      const payload = {
        ...form,
        recipientIds: form.recipientType === 'ALL_FAMILIES' ? [] : form.recipientIds,
        templateId: form.templateId || undefined,
      };

      const { data } = await api.post('/admin/messages/send', payload);
      const result = data.result || {};
      toast.success(`Message envoyé (${result.successCount || 0} succès / ${result.failedCount || 0} échecs)`);
      setForm(INITIAL_FORM);
      setShowPreview(false);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur envoi message');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Envoyer un message</h2>

      <div className="card mb-2">
        <div className="card-header"><h3>Rédaction</h3></div>

        <div className="form-group">
          <label>Template (optionnel)</label>
          <select className="form-control" value={form.templateId} onChange={(e) => onTemplateChange(e.target.value)}>
            <option value="">Aucun template</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Sujet</label>
          <input className="form-control" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} />
        </div>

        <div className="form-group">
          <label>Message HTML</label>
          <textarea rows={10} className="form-control" value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} />
        </div>

        <div className="form-group">
          <label>Destinataires</label>
          <select className="form-control" value={form.recipientType} onChange={(e) => setForm((p) => ({ ...p, recipientType: e.target.value, recipientIds: [] }))}>
            <option value="ALL_FAMILIES">Toutes les familles</option>
            <option value="SPECIFIC_CLASS">Classe(s) spécifique(s)</option>
            <option value="SPECIFIC_FAMILIES">Familles spécifiques</option>
          </select>
        </div>

        {form.recipientType !== 'ALL_FAMILIES' && (
          <div className="form-group">
            <label>Sélection ({form.recipientIds.length} sélectionné(s))</label>
            <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--amc-border)', borderRadius: 8, padding: 8 }}>
              {selectableItems.length === 0 ? (
                <p style={{ color: '#6B7280' }}>Aucune donnée disponible.</p>
              ) : (
                selectableItems.map((item) => (
                  <label key={item.id} style={{ display: 'block', marginBottom: 6 }}>
                    <input type="checkbox" checked={form.recipientIds.includes(item.id)} onChange={() => toggleRecipient(item.id)} /> {' '}
                    {item.label}
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowPreview((prev) => !prev)}>{showPreview ? 'Masquer aperçu' : 'Aperçu'}</button>
          <button className="btn btn-primary" onClick={submitMessage} disabled={sending}>{sending ? 'Envoi...' : 'Envoyer message'}</button>
        </div>
      </div>

      {showPreview && (
        <div className="card">
          <div className="card-header"><h3>Aperçu</h3></div>
          <h4 style={{ marginBottom: 8 }}>{form.subject || 'Sans sujet'}</h4>
          <div style={{ border: '1px solid var(--amc-border)', borderRadius: 8, padding: 12 }} dangerouslySetInnerHTML={{ __html: form.body || '<em>Aucun contenu</em>' }} />
        </div>
      )}
    </div>
  );
}
