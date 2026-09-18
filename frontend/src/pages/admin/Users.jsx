import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiFilter, FiKey, FiCopy, FiCheckCircle, FiXCircle, FiUnlock, FiPlus, FiEdit2, FiUserX, FiUserCheck } from 'react-icons/fi';
import { ROLE_LABEL } from '../../utils/roles';

function GeneratedPasswordModal({ user, endpoint, onClose }) {
  const [generatedPassword, setGeneratedPassword] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(endpoint);
      setGeneratedPassword(data.password);
      toast.success('Mot de passe généré et sauvegardé');
    } catch {
      toast.error('Erreur lors de la génération du mot de passe');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPassword);
    toast.success('Mot de passe copié');
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 420, padding: 28, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 8, color: 'var(--amc-primary)' }}>Réinitialisation du mot de passe</h3>
        <p style={{ color: '#6B7280', marginBottom: 20 }}>
          Utilisateur : <strong>{user.lastName} {user.firstName}</strong><br />
          <span style={{ fontSize: 13 }}>{user.email}</span>
        </p>

        {!generatedPassword ? (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGenerate} disabled={loading}>
            {loading ? 'Génération…' : 'Générer un nouveau mot de passe'}
          </button>
        ) : (
          <div>
            <p style={{ marginBottom: 8, fontWeight: 600 }}>Nouveau mot de passe :</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <code style={{ flex: 1, padding: '8px 12px', background: '#F3F4F6', borderRadius: 6, fontSize: 15, letterSpacing: 1, border: '1px solid #E5E7EB' }}>
                {generatedPassword}
              </code>
              <button className="btn btn-outline btn-sm" onClick={handleCopy} title="Copier"><FiCopy /></button>
            </div>
            <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 16 }}>
              Notez ce mot de passe — il ne sera plus affiché après fermeture.
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGenerate} disabled={loading}>
              {loading ? 'Génération…' : 'Régénérer'}
            </button>
          </div>
        )}

        <button className="btn btn-outline" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

