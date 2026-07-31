import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiUsers, FiClock, FiCalendar } from 'react-icons/fi';

function StatCard({ icon, label, value, color = 'primary' }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div className="stat-info">
        <h4>{value ?? '—'}</h4>
        <p>{label}</p>
      </div>
    </div>
  );
}

export default function HrDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/hr/dashboard')
      .then(({ data: d }) => setData(d))
      .catch(() => toast.error('Impossible de charger le tableau de bord'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Chargement…</p>;

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Ressources Humaines</h2>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <StatCard icon={<FiClock />} label="En attente de validation" value={data?.pendingCount} color="warning" />
        <StatCard icon={<FiUsers />} label="Salariés actifs" value={data?.activeCount} color="success" />
        <StatCard icon={<FiCalendar />} label="Demandes de congé en attente" value={data?.pendingLeavesCount} color="warning" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/hr/employees" className="btn btn-primary">Gérer les salariés</Link>
        <Link to="/hr/leave-requests" className="btn btn-outline">Gérer les congés</Link>
      </div>
    </div>
  );
}
