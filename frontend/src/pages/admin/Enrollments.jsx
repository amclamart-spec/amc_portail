import { useEffect, useState } from 'react';
import api from '../../api/axios';

export default function AdminEnrollments() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/enrollments').then(({ data }) => {
      setEnrollments(data.enrollments);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const statusBadge = (status) => {
    const map = {
      PENDING: { cls: 'badge-warning', label: 'En attente' },
      CONFIRMED: { cls: 'badge-success', label: 'Confirmée' },
      CANCELLED: { cls: 'badge-danger', label: 'Annulée' },
      ARCHIVED: { cls: 'badge-gray', label: 'Archivée' },
    };
    const s = map[status] || { cls: 'badge-gray', label: status };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>Gestion des inscriptions</h2>

      <div className="card">
        {loading ? <p>Chargement...</p> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Élève</th>
                  <th>Pôle</th>
                  <th>Niveau</th>
                  <th>Créneau</th>
                  <th>Année</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: '#6B7280' }}>Aucune inscription</td></tr>
                ) : enrollments.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 700 }}>{e.student.lastName} {e.student.firstName}</td>
                    <td>{e.class?.level?.pole?.name}</td>
                    <td>{e.class?.level?.name}</td>
                    <td>{e.class?.dayOfWeek} {e.class?.startTime}-{e.class?.endTime}</td>
                    <td>{e.schoolYear?.label}</td>
                    <td>{statusBadge(e.status)}</td>
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
