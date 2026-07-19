import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { FiUsers, FiUserCheck, FiBookOpen, FiClipboard, FiCheckCircle, FiClock, FiAlertTriangle } from 'react-icons/fi';
import MapInscriptions from '../../components/MapInscriptions';

export default function AdminDashboard() {
  const [stats,    setStats]    = useState(null);
  const [communes, setCommunes] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [scope,    setScope]    = useState('current');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/admin/stats',           { params: { scope } }),
      api.get('/admin/stats/communes',  { params: { scope } }),
    ]).then(([statsRes, communesRes]) => {
      setStats(statsRes.data.stats);
      setCommunes(communesRes.data.communes || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [scope]);

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Tableau de bord {stats?.displayScope === 'current' && stats?.displayLabel ? `- ${stats.displayLabel}` : ''}</h2>
        <div>
          <button className={scope === 'current' ? 'btn btn-primary' : 'btn btn-outline'} onClick={() => setScope('current')}>Année en cours</button>
          <button style={{ marginLeft: 8 }} className={scope === 'global' ? 'btn btn-primary' : 'btn btn-outline'} onClick={() => setScope('global')}>Global</button>
        </div>
      </div>

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
            <h4>{stats?.displayCounts?.families ?? stats?.totalFamilies ?? 0}</h4>
            <p>Familles{stats?.displayScope === 'current' ? ' (année en cours)' : ''}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon primary"><FiBookOpen /></div>
          <div className="stat-info">
            <h4>{stats?.displayCounts?.students ?? stats?.totalStudents ?? 0}</h4>
            <p>Élèves{stats?.displayScope === 'current' ? ' (année en cours)' : ''}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><FiClipboard /></div>
          <div className="stat-info">
            <h4>{stats?.displayCounts?.enrollments ?? stats?.totalEnrollments ?? 0}</h4>
            <p>Inscriptions{stats?.displayScope === 'current' ? ' (année en cours)' : ''}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><FiCheckCircle /></div>
          <div className="stat-info">
            <h4>{stats?.validatedEnrollmentsCount ?? stats?.enrollmentsByStatus?.CONFIRMED ?? 0}</h4>
            <p>Inscrits validés</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><FiClock /></div>
          <div className="stat-info">
            <h4>{stats?.enrollmentsByStatus?.PENDING ?? 0}</h4>
            <p>Inscriptions en attente</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon danger"><FiAlertTriangle /></div>
          <div className="stat-info">
            <h4>{stats?.enrollmentsTestRequired ?? 0}</h4>
            <p>Test de niveau requis</p>
          </div>
        </div>
      </div>

      <MapInscriptions communes={communes} scope={scope} />

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
