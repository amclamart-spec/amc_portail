import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2 } from 'react-icons/fi';

export default function SocialStock() {
  const { user } = useAuth();
  // eslint-disable-next-line no-unused-vars
  const canManage = true; // operateur et responsable ont tous les deux accès à la gestion du stock
  const [categories, setCategories] = useState([]);
  const [movements, setMovements] = useState([]);
  const [movPage, setMovPage] = useState(1);
  const [movTotal, setMovTotal] = useState(0);
  const [movTotalPages, setMovTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ productId: '', quantity: '', comment: '' });
  const [productModal, setProductModal] = useState(false);
  const [productForm, setProductForm] = useState({ id: null, categoryId: '', name: '', unit: 'unité', alertThreshold: 0 });
  const [categoryModal, setCategoryModal] = useState(false);
  const [catForm, setCatForm] = useState({ id: null, name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const allProducts = categories.flatMap((c) => c.products || []);

  const load = async () => {
    setLoading(true);
    try {
      const [catRes, movRes] = await Promise.all([
        api.get('/social/categories'),
        api.get('/social/stock-movements', { params: { page: movPage, limit: 30 } }),
      ]);
      setCategories(catRes.data.categories || []);
      setMovements(movRes.data.movements || []);
      setMovTotal(movRes.data.total || 0);
      setMovTotalPages(movRes.data.totalPages || 1);
    } catch { toast.error('Impossible de charger le stock'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [movPage]);

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!adjustForm.productId || !adjustForm.quantity) { toast.error('Produit et quantité requis'); return; }
    setSaving(true);
    try {
      await api.post('/social/products/stock-adjust', { productId: adjustForm.productId, quantity: Number(adjustForm.quantity), type: 'CORRECTION', comment: adjustForm.comment });
      toast.success('Stock ajusté');
      setAdjustModal(false);
      setAdjustForm({ productId: '', quantity: '', comment: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleProduct = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (productForm.id) await api.put(`/social/products/${productForm.id}`, productForm);
      else await api.post('/social/products', productForm);
      toast.success(productForm.id ? 'Produit modifié' : 'Produit créé');
      setProductModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleCategory = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (catForm.id) await api.put(`/social/categories/${catForm.id}`, catForm);
      else await api.post('/social/categories', catForm);
      toast.success(catForm.id ? 'Catégorie modifiée' : 'Catégorie créée');
      setCategoryModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const MOV_LABELS = { COLLECTE: 'Collecte', ACHAT: 'Achat', DISTRIBUTION: 'Distribution', CORRECTION: 'Correction', RETOUR: 'Retour' };
  const MOV_COLORS = { COLLECTE: '#16A34A', ACHAT: '#0891B2', DISTRIBUTION: '#DC2626', CORRECTION: '#6B7280', RETOUR: '#D97706' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Gestion du stock</h2>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => { setCatForm({ id: null, name: '', description: '' }); setCategoryModal(true); }}><FiPlus size={14} /> Catégorie</button>
            <button className="btn btn-outline" onClick={() => { setProductForm({ id: null, categoryId: categories[0]?.id || '', name: '', unit: 'unité', alertThreshold: 0 }); setProductModal(true); }}><FiPlus size={14} /> Produit</button>
            <button className="btn btn-primary" onClick={() => setAdjustModal(true)}>Ajuster le stock</button>
          </div>
        )}
      </div>

      {/* Stock par catégorie */}
      {categories.map((cat) => (
        <div key={cat.id} className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3>{cat.name}</h3>
            {canManage && <button className="btn btn-sm btn-outline" onClick={() => { setCatForm({ id: cat.id, name: cat.name, description: cat.description || '' }); setCategoryModal(true); }}><FiEdit2 size={12} /></button>}
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Produit</th><th>Stock</th><th>Unité</th><th>Seuil alerte</th><th>Statut</th>{canManage && <th>Actions</th>}</tr></thead>
              <tbody>
                {(cat.products || []).length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: '#6B7280', padding: 12 }}>Aucun produit</td></tr>
                ) : cat.products.map((p) => {
                  const isLow = Number(p.stockQty) <= Number(p.alertThreshold);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ fontWeight: 700, color: isLow ? '#DC2626' : '#16A34A' }}>{Number(p.stockQty).toFixed(0)}</td>
                      <td>{p.unit}</td>
                      <td>{Number(p.alertThreshold).toFixed(0)}</td>
                      <td>{isLow ? <span className="badge badge-danger">Stock faible</span> : <span className="badge badge-success">OK</span>}</td>
                      {canManage && <td><button className="btn btn-sm btn-outline" onClick={() => { setProductForm({ id: p.id, categoryId: p.categoryId, name: p.name, unit: p.unit, alertThreshold: p.alertThreshold }); setProductModal(true); }}><FiEdit2 size={12} /></button></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Mouvements de stock */}
      <div className="card">
        <div className="card-header"><h3>Historique mouvements ({movTotal})</h3></div>
        {loading ? <p style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Produit</th><th>Type</th><th>Quantité</th><th>Référence</th><th>Commentaire</th><th>Opérateur</th></tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>{m.product?.name}</td>
                    <td><span style={{ fontWeight: 700, color: MOV_COLORS[m.type] }}>{MOV_LABELS[m.type]}</span></td>
                    <td style={{ fontWeight: 700, color: ['DISTRIBUTION'].includes(m.type) ? '#DC2626' : '#16A34A' }}>
                      {['DISTRIBUTION'].includes(m.type) ? '−' : '+'}{Number(m.quantity).toFixed(0)} {m.unit}
                    </td>
                    <td style={{ fontSize: 11, color: '#6B7280' }}>{m.referenceType || '—'}</td>
                    <td>{m.comment || '—'}</td>
                    <td>{m.user?.firstName} {m.user?.lastName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {movTotalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
            <button className="btn btn-outline btn-sm" disabled={movPage <= 1} onClick={() => setMovPage(movPage - 1)}>Précédent</button>
            <span style={{ padding: '4px 12px', color: '#6B7280' }}>Page {movPage} / {movTotalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={movPage >= movTotalPages} onClick={() => setMovPage(movPage + 1)}>Suivant</button>
          </div>
        )}
      </div>

      {/* Modal ajustement */}
      {adjustModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Ajustement de stock</h3><button className="btn btn-outline btn-sm" onClick={() => setAdjustModal(false)}>Fermer</button></div>
            <form onSubmit={handleAdjust} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Produit *</label>
                <select className="form-control" value={adjustForm.productId} onChange={(e) => setAdjustForm((p) => ({ ...p, productId: e.target.value }))} required>
                  <option value="">— Sélectionner —</option>
                  {allProducts.map((p) => <option key={p.id} value={p.id}>{p.name} (stock: {Number(p.stockQty).toFixed(0)} {p.unit})</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nouveau stock *</label>
                <input className="form-control" type="number" min="0" step="0.01" value={adjustForm.quantity} onChange={(e) => setAdjustForm((p) => ({ ...p, quantity: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Commentaire</label>
                <input className="form-control" value={adjustForm.comment} onChange={(e) => setAdjustForm((p) => ({ ...p, comment: e.target.value }))} placeholder="Motif de la correction" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setAdjustModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Ajuster'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal produit */}
      {productModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>{productForm.id ? 'Modifier produit' : 'Nouveau produit'}</h3><button className="btn btn-outline btn-sm" onClick={() => setProductModal(false)}>Fermer</button></div>
            <form onSubmit={handleProduct} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Catégorie *</label>
                <select className="form-control" value={productForm.categoryId} onChange={(e) => setProductForm((p) => ({ ...p, categoryId: e.target.value }))} required>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input className="form-control" value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Unité</label>
                <input className="form-control" value={productForm.unit} onChange={(e) => setProductForm((p) => ({ ...p, unit: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Seuil d'alerte stock</label>
                <input className="form-control" type="number" min="0" step="0.01" value={productForm.alertThreshold} onChange={(e) => setProductForm((p) => ({ ...p, alertThreshold: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setProductModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal catégorie */}
      {categoryModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 380 }}>
            <div className="card-header"><h3>{catForm.id ? 'Modifier catégorie' : 'Nouvelle catégorie'}</h3><button className="btn btn-outline btn-sm" onClick={() => setCategoryModal(false)}>Fermer</button></div>
            <form onSubmit={handleCategory} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}><label>Nom *</label><input className="form-control" value={catForm.name} onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))} required /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Description</label><input className="form-control" value={catForm.description} onChange={(e) => setCatForm((p) => ({ ...p, description: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setCategoryModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
