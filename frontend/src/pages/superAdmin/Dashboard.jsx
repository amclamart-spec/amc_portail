import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { FiPlus, FiCheck, FiX, FiShield, FiKey, FiCopy, FiUserX, FiUserCheck } from 'react-icons/fi';
import { ROLE_LABEL as SHARED_ROLE_LABEL } from '../../utils/roles';

// Dans l'espace Super Admin, on affiche les rôles sans le préfixe "Espace" (qui n'a de sens
// que dans le menu de la personne elle-même) — Famille/Professeur/Bénévole/Salarié plutôt
// qu'Espace Famille/Professeur/Bénévole/Salarié.
const ROLE_LABEL = Object.fromEntries(
  Object.entries(SHARED_ROLE_LABEL).map(([role, label]) => [role, label.replace(/^Espace /, '')])
);

const ALL_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'TRESORIER', 'PROFESSEUR', 'FAMILLE',
  'RESPONSABLE_POLE_CORAN', 'RESPONSABLE_POLE_ARABE', 'RESPONSABLE_POLE_SOUTIEN_SCO', 'RESPONSABLE_POLE_SCIENCE_IS',
  'RESPONSABLE_POLE_SOCIAL', 'OPERATEUR_SOCIAL',
  'RESPONSABLE_POLE_BENEVOLES', 'BENEVOLE',
  'RESPONSABLE_RH', 'SALARIE',
];

const STATUS_LABEL = { PENDING: 'En attente', APPROVED: 'Validé', REJECTED: 'Refusé' };
const STATUS_BADGE = { PENDING: 'badge-warning', APPROVED: 'badge-success', REJECTED: 'badge-danger' };

const EMPTY_NEW = { firstName: '', lastName: '', email: '', phone: '', role: 'FAMILLE' };

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

