import { useEffect, useState } from 'react';
import api from '../../api/axios';

export default function ProfesseurDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/teacher/dashboard').then(({ data }) => setData(data)).catch(console.error);
  }, []);

  const classes = data?.classes || [];

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Espace Professeur</h2>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-info"><h4>{data?.summary?.totalClasses || 0}</h4><p>Classes assignées</p></div></div>
        <div className="stat-card"><div className="stat-info"><h4>{data?.summary?.totalStudents || 0}</h4><p>Élèves suivis</p></div></div>
      </div>

      <div className="card">
        <h3>Mes classes</h3>
        {classes.length === 0 ? <p>Aucune classe affectée.</p> : (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Pôle</th><th>Niveau</th><th>Horaire</th><th>Inscrits</th></tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.level?.pole?.name}</td>
                    <td>{c.level?.name}</td>
                    <td>{c.dayOfWeek} {c.startTime}-{c.endTime}</td>
                    <td>{c.enrollments?.length || c.enrolledCount}</td>
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
