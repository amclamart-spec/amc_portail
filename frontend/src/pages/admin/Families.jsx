import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiSearch } from 'react-icons/fi';
import api from '../../api/axios';

export default function AdminFamilies() {
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', accountStatus: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalPages: 1, total: 0 });

  async function loadFamilies(page = 1) {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/families', {
        params: {
          page,
          limit: pagination.limit,
          search: filters.search || undefined,
          accountStatus: filters.accountStatus || undefined,
        },
      });

      setFamilies(data.families || []);
      setPagination((prev) => ({ ...prev, ...(data.pagination || {}), page }));
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur de chargement des familles');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFamilies(1);
  }, []);

  function onSearchSubmit(event) {
    event.preventDefault();
    loadFamilies(1);
  }

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Liste des familles</h2>

      <div className="card mb-2">
        <form onSubmit={onSearchSubmit} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Recherche</label>
            <input
              className="form-control"
              placeholder="Nom, email, ville..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Statut compte</label>
            <select
              className="form-control"
              value={filters.accountStatus}
              onChange={(e) => setFilters((prev) => ({ ...prev, accountStatus: e.target.value }))}
            >
              <option value="">Tous</option>
              <option value="ACTIVE">Actif</option>
              <option value="INACTIVE">Inactif</option>
              <option value="SUSPENDED">Suspendu</option>
            </select>
          </div>

          <button className="btn btn-primary" type="submit"><FiSearch /> Rechercher</button>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Famille</th>
                  <th>Contact</th>
                  <th>Élèves</th>
                  <th>Paiements</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {families.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: '#6B7280' }}>Aucune famille trouvée</td>
                  </tr>
                ) : (
                  families.map((family) => (
                    <tr key={family.id}>
                      <td>
                        <strong>{family.familyName}</strong>
                        <div style={{ fontSize: 12, color: '#6B7280' }}>{family.city} ({family.postalCode})</div>
                      </td>
                      <td>
                        <div>{family.user?.firstName} {family.user?.lastName}</div>
                        <div style={{ fontSize: 12, color: '#6B7280' }}>{family.user?.email}</div>
                      </td>
                      <td>{family._count?.students || 0}</td>
                      <td>
                        <span style={{ fontSize: 13 }}>Impayé: {(family.financial?.unpaidAmount || 0).toFixed(2)}€</span>
                      </td>
                      <td>
                        <Link className="btn btn-outline btn-sm" to={`/admin/families/${family.id}`}>Fiche</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
          <small style={{ color: '#6B7280' }}>Total: {pagination.total}</small>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" disabled={pagination.page <= 1} onClick={() => loadFamilies(pagination.page - 1)}>Précédent</button>
            <span style={{ fontSize: 13, alignSelf: 'center' }}>Page {pagination.page} / {pagination.totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => loadFamilies(pagination.page + 1)}>Suivant</button>
          </div>
        </div>
      </div>
    </div>
  );
}
