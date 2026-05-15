import { useAuth } from '../../context/AuthContext';
import { FiBookOpen } from 'react-icons/fi';

export default function StudentDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>
        Bienvenue, {user?.firstName} !
      </h2>

      <div className="card">
        <div className="card-header">
          <h3><FiBookOpen style={{ marginRight: 8 }} /> Mon espace élève</h3>
        </div>
        <p style={{ color: '#6B7280' }}>
          Cet espace vous permet de consulter vos informations et vos cours inscrits.
        </p>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ padding: '12px 16px', background: 'var(--amc-light-bg-2)', borderRadius: 8 }}>
              <strong>Nom :</strong> {user?.lastName} {user?.firstName}
            </div>
            <div style={{ padding: '12px 16px', background: 'var(--amc-light-bg-2)', borderRadius: 8 }}>
              <strong>Email :</strong> {user?.email}
            </div>
            <div style={{ padding: '12px 16px', background: 'var(--amc-light-bg-2)', borderRadius: 8 }}>
              <strong>Statut :</strong>{' '}
              {user?.validationStatus === 'APPROVED' ? (
                <span className="badge badge-success">Validé</span>
              ) : user?.validationStatus === 'PENDING' ? (
                <span className="badge badge-warning">En attente</span>
              ) : (
                <span className="badge badge-danger">Refusé</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Mes cours inscrits</h3>
        </div>
        <p style={{ color: '#6B7280', textAlign: 'center', padding: 20 }}>
          Les cours auxquels vous êtes inscrit(e) apparaîtront ici.
        </p>
      </div>
    </div>
  );
}
