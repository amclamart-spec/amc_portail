import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEye, FiEdit2 } from 'react-icons/fi';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', addressLine1: '', postalCode: '', city: '', adultsCount: 1, childrenCount: 0, monthlyIncome: '', observations: '' };

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

const STATUS_LABEL = { DRAFT: 'Brouillon', SUBMITTED: 'En attente', ACCEPTED: 'Accepté', REFUSED: 'Refusé', SUSPENDED: 'Suspendu', EXPIRED: 'Expiré' };
const STATUS_BADGE = { DRAFT: 'badge-gray', SUBMITTED: 'badge-warning', ACCEPTED: 'badge-success', REFUSED: 'badge-danger', SUSPENDED: 'badge-warning', EXPIRED: 'badge-danger' };

export default function SocialBeneficiaries() {
  const navigate = useNavigate();
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = async (p = page, s = search) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (s) params.search = s;
      const { data } = await api.get('/social/beneficiaries', { params });
      setBeneficiaries(data.beneficiaries || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { toast.error('Impossible de charger les bénéficiaires'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1, search); }, []);

  const openCreate = () => { setForm(EMPTY_FORM); setEditId(null); setModalOpen(true); };
  const openEdit = (b) => { setForm({ firstName: b.firstName, lastName: b.lastName, email: b.email || '', phone: b.phone || '', addressLine1: b.addressLine1 || '', postalCode: b.postalCode || '', city: b.city || '', adultsCount: b.adultsCount, childrenCount: b.childrenCount, monthlyIncome: b.monthlyIncome ?? '', observations: b.observations || '' }); setEditId(b.id); setModalOpen(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) { toast.error('Prénom et nom requis'); return; }
    setSaving(true);
    try {
      const payload = { ...form, adultsCount: Number(form.adultsCount), childrenCount: Number(form.childrenCount), monthlyIncome: form.monthlyIncome !== '' ? Number(form.monthlyIncome) : null };
      if (editId) await api.put(`/social/beneficiaries/${editId}`, payload);
      else await api.post('/social/beneficiaries', payload);
      toast.success(editId ? 'Bénéficiaire modifié' : 'Bénéficiaire créé');
      setModalOpen(false);
      load(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Bénéficiaires</h2>
        <button className="btn btn-primary" onClick={openCreate}><FiPlus size={14} /> Nouveau bénéficiaire</button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-control" placeholder="Rechercher (nom, prénom, email, téléphone)…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load(1, search))} style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={() => { setPage(1); load(1, search); }}>Chercher</button>
          <button className="btn btn-outline" onClick={() => { setSearch(''); setPage(1); load(1, ''); }}>Effacer</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h3>Liste ({total})</h3>
        </div>
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Nom</th><th>Téléphone</th><th>Ville</th><th>Adultes</th><th>Enfants</th><th>Revenu/mois</th><th>Dernier dossier</th><th>Distributions</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {beneficiaries.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun bénéficiaire trouvé</td></tr>
                ) : beneficiaries.map((b) => {
                  const latestCase = b.cases?.[0];
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.lastName} {b.firstName}</td>
                      <td>{b.phone || '—'}</td>
                      <td>{b.city || '—'}</td>
                      <td>{b.adultsCount}</td>
                      <td>{b.childrenCount}</td>
                      <td>{b.monthlyIncome != null ? `${Number(b.monthlyIncome).toFixed(0)} €` : '—'}</td>
                      <td>{latestCase ? <span className={`badge ${STATUS_BADGE[latestCase.status]}`}>{STATUS_LABEL[latestCase.status]}</span> : <span className="badge badge-gray">Aucun</span>}</td>
                      <td>{b._count?.distributions ?? 0}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm btn-outline" onClick={() => navigate(`/social/beneficiaries/${b.id}`)} title="Voir"><FiEye size={14} /></button>
                          <button className="btn btn-sm btn-outline" onClick={() => openEdit(b)} title="Modifier"><FiEdit2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1, search); }}>Précédent</button>
            <span style={{ padding: '4px 12px', color: '#6B7280' }}>Page {page} / {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); load(page + 1, search); }}>Suivant</button>
          </div>
        )}
      </div>

      {/* Modal création/édition */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 600 }}>
            <div className="card-header">
              <h3>{editId ? 'Modifier le bénéficiaire' : 'Nouveau bénéficiaire'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setModalOpen(false)}>Fermer</button>
            </div>
            <form onSubmit={handleSave} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Prénom *</label>
                  <input className="form-control" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nom *</label>
                  <input className="form-control" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Email</label>
                  <input className="form-control" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Téléphone</label>
                  <input className="form-control" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Adresse</label>
                  <input className="form-control" value={form.addressLine1} onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Code postal</label>
                  <input className="form-control" value={form.postalCode} onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Ville</label>
                  <input className="form-control" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Revenu mensuel (€)</label>
                  <input className="form-control" type="number" min="0" step="1" value={form.monthlyIncome} onChange={(e) => setForm((p) => ({ ...p, monthlyIncome: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nb adultes</label>
                  <input className="form-control" type="number" min="1" value={form.adultsCount} onChange={(e) => setForm((p) => ({ ...p, adultsCount: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nb enfants</label>
                  <input className="form-control" type="number" min="0" value={form.childrenCount} onChange={(e) => setForm((p) => ({ ...p, childrenCount: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Observations</label>
                <textarea className="form-control" rows={2} value={form.observations} onChange={(e) => setForm((p) => ({ ...p, observations: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
