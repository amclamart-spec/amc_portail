import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2 } from 'react-icons/fi';

const OPERATORS = [
  { value: 'LTE', label: '≤ (inférieur ou égal)' },
  { value: 'GTE', label: '≥ (supérieur ou égal)' },
  { value: 'EQ',  label: '= (égal)' },
  { value: 'LT',  label: '< (strictement inférieur)' },
  { value: 'GT',  label: '> (strictement supérieur)' },
];

const TYPES = [
  { value: 'MONTHLY_INCOME', label: 'Revenu mensuel (€)' },
  { value: 'ADULTS_COUNT',   label: "Nombre d'adultes" },
  { value: 'CHILDREN_COUNT', label: "Nombre d'enfants" },
];

const EMPTY = { key: '', label: '', description: '', type: 'MONTHLY_INCOME', operator: 'LTE', numValue: '', isActive: true };

export default function SocialEligibility() {
  const [criteria, setCriteria] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/social/eligibility-criteria');
      setCriteria(data.criteria || []);
    } catch { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (c) => { setForm({ key: c.key, label: c.label, description: c.description || '', type: c.type, operator: c.operator, numValue: c.numValue ?? '', isActive: c.isActive }); setEditId(c.id); setModal(true); };
  const openCreate = () => { setForm(EMPTY); setEditId(null); setModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, numValue: form.numValue !== '' ? Number(form.numValue) : null, isActive: Boolean(form.isActive) };
      if (editId) await api.put(`/social/eligibility-criteria/${editId}`, payload);
      else await api.post('/social/eligibility-criteria', payload);
      toast.success(editId ? 'Critère modifié' : 'Critère créé');
      setModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const opLabel = (op) => OPERATORS.find((o) => o.value === op)?.label || op;
  const typeLabel = (t) => TYPES.find((x) => x.value === t)?.label || t;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Critères d'éligibilité</h2>
        <button className="btn btn-primary" onClick={openCreate}><FiPlus size={14} /> Nouveau critère</button>
      </div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Ces critères sont évalués automatiquement lors de la soumission d'un dossier. Un dossier est accepté automatiquement si tous les critères actifs sont satisfaits.
      </p>
      <div className="card">
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Clé</th><th>Libellé</th><th>Type</th><th>Condition</th><th>Valeur seuil</th><th>Actif</th><th>Actions</th></tr></thead>
              <tbody>
                {criteria.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun critère</td></tr>
                ) : criteria.map((c) => (
                  <tr key={c.id}>
                    <td><code style={{ fontSize: 11, background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>{c.key}</code></td>
                    <td style={{ fontWeight: 600 }}>{c.label}</td>
                    <td>{typeLabel(c.type)}</td>
                    <td>{opLabel(c.operator)}</td>
                    <td>{c.numValue != null ? Number(c.numValue).toFixed(0) : '—'}</td>
                    <td><span className={`badge ${c.isActive ? 'badge-success' : 'badge-gray'}`}>{c.isActive ? 'Actif' : 'Inactif'}</span></td>
                    <td><button className="btn btn-sm btn-outline" onClick={() => openEdit(c)}><FiEdit2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 480 }}>
            <div className="card-header"><h3>{editId ? 'Modifier le critère' : 'Nouveau critère'}</h3><button className="btn btn-outline btn-sm" onClick={() => setModal(false)}>Fermer</button></div>
            <form onSubmit={handleSave} style={{ padding: 16, display: 'grid', gap: 12 }}>
              {!editId && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Clé unique *</label>
                  <input className="form-control" value={form.key} onChange={(e) => setForm((p) => ({ ...p, key: e.target.value.toUpperCase().replace(/\s/g, '_') }))} placeholder="EX: INCOME_MAX" required />
                </div>
              )}
              <div className="form-group" style={{ margin: 0 }}>
                <label>Libellé *</label>
                <input className="form-control" value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Description</label>
                <input className="form-control" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Type</label>
                  <select className="form-control" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Opérateur</label>
                  <select className="form-control" value={form.operator} onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value }))}>
                    {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Valeur seuil</label>
                <input className="form-control" type="number" step="any" value={form.numValue} onChange={(e) => setForm((p) => ({ ...p, numValue: e.target.value }))} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
                Critère actif (utilisé pour l'évaluation automatique)
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
