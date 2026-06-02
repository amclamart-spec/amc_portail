import { useEffect, useState } from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const INITIAL_FORM = {
  id: null,
  name: '',
  subject: '',
  body: '',
  variablesText: '',
};

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState('');

  async function loadTemplates() {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/email-templates');
      setTemplates(data.templates || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Impossible de charger les templates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  function editTemplate(template) {
    setForm({
      id: template.id,
      name: template.name,
      subject: template.subject,
      body: template.body,
      variablesText: Array.isArray(template.variables) ? template.variables.join(', ') : '',
    });
    setPreview(template.body || '');
  }

  function resetForm() {
    setForm(INITIAL_FORM);
    setPreview('');
  }

  async function submitForm(event) {
    event.preventDefault();
    if (!form.name || !form.subject || !form.body) {
      toast.error('Nom, sujet et contenu sont requis');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        subject: form.subject,
        body: form.body,
        variables: form.variablesText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      };

      if (form.id) {
        await api.put(`/admin/email-templates/${form.id}`, payload);
        toast.success('Template mis à jour');
      } else {
        await api.post('/admin/email-templates', payload);
        toast.success('Template créé');
      }

      resetForm();
      await loadTemplates();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur enregistrement template');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id) {
    const confirmed = window.confirm('Supprimer ce template ?');
    if (!confirmed) return;

    try {
      await api.delete(`/admin/email-templates/${id}`);
      toast.success('Template supprimé');
      await loadTemplates();
      if (form.id === id) resetForm();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur suppression template');
    }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Templates e-mail</h2>

      <div className="card mb-2">
        <div className="card-header"><h3>{form.id ? 'Modifier template' : 'Créer template'}</h3></div>

        <form onSubmit={submitForm}>
          <div className="form-group">
            <label>Nom template</label>
            <input className="form-control" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>

          <div className="form-group">
            <label>Sujet</label>
            <input className="form-control" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} required />
          </div>

          <div className="form-group">
            <label>Variables (séparées par virgule)</label>
            <input className="form-control" value={form.variablesText} onChange={(e) => setForm((p) => ({ ...p, variablesText: e.target.value }))} placeholder="{{familyName}}, {{studentName}}" />
          </div>

          <div className="form-group">
            <label>Corps HTML</label>
            <textarea className="form-control" rows={8} value={form.body} onChange={(e) => { setForm((p) => ({ ...p, body: e.target.value })); setPreview(e.target.value); }} required />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : (form.id ? 'Mettre à jour' : 'Créer')}</button>
            <button type="button" className="btn btn-outline" onClick={resetForm}>Nouveau</button>
          </div>
        </form>
      </div>

      <div className="card mb-2">
        <div className="card-header"><h3>Aperçu HTML</h3></div>
        {preview ? (
          <div style={{ border: '1px solid var(--amc-border)', borderRadius: 8, padding: 12 }} dangerouslySetInnerHTML={{ __html: preview }} />
        ) : (
          <p style={{ color: '#6B7280' }}>Aucun aperçu disponible.</p>
        )}
      </div>

      <div className="card">
        <div className="card-header"><h3>Liste des templates</h3></div>
        {loading ? (
          <p>Chargement...</p>
        ) : templates.length === 0 ? (
          <p style={{ color: '#6B7280' }}>Aucun template.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Sujet</th>
                  <th>Variables</th>
                  <th>MàJ</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td>{template.name}</td>
                    <td>{template.subject}</td>
                    <td>{Array.isArray(template.variables) ? template.variables.join(', ') : '—'}</td>
                    <td>{new Date(template.updatedAt).toLocaleString('fr-FR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-icon btn-outline" title="Modifier" onClick={() => editTemplate(template)}>
                          <FiEdit2 size={16} />
                        </button>
                        <button className="btn btn-icon btn-danger" title="Supprimer" onClick={() => deleteTemplate(template.id)}>
                          <FiTrash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
