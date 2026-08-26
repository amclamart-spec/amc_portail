import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiCheck, FiX, FiEdit2, FiKey, FiCopy, FiUserX, FiUserCheck } from 'react-icons/fi';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }
function fmtHours(h) { return `${Number(h || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`; }

const currentYear = new Date().getFullYear();

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

export default function VolunteersManage() {
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const [volunteers, setVolunteers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [listLoading, setListLoading] = useState(false);

  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [newVolunteer, setNewVolunteer] = useState(EMPTY_NEW);
  const [saving, setSaving] = useState(false);

  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState(null);

  const [roleRequests, setRoleRequests] = useState([]);
  const [roleRequestsLoading, setRoleRequestsLoading] = useState(false);

  const loadRoleRequests = async () => {
    setRoleRequestsLoading(true);
    try {
      const { data } = await api.get('/volunteers/role-requests/pending');
      setRoleRequests(data.requests || []);
    } catch { toast.error('Impossible de charger les demandes de rôle'); }
    finally { setRoleRequestsLoading(false); }
  };

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const { data } = await api.get('/volunteers/pending');
      setPending(data.volunteers || []);
    } catch { toast.error('Impossible de charger les demandes en attente'); }
    finally { setPendingLoading(false); }
  };

  const loadVolunteers = async (p = page, s = search) => {
    setListLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (s) params.search = s;
      const { data } = await api.get('/volunteers', { params });
      setVolunteers(data.volunteers || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { toast.error('Impossible de charger les bénévoles'); }
    finally { setListLoading(false); }
  };

  useEffect(() => { loadPending(); loadVolunteers(1, ''); loadRoleRequests(); }, []);

  const handleApproveRoleRequest = async (id) => {
    try {
      await api.put(`/volunteers/role-requests/${id}/approve`);
      toast.success('Rôle Bénévole validé');
      loadRoleRequests();
      loadVolunteers(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleRejectRoleRequest = async (id) => {
    const reason = prompt('Motif du refus (optionnel) :');
    try {
      await api.put(`/volunteers/role-requests/${id}/reject`, { reason });
      toast.success('Demande refusée');
      loadRoleRequests();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/volunteers/${id}/approve`);
      toast.success('Bénévole validé — un email lui a été envoyé');
      loadPending();
      loadVolunteers(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const openReject = (v) => { setRejectModal(v); setRejectReason(''); };

  const handleReject = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/volunteers/${rejectModal.id}/reject`, { reason: rejectReason });
      toast.success('Demande refusée — un email a été envoyé');
      setRejectModal(null);
      loadPending();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleSearch = () => { setPage(1); loadVolunteers(1, search); };
  const handleSearchClear = () => { setSearch(''); setPage(1); loadVolunteers(1, ''); };
  const handlePageChange = (p) => { setPage(p); loadVolunteers(p, search); };

  const handleAddVolunteer = async (e) => {
    e.preventDefault();
    if (!newVolunteer.firstName || !newVolunteer.lastName || !newVolunteer.email) {
      toast.error('Prénom, nom et email requis');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/volunteers', newVolunteer);
      toast.success(data.addedToExistingAccount
        ? 'Un compte existait déjà avec cet email — l\'accès Bénévole lui a été ajouté'
        : 'Bénévole ajouté — un email d\'invitation lui a été envoyé');
      setAddModal(false);
      setNewVolunteer(EMPTY_NEW);
      loadVolunteers(1, search);
      setPage(1);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const openEdit = (v) => { setEditModal(v); setEditForm({ firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone || '' }); };
  const handleEdit = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      await api.put(`/volunteers/${editModal.id}`, editForm);
      toast.success('Bénévole modifié');
      setEditModal(null);
      loadVolunteers(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setEditSaving(false); }
  };

  const handleToggleActive = async (v) => {
    const nextActive = !(v.isActive !== false);
    if (!nextActive && !confirm(`Désactiver le compte de ${v.firstName} ${v.lastName} ? La connexion sera bloquée, les données seront conservées.`)) return;
    try {
      await api.put(`/volunteers/${v.id}/active`, { isActive: nextActive });
      toast.success(nextActive ? 'Compte réactivé' : 'Compte désactivé');
      loadVolunteers(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Bénévoles</h2>
        <button className="btn btn-primary" onClick={() => setAddModal(true)}><FiPlus size={14} /> Ajouter un bénévole</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Demandes en attente de validation ({pending.length})</h3></div>
        {pendingLoading ? <p style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Date de demande</th><th>Actions</th></tr></thead>
              <tbody>
                {pending.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucune demande en attente</td></tr>
                ) : pending.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.lastName} {v.firstName}</td>
                    <td>{v.email}</td>
                    <td>{v.phone || '—'}</td>
                    <td>{fmtDate(v.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => handleApprove(v.id)}><FiCheck size={12} /> Valider</button>
                        <button className="btn btn-sm btn-danger" onClick={() => openReject(v)}><FiX size={12} /> Refuser</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {roleRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3>Demandes de rôle Bénévole en attente ({roleRequests.length})</h3></div>
          {roleRequestsLoading ? <p style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
            <div className="table-container">
              <table>
                <thead><tr><th>Nom</th><th>Email</th><th>Compte existant depuis</th><th>Actions</th></tr></thead>
                <tbody>
                  {roleRequests.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.user.lastName} {r.user.firstName}</td>
                      <td>{r.user.email}</td>
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
        <div className="card-header"><h3>Bénévoles actifs ({total})</h3></div>
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
              <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Compte</th><th>Heures {currentYear} (validées)</th><th>Membre depuis</th><th>Actions</th></tr></thead>
              <tbody>
                {volunteers.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun bénévole trouvé</td></tr>
                ) : volunteers.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.lastName} {v.firstName}</td>
                    <td>{v.email}</td>
                    <td>{v.phone || '—'}</td>
                    <td><span className={`badge ${v.isActive === false ? 'badge-danger' : 'badge-success'}`}>{v.isActive === false ? 'Désactivé' : 'Actif'}</span></td>
                    <td>{fmtHours(v.validatedHoursCurrentYear)}</td>
                    <td>{fmtDate(v.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(v)}><FiEdit2 size={12} /> Modifier</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setPasswordModalUser(v)}><FiKey size={12} /> MDP</button>
                        <button className="btn btn-sm btn-outline" onClick={() => handleToggleActive(v)}>
                          {v.isActive === false ? <><FiUserCheck size={12} /> Réactiver</> : <><FiUserX size={12} /> Désactiver</>}
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

      {/* Modal refus */}
      {rejectModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Refuser la demande de {rejectModal.firstName} {rejectModal.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setRejectModal(null)}>Fermer</button></div>
            <form onSubmit={handleReject} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Motif (optionnel, envoyé au bénévole par email)</label>
                <textarea className="form-control" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setRejectModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-danger">Confirmer le refus</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ajout bénévole */}
      {addModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Ajouter un bénévole</h3><button className="btn btn-outline btn-sm" onClick={() => setAddModal(false)}>Fermer</button></div>
            <form onSubmit={handleAddVolunteer} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
                Si l'email est nouveau, un compte est créé et un email d'invitation est envoyé pour définir le mot de passe.
                Si un compte existe déjà avec cet email (ex: Famille, Professeur…), l'accès Bénévole lui est simplement ajouté,
                sans toucher à son accès existant.
              </p>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prénom *</label>
                <input className="form-control" value={newVolunteer.firstName} onChange={(e) => setNewVolunteer((p) => ({ ...p, firstName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input className="form-control" value={newVolunteer.lastName} onChange={(e) => setNewVolunteer((p) => ({ ...p, lastName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Email *</label>
                <input className="form-control" type="email" value={newVolunteer.email} onChange={(e) => setNewVolunteer((p) => ({ ...p, email: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Téléphone</label>
                <input className="form-control" value={newVolunteer.phone} onChange={(e) => setNewVolunteer((p) => ({ ...p, phone: e.target.value }))} />
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
        <GeneratedPasswordModal user={passwordModalUser} endpoint={`/volunteers/${passwordModalUser.id}/generate-password`} onClose={() => setPasswordModalUser(null)} />
      )}
    </div>
  );
}