const EMPTY_NEW = { firstName: '', lastName: '', email: '', phone: '', role: '' };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [filterRole, setFilterRole] = useState('');
  const [searchName, setSearchName] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [resetModalUser, setResetModalUser] = useState(null);
  const [availableRoles, setAvailableRoles] = useState(['FAMILLE', 'PROFESSEUR', 'TRESORIER']);
  const [poleScoped, setPoleScoped] = useState(false);

  const [createModal, setCreateModal] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW);
  const [saving, setSaving] = useState(false);

  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [editSaving, setEditSaving] = useState(false);

  const [roleRequests, setRoleRequests] = useState([]);
  const [roleRequestsLoading, setRoleRequestsLoading] = useState(false);

  const fetchRoleRequests = async () => {
    setRoleRequestsLoading(true);
    try {
      const { data } = await api.get('/admin/role-requests/pending');
      setRoleRequests(data.requests || []);
    } catch (err) { console.error(err); }
    finally { setRoleRequestsLoading(false); }
  };

  useEffect(() => { fetchRoleRequests(); }, []);

  const handleApproveRoleRequest = async (id) => {
    try {
      await api.put(`/admin/role-requests/${id}/approve`);
      toast.success('Rôle Professeur validé');
      fetchRoleRequests();
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleRejectRoleRequest = async (id) => {
    const reason = prompt('Motif du refus (optionnel) :');
    try {
      await api.put(`/admin/role-requests/${id}/reject`, { reason });
      toast.success('Demande refusée');
      fetchRoleRequests();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit };
      if (filterStatus) params.status = filterStatus;
      if (filterRole) params.role = filterRole;
      if (searchName && searchName.trim()) params.name = searchName.trim();
      const { data } = await api.get('/admin/users', { params });
      setUsers(data.users || []);
      setPagination((prev) => ({ ...prev, page: data.page || prev.page, limit: data.limit || prev.limit, total: data.total || 0 }));
      if (data.availableRoles) setAvailableRoles(data.availableRoles);
      setPoleScoped(Boolean(data.poleScoped));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [filterStatus, filterRole, searchName, pagination.page, pagination.limit]);

  const handleApprove = async (id) => {
    try {
      await api.put(`/admin/users/${id}/approve`);
      toast.success('Compte validé !');
      fetchUsers();
    } catch { toast.error('Erreur lors de la validation'); }
  };

  const handleUnlock = async (id) => {
    try {
      await api.post(`/admin/users/${id}/unlock`);
      toast.success('Compte déverrouillé');
      fetchUsers();
    } catch { toast.error('Erreur lors du déverrouillage'); }
  };

  const handleReject = async (id) => {
    const reason = prompt('Motif du refus (optionnel) :');
    try {
      await api.put(`/admin/users/${id}/reject`, { reason });
      toast.success('Compte refusé');
      fetchUsers();
    } catch { toast.error('Erreur'); }
  };

  const handleToggleActive = async (u) => {
    const nextActive = !u.isActive;
    if (!nextActive && !confirm(`Désactiver le compte de ${u.firstName} ${u.lastName} ? La connexion sera bloquée, mais toutes les données seront conservées.`)) return;
    try {
      await api.put(`/admin/users/${u.id}/active`, { isActive: nextActive });
      toast.success(nextActive ? 'Compte réactivé' : 'Compte désactivé');
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const openCreate = () => { setNewUser({ ...EMPTY_NEW, role: availableRoles[0] || '' }); setCreateModal(true); };
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.role) {
      toast.error('Prénom, nom, email et rôle sont requis');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/users', newUser);
      toast.success('Utilisateur créé — un email d\'invitation lui a été envoyé');
      setCreateModal(false);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const openEdit = (u) => { setEditModal(u); setEditForm({ firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone || '' }); };
  const handleEdit = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      await api.put(`/admin/users/${editModal.id}`, editForm);
      toast.success('Utilisateur modifié');
      setEditModal(null);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setEditSaving(false); }
  };

  const statusBadge = (status) => {
    const map = {
      PENDING: { cls: 'badge-warning', label: 'En attente' },
      APPROVED: { cls: 'badge-success', label: 'Validé' },
      REJECTED: { cls: 'badge-danger', label: 'Refusé' },
    };
    const s = map[status] || { cls: 'badge-gray', label: status };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  return (
    <div>
      {resetModalUser && (
        <GeneratedPasswordModal user={resetModalUser} endpoint={`/admin/users/${resetModalUser.id}/reset-password`} onClose={() => setResetModalUser(null)} />
      )}

      <div className="flex-between mb-2">
        <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des utilisateurs</h2>
        <button className="btn btn-primary" onClick={openCreate}><FiPlus /> Créer un utilisateur</button>
      </div>

      {poleScoped && (
        <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 12 }}>
          Vous ne voyez que les Familles ayant au moins une inscription dans votre pôle, et les Professeurs de votre pôle.
        </p>
      )}

      {roleRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3>Demandes de rôle Professeur en attente ({roleRequests.length})</h3></div>
          {roleRequestsLoading ? <p style={{ padding: 16, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
            <div className="table-container">
              <table>
                <thead><tr><th>Nom</th><th>Email</th><th>Compte existant depuis</th><th>Actions</th></tr></thead>
                <tbody>
                  {roleRequests.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.user.lastName} {r.user.firstName}</td>
                      <td>{r.user.email}</td>
                      <td>{new Date(r.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-success btn-sm" onClick={() => handleApproveRoleRequest(r.id)}><FiCheck /> Valider</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleRejectRoleRequest(r.id)}><FiX /> Refuser</button>
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

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <FiFilter />
        <input placeholder="Recherche nom / email" className="form-control" style={{ width: 240 }} value={searchName} onChange={(e) => setSearchName(e.target.value)} />
        <select className="form-control" style={{ width: 180 }} value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="">Tous rôles</option>
          {availableRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
        </select>
        <select className="form-control" style={{ width: 200 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="PENDING">En attente</option>
          <option value="APPROVED">Validés</option>
          <option value="REJECTED">Refusés</option>
        </select>
      </div>

      <div className="card">
        {loading ? <p>Chargement...</p> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôles</th>
                  <th>Statut</th>
                  <th>Compte</th>
                  <th>Email vérifié</th>
                  <th>Verrou</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: '#6B7280' }}>Aucun utilisateur trouvé</td></tr>
                ) : users.map((u) => {
                  const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  return (
                  <tr key={u.id} style={isLocked ? { background: '#FFF7ED' } : {}}>
                    <td style={{ fontWeight: 700 }}>{u.lastName} {u.firstName}</td>
                    <td>{u.email}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <span className="badge badge-info">{ROLE_LABEL[u.role] || u.role}</span>
                        {(u.additionalRoles || []).map((r) => (
                          <span
                            key={r.role}
                            className={`badge ${r.status === 'PENDING' ? 'badge-warning' : 'badge-success'}`}
                            title={r.status === 'PENDING' ? 'Rôle additionnel en attente de validation' : 'Rôle additionnel actif'}
                          >
                            {ROLE_LABEL[r.role] || r.role}{r.status === 'PENDING' ? ' (en attente)' : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{statusBadge(u.validationStatus)}</td>
                    <td><span className={`badge ${u.isActive === false ? 'badge-danger' : 'badge-success'}`}>{u.isActive === false ? 'Désactivé' : 'Actif'}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      {u.emailVerified && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)
                        ? <FiCheckCircle size={18} style={{ color: '#22C55E', verticalAlign: 'middle' }} title="Email vérifié" />
                        : <FiXCircle size={18} style={{ color: '#EF4444', verticalAlign: 'middle' }} title={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) ? 'Format email invalide' : 'Email non vérifié'} />
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isLocked ? (
                        <span title={`Verrouillé jusqu'au ${new Date(u.lockedUntil).toLocaleString('fr-FR')}`}>
                          🔒 <span style={{ fontSize: 11, color: '#DC2626' }}>
                            {new Date(u.lockedUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: '#9CA3AF', fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {u.validationStatus === 'PENDING' && (
                          <>
                            <button className="btn btn-success btn-sm" onClick={() => handleApprove(u.id)} title="Valider">
                              <FiCheck /> Valider
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleReject(u.id)} title="Refuser">
                              <FiX /> Refuser
                            </button>
                          </>
                        )}
                        {isLocked && (
                          <button
                            className="btn btn-warning btn-sm"
                            onClick={() => handleUnlock(u.id)}
                            title="Déverrouiller le compte"
                            style={{ background: '#F59E0B', color: '#fff', border: 'none' }}
                          >
                            <FiUnlock /> Déverrouiller
                          </button>
                        )}
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)} title="Modifier">
                          <FiEdit2 /> Modifier
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => setResetModalUser(u)} title="Générer un mot de passe">
                          <FiKey /> MDP
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleToggleActive(u)}
                          title={u.isActive === false ? 'Réactiver le compte' : 'Désactiver le compte'}
                        >
                          {u.isActive === false ? <><FiUserCheck /> Réactiver</> : <><FiUserX /> Désactiver</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <div style={{ color: '#6B7280' }}>Total: {pagination.total}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline" disabled={pagination.page <= 1 || loading} onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}>Préc</button>
                <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center' }}>Page {pagination.page}</div>
                <button className="btn btn-outline" disabled={(pagination.page * pagination.limit) >= pagination.total || loading} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>Suiv</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal création */}
      {createModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 440 }}>
            <div className="card-header"><h3>Créer un utilisateur</h3><button className="btn btn-outline btn-sm" onClick={() => setCreateModal(false)}>Fermer</button></div>
            <form onSubmit={handleCreate} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
                Le compte est créé et validé immédiatement. La personne reçoit un email pour définir son mot de passe.
              </p>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prénom *</label>
                <input className="form-control" value={newUser.firstName} onChange={(e) => setNewUser((p) => ({ ...p, firstName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input className="form-control" value={newUser.lastName} onChange={(e) => setNewUser((p) => ({ ...p, lastName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Email *</label>
                <input className="form-control" type="email" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Téléphone</label>
                <input className="form-control" value={newUser.phone} onChange={(e) => setNewUser((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Rôle *</label>
                <select className="form-control" value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))} required>
                  {availableRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setCreateModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal modification */}
      {editModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 440 }}>
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
    </div>
  );
}
