import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiBookOpen } from 'react-icons/fi';

export default function FamilyEnrollment() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/enrollments/summary')
      .then(({ data }) => setSummary(data))
      .catch((err) => {
        console.error(err);
        toast.error('Impossible de charger vos inscriptions.');
      })
      .finally(() => setLoading(false));
  }, []);

  const getStatusStyles = (status) => {
    const isConfirmed = status === 'CONFIRMED';
    return {
      background: isConfirmed ? '#DCFCE7' : '#FFEDD5',
      color: isConfirmed ? '#166534' : '#C2410C',
      border: `1px solid ${isConfirmed ? '#86EFAC' : '#FDBA74'}`,
      padding: '4px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    };
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>
        <FiBookOpen style={{ marginRight: 8 }} /> Mes inscriptions
      </h2>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3>Inscriptions de la famille</h3>
          {summary?.schoolYear && (
            <small>Ann�e scolaire : {summary.schoolYear.label}</small>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 16, color: '#6B7280' }}>Chargement...</div>
        ) : summary?.enrollments?.length ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
              padding: 16,
            }}
          >
            {summary.enrollments.map((enrollment) => (
              <div
                key={enrollment.enrollmentId}
                className="card"
                style={{
                  padding: 20,
                  border: '1px solid var(--amc-border)',
                  minHeight: 180,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                    {enrollment.isProvisional && (
                      <div style={{ marginBottom: 8 }}>
                        <span style={{ background: '#FEF3C7', color: '#92400E', padding: '6px 10px', borderRadius: 8, fontWeight: 800 }}>Affectation provisoire</span>
                      </div>
                    )}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{enrollment.studentName}</strong>
                    <div style={{ color: '#6B7280', fontSize: 13, marginTop: 6 }}>
                      {enrollment.poleName} — {enrollment.levelName} ({enrollment.levelCode})
                    </div>
                  </div>
                  <div style={getStatusStyles(enrollment.status)}>
                    {enrollment.status === 'CONFIRMED' ? 'Confirmée' : 'En attente'}
                  </div>
                </div>

                <div style={{ marginTop: 16, color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
                  <div>
                    <strong>Creneau :</strong> {enrollment.schedule}
                  </div>
                  {enrollment.room && (
                    <div>
                      <strong>Salle :</strong> {enrollment.room}
                    </div>
                  )}
                  {enrollment.teacherName && (
                    <div>
                      <strong>Professeur :</strong> {enrollment.teacherName}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 16, color: '#6B7280' }}>
            <p>Aucune inscription trouv�e pour votre famille.</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/famille/inscription/nouveau')}
            >
              Inscrire un nouveau membre
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
