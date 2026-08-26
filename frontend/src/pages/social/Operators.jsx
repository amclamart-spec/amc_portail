import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiCheck, FiX, FiEdit2, FiKey, FiCopy, FiUserX, FiUserCheck } from 'react-icons/fi';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

const EMPTY_NEW = { firstName: '', lastName: '', email: '', phone: '' };

function GeneratedPasswordModal({ user, endpoint, onClose }) {
  const [generatedPassword, setGeneratedPassword] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(endpoint);
      setGeneratedPassword(data.password);
      toast.success('Mot de passe généré et sauvegardé');
    } catch { toast.error('Erreur lors de la génération du mot de passe'); }
    finally { setLoading(false); }
  };

  const handleCopy = () => { navigator.clipboard.writeText(generatedPassword); toast.success('Mot de passe copié'); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header"><h3>Mot de passe — {user.firstName} {user.lastName}</h3><button className="btn btn-outline btn-sm" onClick={onClose}>Fermer</button></div>
        <div style={{ padding: 16 }}>
          {!generatedPassword ? (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGenerate} disabled={loading}>
              {loading ? 'Génération…' : 'Générer un nouveau mot de passe'}
            </button>
          ) : (
            <div>
              <p style={{ marginBottom: 8, fontWeight: 600 }}>Nouveau mot de passe :</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <code style={{ flex: 1, padding: '8px 12px', background: '#F3F4F6', borderRadius: 6, fontSize: 15, letterSpacing: 1, border: '1px solid #E5E7EB' }}>{generatedPassword}</code>
                <button className="btn btn-outline btn-sm" onClick={handleCopy} title="Copier"><FiCopy /></button>
              </div>
              <p style={{ color: '#EF4444', fontSize: 13 }}>Notez ce mot de passe — il ne sera plus affiché après fermeture.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SocialOperators() {
  const [roleRequests, setRoleRequests] = useState([]);
  const [roleRequestsLoading, setRoleRequestsLoading] = useState(false);

  const [operators, setOperators] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [listLoading, setListLoading] = useState(false);

  const [addModal, setAddModal] = useState(false);
  const [newOperator, setNewOperator] = useState(EMPTY_NEW);
  const [saving, setSaving] = useState(false);

  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState(null);

  const loadRoleRequests = async () => {
    setRoleRequestsLoading(true);
    try {
      const { data } = await api.get('/social/role-requests/pending');
      setRoleRequests(data.requests || []);
    } catch { toast.error('Impossible de charger les demandes de rôle'); }
    finally { setRoleRequestsLoading(false); }
  };

  const loadOperators = async (p = page, s = search) => {
    setListLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (s) params.search = s;
      const { data } = await api.get('/social/operators', { params });
      setOperators(data.operators || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { toast.error('Impossible de charger les opérateurs'); }
    finally { setListLoading(false); }
  };

  useEffect(() => { loadRoleRequests(); loadOperators(1, ''); }, []);

  const handleApproveRoleRequest = async (id) => {
    try {
      await api.put(`/social/role-requests/${id}/approve`);
      toast.success('Rôle Opérateur Social validé');
      loadRoleRequests();
      loadOperators(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleRejectRoleRequest = async (id) => {
    const reason = prompt('Motif du refus (optionnel) :');
    try {
      await api.put(`/social/role-requests/${id}/reject`, { reason });
      toast.success('Demande refusée');
      loadRoleRequests();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleSearch = () => { setPage(1); loadOperators(1, search); };
  const handleSearchClear = () => { setSearch(''); setPage(1); loadOperators(1, ''); };
  const handlePageChange = (p) => { setPage(p); loadOperators(p, search); };

  const handleAddOperator = async (e) => {
    e.preventDefault();
    if (!newOperator.firstName || !newOperator.lastName || !newOperator.email) {
      toast.error('Prénom, nom et email requis');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/social/operators', newOperator);
      toast.success(data.addedToExistingAccount
        ? 'Un compte existait déjà avec cet email — l\'accès Opérateur Social lui a été ajouté'
        : 'Opérateur ajouté — un email d\'invitation lui a été envoyé');
      setAddModal(false);
      setNewOperator(EMPTY_NEW);
      loadOperators(1, search);
      setPage(1);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const openEdit = (o) => { setEditModal(o); setEditForm({ firstName: o.firstName, lastName: o.lastName, email: o.email, phone: o.phone || '' }); };
  const handleEdit = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      await api.put(`/social/operators/${editModal.id}`, editForm);
      toast.success('Opérateur modifié');
      setEditModal(null);
      loadOperators(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setEditSaving(false); }
  };

  const handleToggleActive = async (o) => {
    const nextActive = !(o.isActive !== false);
    if (!nextActive && !confirm(`Désactiver le compte de ${o.firstName} ${o.lastName} ? La connexion sera bloquée, les données seront conservées.`)) return;
    try {
      await api.put(`/social/operators/${o.id}/active`, { isActive: nextActive });
      toast.success(nextActive ? 'Compte réactivé' : 'Compte désactivé');
      loadOperators(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Opérateurs Sociaux</h2>
        <button className="btn btn-primary" onClick={() => setAddModal(true)}><FiPlus size={14} /> Ajouter un opérateur</button>
      </div>

      {roleRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3>Demandes de rôle en attente de validation ({roleRequests.length})</h3></div>
          {roleRequestsLoading ? <p style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
            <div className="table-container">
              <table>
                <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Date de demande</th><th>Actions</th></tr></thead>
                <tbody>
                  {roleRequests.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.user.lastName} {r.user.firstName}</td>
                      <td>{r.user.email}</td>
                      <td>{r.user.phone || '—'}</td>
                      <td>{fmtDate(r.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => handleApproveRoleRequest(r.id)}><FiCheck size={12} /> Valider</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleRejectRoleRequest(r.id)}><FiX size={12} /> Refuser</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3>Opérateurs actifs ({total})</h3></div>
        <div style={{ padding: 12, borderBottom: '1px solid var(--amc-border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-control"
              placeholder="Rechercher (nom, prénom, email)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={handleSearch}>Chercher</button>
            <button className="btn btn-outline" onClick={handleSearchClear}>Effacer</button>
          </div>
        </div>
        {listLoading ? <p style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Compte</th><th>Membre depuis</th><th>Actions</th></tr></thead>
              <tbody>
                {operators.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun opérateur trouvé</td></tr>
                ) : operators.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.lastName} {o.firstName}</td>
                    <td>{o.email}</td>
                    <td>{o.phone || '—'}</td>
                    <td><span className={`badge ${o.isActive === false ? 'badge-danger' : 'badge-success'}`}>{o.isActive === false ? 'Désactivé' : 'Actif'}</span></td>
                    <td>{fmtDate(o.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(o)}><FiEdit2 size={12} /> Modifier</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setPasswordModalUser(o)}><FiKey size={12} /> MDP</button>
                        <button className="btn btn-sm btn-outline" onClick={() => handleToggleActive(o)}>
                          {o.isActive === false ? <><FiUserCheck size={12} /> Réactiver</> : <><FiUserX size={12} /> Désactiver</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>Précédent</button>
            <span style={{ padding: '4px 12px', color: '#6B7280' }}>Page {page} / {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>Suivant</button>
          </div>
        )}
      </div>

      {/* Modal ajout opérateur */}
      {addModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Ajouter un opérateur</h3><button className="btn btn-outline btn-sm" onClick={() => setAddModal(false)}>Fermer</button></div>
            <form onSubmit={handleAddOperator} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
                Si l'email est nouveau, un compte est créé et un email d'invitation est envoyé pour définir le mot de passe.
                Si un compte existe déjà avec cet email (ex: Famille, Bénévole…), l'accès Opérateur Social lui est simplement ajouté,
                sans toucher à son accès existant.
              </p>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prénom *</label>
                <input className="form-control" value={newOperator.firstName} onChange={(e) => setNewOperator((p) => ({ ...p, firstName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input className="form-control" value={newOperator.lastName} onChange={(e) => setNewOperator((p) => ({ ...p, lastName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Email *</label>
                <input className="form-control" type="email" value={newOperator.email} onChange={(e) => setNewOperator((p) => ({ ...p, email: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Téléphone</label>
                <input className="form-control" value={newOperator.phone} onChange={(e) => setNewOperator((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setAddModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal modification */}
      {editModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Modifier — {editModal.firstName} {editModal.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setEditModal(null)}>Fermer</button></div>
            <form onSubmit={handleEdit} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prénom *</label>
                <input className="form-control" value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input className="form-control" value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Email *</label>
                <input className="form-control" type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Téléphone</label>
                <input className="form-control" value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordModalUser && (
        <GeneratedPasswordModal user={passwordModalUser} endpoint={`/social/operators/${passwordModalUser.id}/generate-password`} onClose={() => setPasswordModalUser(null)} />
      )}
    </div>
  );
}
