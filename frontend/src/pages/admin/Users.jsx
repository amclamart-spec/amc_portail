import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiFilter } from 'react-icons/fi';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDING');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = filter ? { status: filter } : {};
      const { data } = await api.get('/admin/users', { params });
      setUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [filter]);

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
      <div className="flex-between mb-2">
        <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des utilisateurs</h2>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <FiFilter />
        <select className="form-control" style={{ width: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Tous</option>
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
                    <td>{u.emailVerified ? '✅' : '❌'}</td>
                    <td style={{ fontSize: 13 }}>{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>
                      {u.validationStatus === 'PENDING' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-success btn-sm" onClick={() => handleApprove(u.id)} title="Valider">
                            <FiCheck /> Valider
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleReject(u.id)} title="Refuser">
                            <FiX /> Refuser
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
