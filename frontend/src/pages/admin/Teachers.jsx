import { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const SPECIALTIES = [
  'Arabe débutant (Niv. 1-2)',
  'Arabe intermédiaire (Niv. 3-5)',
  'Arabe avancé (Niv. 6-8)',
  'Coran',
  'Sciences islamiques',
];

const emptyForm = {
  civility: 'M',
  lastName: '',
  firstName: '',
  email: '',
  phone: '',
  specialties: [],
  status: 'ACTIVE',
};

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [teacherDetails, setTeacherDetails] = useState(null);

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)),
    [teachers]
  );

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/professeurs');
      setTeachers(data.teachers || []);
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger les professeurs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const openCreateModal = () => {
    setEditingTeacher(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (teacher) => {
    setEditingTeacher(teacher);
    setForm({
      civility: teacher.civility || 'M',
      lastName: teacher.lastName || '',
      firstName: teacher.firstName || '',
      email: teacher.email || '',
      phone: teacher.phone || '',
      specialties: teacher.specialties || [],
      status: teacher.status || 'ACTIVE',
    });
    setModalOpen(true);
  };

  const toggleSpecialty = (specialty) => {
    setForm((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(specialty)
        ? prev.specialties.filter((item) => item !== specialty)
        : [...prev.specialties, specialty],
    }));
  };

  const saveTeacher = async (event) => {
    event.preventDefault();
    if (!form.lastName.trim() || !form.firstName.trim() || !form.email.trim()) {
      toast.error('Nom, prénom et email sont obligatoires');
      return;
    }

    try {
      if (editingTeacher) {
        await api.put(`/admin/professeurs/${editingTeacher.id}`, form);
        toast.success('Professeur mis à jour');
      } else {
        await api.post('/admin/professeurs', form);
        toast.success('Professeur créé (compte et mot de passe temporaire envoyés par email)');
      }
      setModalOpen(false);
      fetchTeachers();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Sauvegarde impossible');
    }
  };

  const resetPassword = async (teacher) => {
    try {
      await api.post(`/admin/professeurs/${teacher.id}/reset-password`);
      toast.success('Mot de passe temporaire envoyé par email');
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Réinitialisation impossible');
    }
  };

  const deactivateTeacher = async (teacher) => {
    const ok = window.confirm(`Désactiver/supprimer ${teacher.lastName} ${teacher.firstName} ?`);
    if (!ok) return;

    try {
      await api.delete(`/admin/professeurs/${teacher.id}`);
      toast.success('Professeur désactivé');
      if (selectedTeacher?.id === teacher.id) {
        setSelectedTeacher(null);
        setTeacherDetails(null);
      }
      fetchTeachers();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Action impossible');
    }
  };

  const openDetails = async (teacher) => {
    setSelectedTeacher(teacher);
    try {
      const { data } = await api.get(`/admin/professeurs/${teacher.id}`);
      setTeacherDetails(data);
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger la fiche professeur');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des professeurs</h2>
        <button className="btn btn-primary" onClick={openCreateModal}>+ Ajouter un professeur</button>
      </div>

      <div className="card">
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Spécialités</th>
                  <th>Statut</th>
                  <th>Nb classes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeachers.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: '#6B7280' }}>Aucun professeur</td></tr>
                ) : (
                  sortedTeachers.map((teacher) => (
                    <tr key={teacher.id}>
                      <td style={{ fontWeight: 700 }}>{teacher.civility}. {teacher.lastName} {teacher.firstName}</td>
                      <td>{teacher.email}</td>
                      <td>{(teacher.specialties || []).join(', ') || '-'}</td>
                      <td>
                        <span className={`badge ${teacher.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                          {teacher.status === 'ACTIVE' ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td>{teacher._count?.classes || 0}</td>
                      <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button className="btn btn-icon btn-outline" title="Modifier" onClick={() => openEditModal(teacher)}>
                          <FiEdit2 size={16} />
                        </button>
                        <button className="btn btn-icon btn-danger" title="Désactiver" onClick={() => deactivateTeacher(teacher)}>
                          <FiTrash2 size={16} />
                        </button>
                        <button className="btn btn-outline btn-icon-text" onClick={() => openDetails(teacher)}>Fiche</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedTeacher && teacherDetails && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Fiche professeur — {teacherDetails.teacher.lastName} {teacherDetails.teacher.firstName}</h3>
          <p style={{ marginBottom: 10 }}>
            <strong>Email :</strong> {teacherDetails.teacher.email} | <strong>Téléphone :</strong> {teacherDetails.teacher.phone || '-'}
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong>Classes assignées :</strong> {teacherDetails.stats.totalClasses} | <strong>Total élèves :</strong> {teacherDetails.stats.totalStudents}
          </p>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Pôle</th>
                  <th>Niveau</th>
                  <th>Créneau</th>
                  <th>Salle</th>
                  <th>Effectif</th>
                </tr>
              </thead>
              <tbody>
                {teacherDetails.teacher.classes.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', color: '#6B7280' }}>Aucune classe assignée</td></tr>
                ) : (
                  teacherDetails.teacher.classes.map((cls) => (
                    <tr key={cls.id}>
                      <td>{cls.level?.pole?.name || '-'}</td>
                      <td>{cls.level?.name || '-'}</td>
                      <td>{cls.dayOfWeek} {cls.startTime} - {cls.endTime}</td>
                      <td>{cls.roomRef?.name || cls.room || '-'}</td>
                      <td>{cls.enrolledCount}/{cls.capacity}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div style={overlayStyle}>
          <div className="card" style={{ width: 'min(760px, 95vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 12 }}>{editingTeacher ? 'Modifier professeur' : 'Ajouter professeur'}</h3>
            <form onSubmit={saveTeacher} style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Civilité</label>
                  <select className="form-control" value={form.civility} onChange={(e) => setForm((prev) => ({ ...prev, civility: e.target.value }))}>
                    <option value="M">M.</option>
                    <option value="MME">Mme</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nom *</label>
                  <input className="form-control" value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Prénom *</label>
                  <input className="form-control" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Email *</label>
                  <input type="email" className="form-control" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Téléphone</label>
                  <input className="form-control" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Spécialités</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  {SPECIALTIES.map((specialty) => (
                    <label key={specialty} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={form.specialties.includes(specialty)} onChange={() => toggleSpecialty(specialty)} />
                      {specialty}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Statut</label>
                <select className="form-control" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="ACTIVE">Actif</option>
                  <option value="INACTIVE">Inactif</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1200,
};
