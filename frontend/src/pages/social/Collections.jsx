import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiX } from 'react-icons/fi';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

const COLLECTION_TYPES = ['GENERALE', 'ALIMENTAIRE', 'HYGIENE', 'VETEMENTS', 'AUTRE'];

export default function SocialCollections() {
  const [collections, setCollections] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ label: '', type: 'GENERALE', location: '', reference: '', collectedAt: new Date().toISOString().slice(0, 10), observations: '' });
  const [lines, setLines] = useState([{ productId: '', quantity: '', unit: '' }]);
  const [saving, setSaving] = useState(false);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const { data } = await api.get('/social/collections', { params: { page: p, limit: 20 } });
      setCollections(data.collections || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.get('/social/products', { params: { active: true } }).then(({ data }) => setProducts(data.products || []));
  }, []);

  const addLine = () => setLines((l) => [...l, { productId: '', quantity: '', unit: '' }]);
  const removeLine = (i) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i, field, value) => setLines((l) => l.map((line, idx) => {
    if (idx !== i) return line;
    const updated = { ...line, [field]: value };
    if (field === 'productId') { const p = products.find((p) => p.id === value); if (p) updated.unit = p.unit; }
    return updated;
  }));

  const handleCreate = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.productId && l.quantity);
    if (!form.label || !validLines.length) { toast.error('Libellé et au moins un produit requis'); return; }
    setSaving(true);
    try {
      await api.post('/social/collections', { ...form, lines: validLines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unit: l.unit })) });
      toast.success('Collecte enregistrée');
      setModal(false);
      setForm({ label: '', type: 'GENERALE', location: '', reference: '', collectedAt: new Date().toISOString().slice(0, 10), observations: '' });
      setLines([{ productId: '', quantity: '', unit: '' }]);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Collectes ({total})</h2>
        <button className="btn btn-primary" onClick={() => setModal(true)}><FiPlus size={14} /> Nouvelle collecte</button>
      </div>

      <div className="card">
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Libellé</th><th>Type</th><th>Lieu</th><th>Produits collectés</th><th>Statut</th><th>Opérateur</th></tr></thead>
              <tbody>
                {collections.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucune collecte</td></tr>
                ) : collections.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDate(c.collectedAt)}</td>
                    <td style={{ fontWeight: 600 }}>{c.label}</td>
                    <td>{c.type}</td>
                    <td>{c.location || '—'}</td>
                    <td style={{ fontSize: 12 }}>{c.lines?.map((l) => `${l.product?.name} (${Number(l.quantity).toFixed(0)} ${l.unit})`).join(', ')}</td>
                    <td><span className={`badge ${c.status === 'VALIDATED' ? 'badge-success' : 'badge-gray'}`}>{c.status === 'VALIDATED' ? 'Validée' : c.status}</span></td>
                    <td>{c.user?.firstName} {c.user?.lastName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1); }}>Précédent</button>
            <span style={{ padding: '4px 12px', color: '#6B7280' }}>{page} / {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); load(page + 1); }}>Suivant</button>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 620 }}>
            <div className="card-header"><h3>Nouvelle collecte</h3><button className="btn btn-outline btn-sm" onClick={() => setModal(false)}>Fermer</button></div>
            <form onSubmit={handleCreate} style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Libellé *</label>
                  <input className="form-control" value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Type</label>
                  <select className="form-control" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    {COLLECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Lieu</label>
                  <input className="form-control" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date</label>
                  <input className="form-control" type="date" value={form.collectedAt} onChange={(e) => setForm((p) => ({ ...p, collectedAt: e.target.value }))} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>Produits collectés</strong>
                  <button type="button" className="btn btn-sm btn-outline" onClick={addLine}><FiPlus size={12} /> Ajouter</button>
                </div>
                {lines.map((line, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                    <select className="form-control" value={line.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}>
                      <option value="">— Produit —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input className="form-control" type="number" min="0.01" step="0.01" placeholder="Qté" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
                    <input className="form-control" placeholder="Unité" value={line.unit} onChange={(e) => updateLine(i, 'unit', e.target.value)} />
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeLine(i)} disabled={lines.length === 1}><FiX size={12} /></button>
                  </div>
                ))}
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Observations</label>
                <textarea className="form-control" rows={2} value={form.observations} onChange={(e) => setForm((p) => ({ ...p, observations: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Valider la collecte'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
