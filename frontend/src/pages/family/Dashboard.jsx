import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { FiUsers, FiBookOpen, FiPlus, FiDollarSign } from 'react-icons/fi';

export default function FamilyDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [homeworkMessages, setHomeworkMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/family/dashboard').then(({ data }) => {
      setDashboard(data);
    }).catch(() => {}).finally(() => setLoading(false));

    api.get('/homework/family').then(({ data }) => {
      setHomeworkMessages(data.messages || []);
    }).catch(() => {});
  }, []);

  if (loading) return <p>Chargement...</p>;

  const family = dashboard?.family;
  const students = family?.students || [];
  const currentYear = dashboard?.currentSchoolYear;

  const currentEnrollments = students.flatMap((s) =>
    (s.enrollments || []).filter((e) => e.schoolYear?.isCurrent && e.status !== 'CANCELLED')
  );

  const familyEnrollments = students.flatMap((s) => s.enrollments || []);
  const latestEnrollment = familyEnrollments
    .filter((e) => e.registrationCode)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 8 }}>
        Bienvenue, {user?.firstName} !
      </h2>
      {currentYear && (
        <p style={{ color: '#6B7280', marginBottom: 24 }}>Année scolaire : <strong>{currentYear.label}</strong></p>
      )}

      {!family && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 16, marginBottom: 16 }}>Complétez votre profil famille pour commencer les inscriptions.</p>
          <Link to="/famille/profil" className="btn btn-primary btn-lg">
            <FiPlus /> Compléter mon profil
          </Link>
        </div>
      )}

      {family && (
        <>
          <div className="card" style={{ marginBottom: 20, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{family.familyName}</h3>
                {latestEnrollment?.registrationCode && (
                  <p style={{ margin: '6px 0 0', color: '#6B7280' }}>
                    Réf. inscription : <strong>{latestEnrollment.registrationCode}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon primary"><FiUsers /></div>
              <div className="stat-info">
                <h4>{students.length}</h4>
                <p>Enfants enregistrés</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon success"><FiBookOpen /></div>
              <div className="stat-info">
                <h4>{currentEnrollments.length}</h4>
                <p>Inscriptions cette année</p>
              </div>
            </div>
          </div>

          {/* Actions rapides */}
          <div className="card">
            <div className="card-header">
              <h3>Actions rapides</h3>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/famille/inscription/nouveau" className="btn btn-primary">
                <FiPlus /> Nouvelle inscription
              </Link>
              <Link to="/famille/suivi-pedagogique" className="btn btn-outline">
                Voir le suivi pédagogique
              </Link>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Messages de devoirs</h3>
            </div>
            <div style={{ display: 'grid', gap: 14, padding: 16 }}>
              {homeworkMessages.length === 0 ? (
                <div style={{ padding: 20, color: '#6B7280' }}>
                  Aucun message de devoirs disponible pour vos enfants actuellement.
                </div>
              ) : (
                homeworkMessages.map((message) => (
                  <div key={message.id} className="card" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong>Classe ID : {message.classId}</strong>
                      <span>{new Date(message.date).toLocaleDateString()}</span>
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{message.body}</p>
                    {message.attachmentUrl && (
                      <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="btn btn-outline-secondary btn-sm">
                        Voir la pièce jointe{message.attachmentFilename ? ` (${message.attachmentFilename})` : ''}
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
