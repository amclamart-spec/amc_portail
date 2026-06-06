import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function AdminClassDetails() {
  const { id } = useParams();
  const [classData, setClassData] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messageForm, setMessageForm] = useState({ subject: '', message: '' });
  const [selectedTeacherId, setSelectedTeacherId] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [classRes, teachersRes] = await Promise.all([
        api.get(`/admin/classes/${id}`),
        api.get('/admin/professeurs'),
      ]);

      setClassData(classRes.data.class);
      setTeachers(teachersRes.data.teachers || []);
      setSelectedTeacherId(classRes.data.class?.teacherId || '');
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger la classe');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const students = useMemo(() => classData?.enrollments || [], [classData]);
  const STUDENTS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(students.length / STUDENTS_PER_PAGE));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * STUDENTS_PER_PAGE;
    return students.slice(start, start + STUDENTS_PER_PAGE);
  }, [students, currentPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [id]);

  const removeStudent = async (enrollmentId) => {
    const ok = window.confirm('Retirer cet élève de la classe ?');
    if (!ok) return;

    try {
      await api.delete(`/admin/classes/${id}/inscriptions/${enrollmentId}`);
      toast.success('Élève retiré');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Action impossible');
    }
  };

  const exportFile = async (type) => {
    try {
      const response = await api.get(`/admin/classes/${id}/export/${type}`, { responseType: 'blob' });
      const blob = new Blob([response.data]);
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `classe-${id}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
      toast.success(`Export ${type.toUpperCase()} généré`);
    } catch (error) {
      console.error(error);
      toast.error('Erreur export');
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!messageForm.subject || !messageForm.message) {
      toast.error('Sujet et message sont requis');
      return;
    }

    try {
      const { data } = await api.post(`/admin/classes/${id}/message-familles`, messageForm);
      toast.success(`Message envoyé à ${data.recipients || 0} famille(s)`);
      setMessageForm({ subject: '', message: '' });
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Envoi impossible');
    }
  };

  const updateTeacher = async () => {
    if (!selectedTeacherId) {
      toast.error('Sélectionnez un professeur');
      return;
    }

    try {
      await api.put(`/admin/classes/${id}`, { teacherId: selectedTeacherId });
      toast.success('Professeur mis à jour');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Mise à jour impossible');
    }
  };

  const closeRegistrations = async () => {
    try {
      await api.put(`/admin/classes/${id}`, { status: 'CLOSED' });
      toast.success('Inscriptions fermées');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Action impossible');
    }
  };

  if (loading) return <p>Chargement...</p>;
  if (!classData) return <p>Classe introuvable.</p>;

  const teacherName = classData.teacher ? `${classData.teacher.firstName} ${classData.teacher.lastName}` : '-';
  const classStatusLabel = {
    OPEN: 'Ouverte',
    CLOSED: 'Fermée',
    FULL: 'Pleine',
  }[classData.status] || classData.status || '-';

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link className="btn btn-outline" to="/admin/classes">← Retour aux classes</Link>
      </div>

      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 14 }}>
        Détail classe — {classData.level?.pole?.name} / {classData.level?.name}
      </h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Informations générales</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <InfoItem label="Année" value={classData.schoolYear?.label || '-'} />
          <InfoItem label="Salle" value={classData.roomRef?.name || classData.room || '-'} />
          <InfoItem label="Créneau" value={`${classData.dayOfWeek} ${classData.startTime}-${classData.endTime}`} />
          <InfoItem label="Professeur" value={teacherName} />
          <InfoItem label="Effectif" value={`${classData.enrolledCount}/${classData.capacity} ${classData.fillIndicator?.label || ''}`} />
          <InfoItem label="Statut" value={classStatusLabel} />
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={closeRegistrations}>Fermer les inscriptions</button>
          <button className="btn btn-primary" onClick={() => exportFile('excel')}>Exporter Excel</button>
          <button className="btn btn-primary" onClick={() => exportFile('pdf')}>Exporter PDF</button>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
          <select className="form-control" value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)}>
            <option value="">Changer le professeur...</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.lastName} {teacher.firstName}</option>
            ))}
          </select>
          <button className="btn btn-outline" onClick={updateTeacher}>Mettre à jour</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 10 }}>Liste des élèves inscrits</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Âge</th>
                <th>Date d'inscription</th>
                <th>Coordonnées famille</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', color: '#6B7280' }}>Aucun élève inscrit</td></tr>
              ) : (
                paginatedStudents.map((enrollment) => {
                  const student = enrollment.student;
                  const familyUser = student.family?.user;
                  const age = Math.floor((Date.now() - new Date(student.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                  return (
                    <tr key={enrollment.id}>
                      <td>{student.lastName} {student.firstName}</td>
                      <td>{age} ans</td>
                      <td>{new Date(enrollment.enrolledAt).toLocaleDateString('fr-FR')}</td>
                      <td>{familyUser?.email || '-'} / {familyUser?.phone || '-'}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => removeStudent(enrollment.id)}>Retirer</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {students.length > STUDENTS_PER_PAGE && (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ color: '#6B7280', fontSize: 14 }}>
              Affichage {Math.min((currentPage - 1) * STUDENTS_PER_PAGE + 1, students.length)}-{Math.min(currentPage * STUDENTS_PER_PAGE, students.length)} / {students.length}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Précédent
              </button>
              <span style={{ fontSize: 14, color: '#374151' }}>
                Page {currentPage} / {totalPages}
              </span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Envoyer un message aux familles</h3>
        <form onSubmit={sendMessage} style={{ display: 'grid', gap: 10 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Sujet</label>
            <input className="form-control" value={messageForm.subject} onChange={(e) => setMessageForm((prev) => ({ ...prev, subject: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Message</label>
            <textarea className="form-control" rows="5" value={messageForm.message} onChange={(e) => setMessageForm((prev) => ({ ...prev, message: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" type="submit">Envoyer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}
