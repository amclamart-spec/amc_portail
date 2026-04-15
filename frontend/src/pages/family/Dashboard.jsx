import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { FiUsers, FiBookOpen, FiPlus, FiDollarSign } from 'react-icons/fi';

export default function FamilyDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/family/dashboard').then(({ data }) => {
      setDashboard(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Chargement...</p>;

  const family = dashboard?.family;
  const students = family?.students || [];
  const currentYear = dashboard?.currentSchoolYear;

  const currentEnrollments = students.flatMap((s) =>
    (s.enrollments || []).filter((e) => e.schoolYear?.isCurrent && e.status !== 'CANCELLED')
  );

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
              <Link to="/famille/enfants" className="btn btn-primary">
                <FiPlus /> Ajouter un enfant
              </Link>
              <Link to="/famille/inscription" className="btn btn-secondary">
                <FiBookOpen /> Inscrire à un cours
              </Link>
            </div>
          </div>

          {/* Mes enfants */}
          <div className="card">
            <div className="card-header">
              <h3>Mes enfants</h3>
              <Link to="/famille/enfants" className="btn btn-outline btn-sm">Gérer</Link>
            </div>
            {students.length === 0 ? (
              <p style={{ color: '#6B7280', textAlign: 'center', padding: 20 }}>
                Aucun enfant enregistré. <Link to="/famille/enfants">Ajouter un enfant</Link>
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {students.map((s) => {
                  const age = Math.floor((Date.now() - new Date(s.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                  const sEnrollments = (s.enrollments || []).filter((e) => e.schoolYear?.isCurrent && e.status !== 'CANCELLED');
                  return (
                    <div key={s.id} style={{
                      border: '1px solid var(--amc-border)', borderRadius: 8, padding: 16,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
                    }}>
                      <div>
                        <strong style={{ fontSize: 16 }}>{s.lastName} {s.firstName}</strong>
                        <div style={{ color: '#6B7280', fontSize: 13 }}>
                          {age} ans • {s.gender === 'GARCON' ? 'Garçon' : 'Fille'}
                        </div>
                        {sEnrollments.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            {sEnrollments.map((e) => (
                              <span key={e.id} className="badge badge-info" style={{ marginRight: 6, marginBottom: 4 }}>
                                {e.class?.level?.pole?.name} — {e.class?.level?.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Link to="/famille/inscription" className="btn btn-outline btn-sm">
                        <FiBookOpen /> Inscrire
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