function GeneratedPasswordModal({ user, onClose }) {
  const [generatedPassword, setGeneratedPassword] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/super-admin/users/${user.id}/reset-password`);
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

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'pending'

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const [createModal, setCreateModal] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW);
  const [saving, setSaving] = useState(false);

  const [rolesModal, setRolesModal] = useState(null); // user being edited
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [rolesSaving, setRolesSaving] = useState(false);

  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [passwordModalUser, setPasswordModalUser] = useState(null);

  const loadUsers = async (p = page) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (search) params.name = search;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/super-admin/users', { params });
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch { toast.error('Impossible de charger les utilisateurs'); }
    finally { setLoading(false); }
  };

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const { data } = await api.get('/super-admin/users/pending');
      setPending(data.users || []);
    } catch { toast.error('Impossible de charger les demandes en attente'); }
    finally { setPendingLoading(false); }
  };

  useEffect(() => { loadUsers(1); loadPending(); }, []);

  const handleSearch = () => { setPage(1); loadUsers(1); };
  const handlePageChange = (p) => { setPage(p); loadUsers(p); };
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.role) {
      toast.error('Prénom, nom, email et rôle sont requis');
      return;
    }
    setSaving(true);
    try {
      await api.post('/super-admin/users', newUser);
      toast.success('Utilisateur créé — un email d\'invitation lui a été envoyé');
      setCreateModal(false);
      setNewUser(EMPTY_NEW);
      loadUsers(1);
      setPage(1);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const openRolesModal = (u) => { setRolesModal(u); setSelectedRoles(u.roles || [u.role]); };
  const toggleRole = (role) => {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const handleSaveRoles = async () => {
    if (selectedRoles.length === 0) { toast.error('Au moins un rôle est requis'); return; }
    setRolesSaving(true);
    try {
      await api.put(`/super-admin/users/${rolesModal.id}/roles`, { roles: selectedRoles });
      toast.success('Rôles mis à jour');
      setRolesModal(null);
      loadUsers(page);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setRolesSaving(false); }
  };

  const handleApprove = async (id) => {
    try {
      await api.put(`/super-admin/users/${id}/approve`);
      toast.success('Compte validé');
      loadPending();
      loadUsers(page);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const openReject = (u) => { setRejectModal(u); setRejectReason(''); };
  const handleReject = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/super-admin/users/${rejectModal.id}/reject`, { reason: rejectReason });
      toast.success('Demande refusée');
      setRejectModal(null);
      loadPending();
      loadUsers(page);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleToggleActive = async (u) => {
    const nextActive = !(u.isActive !== false);
    if (!nextActive && !confirm(`Désactiver le compte de ${u.firstName} ${u.lastName} ? La connexion sera bloquée, les données seront conservées.`)) return;
    try {
      await api.put(`/super-admin/users/${u.id}/active`, { isActive: nextActive });
      toast.success(nextActive ? 'Compte réactivé' : 'Compte désactivé');
      loadUsers(page);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Super Admin — Utilisateurs</h2>
        <button className="btn btn-primary" onClick={() => setCreateModal(true)}><FiPlus size={14} /> Créer un utilisateur</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('all')}>
          Tous les utilisateurs ({total})
        </button>
        <button className={`btn btn-sm ${activeTab === 'pending' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('pending')}>
          En attente de validation ({pending.length})
        </button>
      </div>

      {activeTab === 'all' && (
        <div className="card">
          <div style={{ padding: 12, borderBottom: '1px solid var(--amc-border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="form-control"
              placeholder="Rechercher (nom, prénom, email)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, minWidth: 200 }}
            />
            <select className="form-control" style={{ width: 220 }} value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
              <option value="">Tous rôles</option>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
            </select>
            <select className="form-control" style={{ width: 160 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">Tous statuts</option>
              <option value="PENDING">En attente</option>
              <option value="APPROVED">Validés</option>
              <option value="REJECTED">Refusés</option>
            </select>
            <button className="btn btn-secondary" onClick={handleSearch}>Chercher</button>
            <button className="btn btn-outline" onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); setPage(1); loadUsers(1); }}>Effacer</button>
          </div>
          {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
            <div className="table-container">
              <table>
                <thead><tr><th>Nom</th><th>Email</th><th>Rôles</th><th>Statut</th><th>Compte</th><th>Membre depuis</th><th>Actions</th></tr></thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun utilisateur trouvé</td></tr>
                  ) : users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.lastName} {u.firstName}</td>
                      <td>{u.email}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(u.roles || [u.role]).map((r) => (
                            <span key={r} className="badge badge-gray" style={{ fontSize: 11 }}>{ROLE_LABEL[r] || r}</span>
                          ))}
                        </div>
                      </td>
                      <td><span className={`badge ${STATUS_BADGE[u.validationStatus]}`}>{STATUS_LABEL[u.validationStatus] || u.validationStatus}</span></td>
                      <td><span className={`badge ${u.isActive === false ? 'badge-danger' : 'badge-success'}`}>{u.isActive === false ? 'Désactivé' : 'Actif'}</span></td>
                      <td>{fmtDate(u.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-sm btn-outline" onClick={() => openRolesModal(u)}><FiShield size={12} /> Rôles</button>
                          <button className="btn btn-sm btn-outline" onClick={() => setPasswordModalUser(u)}><FiKey size={12} /> MDP</button>
                          <button className="btn btn-sm btn-outline" onClick={() => handleToggleActive(u)}>
                            {u.isActive === false ? <><FiUserCheck size={12} /> Réactiver</> : <><FiUserX size={12} /> Désactiver</>}
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
      )}

      {activeTab === 'pending' && (
        <div className="card">
          <div className="card-header"><h3>Demandes en attente de validation</h3></div>
          <p style={{ padding: '0 16px', color: '#6B7280', fontSize: 13 }}>
            Les comptes Famille sont validés automatiquement à l'inscription et n'apparaissent jamais ici.
          </p>
          {pendingLoading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
            <div className="table-container">
              <table>
                <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Rôle demandé</th><th>Date de la demande</th><th>Actions</th></tr></thead>
                <tbody>
                  {pending.length === 0 ? (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucune demande en attente</td></tr>
                  ) : pending.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.lastName} {u.firstName}</td>
                      <td>{u.email}</td>
                      <td>{u.phone || '—'}</td>
                      <td><span className="badge badge-gray">{ROLE_LABEL[u.role] || u.role}</span></td>
                      <td>{fmtDate(u.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => handleApprove(u.id)}><FiCheck size={12} /> Valider</button>
                          <button className="btn btn-sm btn-danger" onClick={() => openReject(u)}><FiX size={12} /> Refuser</button>
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

      {/* Modal création utilisateur */}
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
                  {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
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

      {/* Modal gestion des rôles */}
      {rolesModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 460 }}>
            <div className="card-header">
              <h3>Rôles — {rolesModal.firstName} {rolesModal.lastName}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setRolesModal(null)}>Fermer</button>
            </div>
            <div style={{ padding: 16 }}>
              <p style={{ color: '#6B7280', fontSize: 13, marginTop: 0 }}>
                Cochez les rôles à accorder à cet utilisateur. Au moins un rôle est requis.
                {rolesModal.id === user?.id && <> Vous ne pouvez pas retirer votre propre rôle Super Admin.</>}
              </p>
              <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                {ALL_ROLES.map((r) => (
                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(r)}
                      disabled={rolesModal.id === user?.id && r === 'SUPER_ADMIN' && rolesModal.role === 'SUPER_ADMIN'}
                      onChange={() => toggleRole(r)}
                    />
                    {ROLE_LABEL[r] || r}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={() => setRolesModal(null)}>Annuler</button>
                <button type="button" className="btn btn-primary" onClick={handleSaveRoles} disabled={rolesSaving}>{rolesSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal refus */}
      {rejectModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Refuser la demande de {rejectModal.firstName} {rejectModal.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setRejectModal(null)}>Fermer</button></div>
            <form onSubmit={handleReject} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Motif (optionnel, envoyé par email)</label>
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

      {passwordModalUser && (
        <GeneratedPasswordModal user={passwordModalUser} onClose={() => setPasswordModalUser(null)} />
      )}
    </div>
  );
}
