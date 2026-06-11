import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiFilter, FiKey, FiCopy, FiCheckCircle, FiXCircle } from 'react-icons/fi';

function ResetPasswordModal({ user, onClose }) {
  const [generatedPassword, setGeneratedPassword] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/admin/users/${user.id}/reset-password`);
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
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 420, padding: 28, position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 8, color: 'var(--amc-primary)' }}>
          Réinitialisation du mot de passe
        </h3>
        <p style={{ color: '#6B7280', marginBottom: 20 }}>
          Utilisateur : <strong>{user.lastName} {user.firstName}</strong><br />
          <span style={{ fontSize: 13 }}>{user.email}</span>
        </p>

        {!generatedPassword ? (
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Génération…' : 'Générer un nouveau mot de passe'}
          </button>
        ) : (
          <div>
            <p style={{ marginBottom: 8, fontWeight: 600 }}>Nouveau mot de passe :</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <code
                style={{
                  flex: 1, padding: '8px 12px',
                  background: '#F3F4F6', borderRadius: 6,
                  fontSize: 15, letterSpacing: 1, border: '1px solid #E5E7EB',
                }}
              >
                {generatedPassword}
              </code>
              <button className="btn btn-outline btn-sm" onClick={handleCopy} title="Copier">
                <FiCopy />
              </button>
            </div>
            <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 16 }}>
              Notez ce mot de passe — il ne sera plus affiché après fermeture.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? 'Génération…' : 'Régénérer'}
            </button>
          </div>
        )}

        <button
          className="btn btn-outline"
          style={{ width: '100%', marginTop: 10 }}
          onClick={onClose}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [filterRole, setFilterRole] = useState('');
  const [searchName, setSearchName] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [resetModalUser, setResetModalUser] = useState(null);

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

  const handleReject = async (id) => {
    const reason = prompt('Motif du refus (optionnel) :');
    try {
      await api.put(`/admin/users/${id}/reject`, { reason });
      toast.success('Compte refusé');
      fetchUsers();
    } catch { toast.error('Erreur'); }
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
        <ResetPasswordModal user={resetModalUser} onClose={() => setResetModalUser(null)} />
      )}

      <div className="flex-between mb-2">
        <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des utilisateurs</h2>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <FiFilter />
        <input placeholder="Recherche nom / email" className="form-control" style={{ width: 240 }} value={searchName} onChange={(e) => setSearchName(e.target.value)} />
        <select className="form-control" style={{ width: 180 }} value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="">Tous rôles</option>
          <option value="FAMILLE">FAMILLE</option>
          <option value="PROFESSEUR">PROFESSEUR</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
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
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Email vérifié</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: '#6B7280' }}>Aucun utilisateur trouvé</td></tr>
                ) : users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.lastName} {u.firstName}</td>
                    <td>{u.email}</td>
                    <td><span className="badge badge-info">{u.role}</span></td>
                    <td>{statusBadge(u.validationStatus)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {u.emailVerified && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)
                        ? <FiCheckCircle size={18} style={{ color: '#22C55E', verticalAlign: 'middle' }} title="Email vérifié" />
                        : <FiXCircle size={18} style={{ color: '#EF4444', verticalAlign: 'middle' }} title={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) ? 'Format email invalide' : 'Email non vérifié'} />
                      }
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
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setResetModalUser(u)}
                          title="Réinitialiser le mot de passe"
                        >
                          <FiKey /> MDP
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}
