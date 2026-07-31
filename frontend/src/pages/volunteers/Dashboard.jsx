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

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }

export default function VolunteersDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/volunteers/dashboard')
      .then(({ data: d }) => setData(d))
      .catch(() => toast.error('Impossible de charger le tableau de bord'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Chargement…</p>;

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Pôle Bénévoles</h2>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <StatCard icon={<FiClock />} label="En attente de validation" value={data?.pendingCount} color="warning" />
        <StatCard icon={<FiUsers />} label="Bénévoles actifs" value={data?.activeCount} color="success" />
        <StatCard icon={<FiCalendar />} label="Événements à venir" value={data?.upcomingEvents?.length} color="primary" />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link to="/volunteers/manage" className="btn btn-primary">Gérer les bénévoles</Link>
        <Link to="/volunteers/events" className="btn btn-outline">Gérer les événements</Link>
      </div>

      <div className="card">
        <div className="card-header"><h3>Prochains événements</h3></div>
        <div className="table-container">
          <table>
            <thead><tr><th>Titre</th><th>Date</th><th>Lieu</th></tr></thead>
            <tbody>
              {(data?.upcomingEvents || []).length === 0 ? (
                <tr><td colSpan="3" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun événement à venir</td></tr>
              ) : data.upcomingEvents.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600 }}>{e.title}</td>
                  <td>{fmtDate(e.startDate)}</td>
                  <td>{e.location || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
