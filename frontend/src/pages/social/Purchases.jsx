import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiX } from 'react-icons/fi';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

export default function SocialPurchases() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [budget, setBudget] = useState(null);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [supForm, setSupForm] = useState({ name: '', contact: '', phone: '', email: '', address: '' });
  const [form, setForm] = useState({ supplierId: '', budgetId: '', purchasedAt: new Date().toISOString().slice(0, 10), description: '', observations: '' });
  const [lines, setLines] = useState([{ productId: '', quantity: '', unitPrice: '', unit: '' }]);
  const [saving, setSaving] = useState(false);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const [purchRes, supRes, prodRes] = await Promise.all([
        api.get('/social/purchases', { params: { page: p, limit: 20 } }),
        api.get('/social/suppliers'),
        api.get('/social/products', { params: { active: true } }),
      ]);
      setPurchases(purchRes.data.purchases || []);
      setTotal(purchRes.data.total || 0);
      setTotalPages(purchRes.data.totalPages || 1);
      setSuppliers(supRes.data.suppliers || []);
      setProducts(prodRes.data.products || []);
    } catch { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.get('/social/budget').then(({ data }) => {
      if (data.budget) { setBudget(data.budget); setForm((f) => ({ ...f, budgetId: data.budget.id })); }
    }).catch(() => {});
  }, []);

  const lineTotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const addLine = () => setLines((l) => [...l, { productId: '', quantity: '', unitPrice: '', unit: '' }]);
  const removeLine = (i) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i, field, value) => setLines((l) => l.map((line, idx) => {
    if (idx !== i) return line;
    const updated = { ...line, [field]: value };
    if (field === 'productId') { const p = products.find((p) => p.id === value); if (p) updated.unit = p.unit; }
    return updated;
  }));

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/social/suppliers', supForm);
      toast.success('Fournisseur créé');
      setSuppliers((s) => [...s, data.supplier]);
      setForm((f) => ({ ...f, supplierId: data.supplier.id }));
      setSupplierModal(false);
      setSupForm({ name: '', contact: '', phone: '', email: '', address: '' });
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice);
    if (!validLines.length) { toast.error('Au moins une ligne valide requise'); return; }
    setSaving(true);
    try {
      await api.post('/social/purchases', { ...form, lines: validLines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), unit: l.unit })) });
      toast.success('Achat validé et stock mis à jour');
      setModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Achats ({total})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setSupplierModal(true)}><FiPlus size={14} /> Fournisseur</button>
          <button className="btn btn-primary" onClick={() => setModal(true)}><FiPlus size={14} /> Nouvel achat</button>
        </div>
      </div>

      {budget && (
        <div className="card" style={{ marginBottom: 16, padding: 14, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div><strong>Budget {budget.year}</strong></div>
          <div style={{ color: '#1D4ED8' }}>Alloué : <strong>{Number(budget.totalAmount).toFixed(2)} €</strong></div>
          <div style={{ color: '#DC2626' }}>Consommé : <strong>{Number(budget.consumed || 0).toFixed(2)} €</strong></div>
          <div style={{ color: Number(budget.remaining || 0) < 0 ? '#DC2626' : '#16A34A' }}>Restant : <strong>{Number(budget.remaining || 0).toFixed(2)} €</strong></div>
          {Number(budget.remaining || 0) < 0 && <span className="badge badge-danger">Budget dépassé</span>}
        </div>
      )}

      <div className="card">
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Référence</th><th>Fournisseur</th><th>Description</th><th>Montant</th><th>Statut</th><th>Opérateur</th></tr></thead>
              <tbody>
                {purchases.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun achat</td></tr>
                ) : purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.purchasedAt)}</td>
                    <td>{p.reference || '—'}</td>
                    <td>{p.supplier?.name || '—'}</td>
                    <td>{p.description || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{Number(p.totalAmount).toFixed(2)} €</td>
                    <td><span className={`badge ${p.status === 'VALIDATED' ? 'badge-success' : 'badge-gray'}`}>{p.status === 'VALIDATED' ? 'Validé' : p.status}</span></td>
                    <td>{p.user?.firstName} {p.user?.lastName}</td>
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

      {/* Modal fournisseur */}
      {supplierModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 440 }}>
            <div className="card-header"><h3>Nouveau fournisseur</h3><button className="btn btn-outline btn-sm" onClick={() => setSupplierModal(false)}>Fermer</button></div>
            <form onSubmit={handleCreateSupplier} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}><label>Nom *</label><input className="form-control" value={supForm.name} onChange={(e) => setSupForm((p) => ({ ...p, name: e.target.value }))} required /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Contact</label><input className="form-control" value={supForm.contact} onChange={(e) => setSupForm((p) => ({ ...p, contact: e.target.value }))} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}><label>Téléphone</label><input className="form-control" value={supForm.phone} onChange={(e) => setSupForm((p) => ({ ...p, phone: e.target.value }))} /></div>
                <div className="form-group" style={{ margin: 0 }}><label>Email</label><input className="form-control" type="email" value={supForm.email} onChange={(e) => setSupForm((p) => ({ ...p, email: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setSupplierModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal achat */}
      {modal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 680 }}>
            <div className="card-header"><h3>Nouvel achat</h3><button className="btn btn-outline btn-sm" onClick={() => setModal(false)}>Fermer</button></div>
            <form onSubmit={handleCreate} style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Fournisseur</label>
                  <select className="form-control" value={form.supplierId} onChange={(e) => setForm((p) => ({ ...p, supplierId: e.target.value }))}>
                    <option value="">— Sélectionner —</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date d'achat</label>
                  <input className="form-control" type="date" value={form.purchasedAt} onChange={(e) => setForm((p) => ({ ...p, purchasedAt: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Description</label>
                  <input className="form-control" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Budget</label>
                  <select className="form-control" value={form.budgetId} onChange={(e) => setForm((p) => ({ ...p, budgetId: e.target.value }))}>
                    <option value="">Sans budget</option>
                    {budget && <option value={budget.id}>Budget {budget.year} — restant: {Number(budget.remaining || 0).toFixed(2)} €</option>}
                  </select>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>Produits</strong>
                  <button type="button" className="btn btn-sm btn-outline" onClick={addLine}><FiPlus size={12} /> Ajouter</button>
                </div>
                {lines.map((line, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                    <select className="form-control" value={line.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}>
                      <option value="">— Produit —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input className="form-control" type="number" min="0.01" step="0.01" placeholder="Qté" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
                    <input className="form-control" placeholder="Unité" value={line.unit} onChange={(e) => updateLine(i, 'unit', e.target.value)} />
                    <input className="form-control" type="number" min="0" step="0.01" placeholder="Prix unit." value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} />
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeLine(i)} disabled={lines.length === 1}><FiX size={12} /></button>
                  </div>
                ))}
                <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, marginTop: 8 }}>Total : {lineTotal.toFixed(2)} €</div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Validation…' : 'Valider l\'achat'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
