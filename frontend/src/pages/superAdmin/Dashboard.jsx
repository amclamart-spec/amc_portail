import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'TRESORIER', 'PROFESSEUR', 'FAMILLE'];

export default function SuperAdminDashboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/super-admin/admins');
      setUsers(data.users || []);
    } catch {
      toast.error('Impossible de charger les administrateurs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateRole = async (userId, role) => {
    try {
      await api.patch(`/super-admin/users/${userId}/role`, { role });
      toast.success('Rôle mis à jour');
      load();
    } catch {
      toast.error('Échec de la mise à jour du rôle');
    }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Super Admin — Gestion des rôles</h2>
      <div className="card" style={{ marginTop: 20 }}>
        {loading ? <p>Chargement...</p> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Validation</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.firstName} {u.lastName}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>{u.validationStatus}</td>
                    <td>
                      <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} className="form-control">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
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
