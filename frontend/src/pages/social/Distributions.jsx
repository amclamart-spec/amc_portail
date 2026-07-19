import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiX } from 'react-icons/fi';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

export default function SocialDistributions() {
  const [distributions, setDistributions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ beneficiaryId: '', distributedAt: new Date().toISOString().slice(0, 10), observations: '' });
  const [lines, setLines] = useState([{ productId: '', quantity: '', unit: '' }]);
  const [saving, setSaving] = useState(false);
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = async (p = page, s = filterStatus) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (s) params.status = s;
      const { data } = await api.get('/social/distributions', { params });
      setDistributions(data.distributions || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    Promise.all([
      api.get('/social/beneficiaries', { params: { limit: 500 } }),
      api.get('/social/products', { params: { active: true } }),
    ]).then(([bRes, pRes]) => {
      setBeneficiaries(bRes.data.beneficiaries || []);
      setProducts(pRes.data.products || []);
    });
  }, []);

  const addLine = () => setLines((l) => [...l, { productId: '', quantity: '', unit: '' }]);
  const removeLine = (i) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i, field, value) => {
    setLines((l) => l.map((line, idx) => {
      if (idx !== i) return line;
      const updated = { ...line, [field]: value };
      if (field === 'productId') {
        const p = products.find((p) => p.id === value);
        if (p) updated.unit = p.unit;
      }
      return updated;
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.productId && l.quantity);
    if (!form.beneficiaryId || !validLines.length) { toast.error('Bénéficiaire et au moins un produit requis'); return; }
    setSaving(true);
    try {
      await api.post('/social/distributions', { ...form, lines: validLines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unit: l.unit })) });
      toast.success('Distribution créée');
      setModal(false);
      setForm({ beneficiaryId: '', distributedAt: new Date().toISOString().slice(0, 10), observations: '' });
      setLines([{ productId: '', quantity: '', unit: '' }]);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleCancel = async () => {
    if (!cancelModal) return;
    setSaving(true);
    try {
      await api.post(`/social/distributions/${cancelModal.id}/cancel`, { reason: cancelReason });
      toast.success('Distribution annulée');
      setCancelModal(null);
      setCancelReason('');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Distributions ({total})</h2>
        <button className="btn btn-primary" onClick={() => setModal(true)}><FiPlus size={14} /> Nouvelle distribution</button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <select className="form-control" style={{ width: 200 }} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); load(1, e.target.value); }}>
          <option value="">Tous les statuts</option>
          <option value="VALIDATED">Validée</option>
          <option value="CANCELLED">Annulée</option>
        </select>
      </div>

      <div className="card">
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Bénéficiaire</th><th>Produits</th><th>Statut</th><th>Opérateur</th><th>Actions</th></tr></thead>
              <tbody>
                {distributions.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucune distribution</td></tr>
                ) : distributions.map((d) => (
                  <tr key={d.id}>
                    <td>{fmtDate(d.distributedAt)}</td>
                    <td style={{ fontWeight: 600 }}>{d.beneficiary?.lastName} {d.beneficiary?.firstName}</td>
                    <td style={{ fontSize: 12 }}>{d.lines?.map((l) => `${l.product?.name} (${Number(l.quantity).toFixed(0)} ${l.unit})`).join(', ')}</td>
                    <td><span className={`badge ${d.status === 'VALIDATED' ? 'badge-success' : 'badge-danger'}`}>{d.status === 'VALIDATED' ? 'Validée' : 'Annulée'}</span></td>
                    <td>{d.user?.firstName} {d.user?.lastName}</td>
                    <td>{d.status === 'VALIDATED' && <button className="btn btn-sm btn-danger" onClick={() => { setCancelModal(d); setCancelReason(''); }}><FiX size={14} /> Annuler</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1, filterStatus); }}>Précédent</button>
            <span style={{ padding: '4px 12px', color: '#6B7280' }}>{page} / {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); load(page + 1, filterStatus); }}>Suivant</button>
          </div>
        )}
      </div>

      {/* Modal création */}
      {modal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 620 }}>
            <div className="card-header"><h3>Nouvelle distribution</h3><button className="btn btn-outline btn-sm" onClick={() => setModal(false)}>Fermer</button></div>
            <form onSubmit={handleCreate} style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Bénéficiaire *</label>
                  <select className="form-control" value={form.beneficiaryId} onChange={(e) => setForm((p) => ({ ...p, beneficiaryId: e.target.value }))} required>
                    <option value="">— Sélectionner —</option>
                    {beneficiaries.map((b) => <option key={b.id} value={b.id}>{b.lastName} {b.firstName}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date de distribution *</label>
                  <input className="form-control" type="date" value={form.distributedAt} onChange={(e) => setForm((p) => ({ ...p, distributedAt: e.target.value }))} required />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong>Produits distribués</strong>
                  <button type="button" className="btn btn-sm btn-outline" onClick={addLine}><FiPlus size={12} /> Ajouter</button>
                </div>
                {lines.map((line, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                    <select className="form-control" value={line.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}>
                      <option value="">— Produit —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({Number(p.stockQty).toFixed(0)} {p.unit} dispo)</option>)}
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
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Valider la distribution'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal annulation */}
      {cancelModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Annuler la distribution</h3><button className="btn btn-outline btn-sm" onClick={() => setCancelModal(null)}>Fermer</button></div>
            <div style={{ padding: 16 }}>
              <p style={{ color: '#6B7280', fontSize: 13 }}>Cette action restituera le stock des produits concernés.</p>
              <div className="form-group">
                <label>Motif d'annulation</label>
                <textarea className="form-control" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setCancelModal(null)}>Retour</button>
                <button className="btn btn-danger" onClick={handleCancel} disabled={saving}>{saving ? '…' : 'Confirmer l\'annulation'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
