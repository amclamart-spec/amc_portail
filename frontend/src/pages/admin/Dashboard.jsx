import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { FiUsers, FiUserCheck, FiBookOpen, FiClipboard } from 'react-icons/fi';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats').then(({ data }) => {
      setStats(data.stats);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>Tableau de bord</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon primary"><FiUsers /></div>
          <div className="stat-info">
            <h4>{stats?.totalUsers || 0}</h4>
            <p>Utilisateurs</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><FiUserCheck /></div>
          <div className="stat-info">
            <h4>{stats?.pendingUsers || 0}</h4>
            <p>En attente de validation</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><FiUsers /></div>
          <div className="stat-info">
            <h4>{stats?.totalFamilies || 0}</h4>
            <p>Familles</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon primary"><FiBookOpen /></div>
          <div className="stat-info">
            <h4>{stats?.totalStudents || 0}</h4>
            <p>Élèves</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><FiClipboard /></div>
          <div className="stat-info">
            <h4>{stats?.totalEnrollments || 0}</h4>
            <p>Inscriptions</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Activité récente</h3>
        </div>
        <p style={{ color: '#6B7280', fontSize: 14 }}>
          Bienvenue sur le tableau de bord administrateur du portail AMC.
          Utilisez le menu latéral pour gérer les utilisateurs, les inscriptions et les paramètres.
        </p>
      </div>
    </div>
  );
}
