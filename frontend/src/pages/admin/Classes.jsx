import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const emptyForm = {
  schoolYearId: '',
  poleId: '',
  levelId: '',
  timeSlotId: '',
  roomId: '',
  teacherId: '',
  capacity: '',
  status: 'OPEN',
};

export default function AdminClasses() {
  const [classes, setClasses] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [poles, setPoles] = useState([]);
  const [levels, setLevels] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [filters, setFilters] = useState({ schoolYearId: '', poleId: '', levelId: '' });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [classesRes, yearsRes, polesRes, levelsRes, slotsRes, roomsRes, teachersRes] = await Promise.all([
        api.get('/admin/classes', { params: filters }),
        api.get('/admin/school-years'),
        api.get('/admin/poles'),
        api.get('/admin/niveaux'),
        api.get('/admin/creneaux'),
        api.get('/admin/salles'),
        api.get('/admin/professeurs'),
      ]);

      setClasses(classesRes.data.classes || []);
      setSchoolYears(yearsRes.data.schoolYears || []);
      setPoles(polesRes.data.poles || []);
      setLevels(levelsRes.data.levels || []);
      setTimeSlots(slotsRes.data.timeSlots || []);
      setRooms(roomsRes.data.rooms || []);
      setTeachers(teachersRes.data.teachers || []);
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger les classes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchData();
  }, [filters.schoolYearId, filters.poleId, filters.levelId]);

  const pageCount = Math.max(1, Math.ceil(classes.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleClasses = classes.slice((currentPage - 1) * 10, currentPage * 10);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const filteredLevelsForForm = useMemo(() => {
    if (!form.poleId) return levels;
    return levels.filter((level) => level.poleId === form.poleId);
  }, [levels, form.poleId]);

  const availableSlotsForForm = useMemo(() => {
    if (!form.roomId) return timeSlots;
    return timeSlots.filter((slot) => slot.roomId === form.roomId);
  }, [timeSlots, form.roomId]);

  const openCreateModal = () => {
    const defaultYear = schoolYears.find((year) => year.isCurrent)?.id || schoolYears[0]?.id || '';
    const defaultPole = poles[0]?.id || '';
    const defaultRoom = rooms[0]?.id || '';

    setEditingClass(null);
    setForm({
      ...emptyForm,
      schoolYearId: defaultYear,
      poleId: defaultPole,
      levelId: levels.find((level) => level.poleId === defaultPole)?.id || '',
      roomId: defaultRoom,
      timeSlotId: timeSlots.find((slot) => slot.roomId === defaultRoom)?.id || '',
      teacherId: teachers[0]?.id || '',
    });
    setModalOpen(true);
  };

  const openEditModal = (cls) => {
    setEditingClass(cls);
    setForm({
      schoolYearId: cls.schoolYearId,
      poleId: cls.poleId || cls.level?.poleId || '',
      levelId: cls.levelId,
      timeSlotId: cls.timeSlotId || '',
      roomId: cls.roomId || '',
      teacherId: cls.teacherId || '',
      capacity: cls.capacity,
      status: cls.status,
    });
    setModalOpen(true);
  };

  const onRoomChange = (roomId) => {
    const firstSlot = timeSlots.find((slot) => slot.roomId === roomId);
    setForm((prev) => ({
      ...prev,
      roomId,
      timeSlotId: firstSlot?.id || '',
      capacity: prev.capacity || rooms.find((room) => room.id === roomId)?.capacity || '',
    }));
  };

  const saveClass = async (event) => {
    event.preventDefault();

    const payload = {
      schoolYearId: form.schoolYearId,
      poleId: form.poleId,
      levelId: form.levelId,
      timeSlotId: form.timeSlotId,
      roomId: form.roomId,
      teacherId: form.teacherId,
      capacity: Number(form.capacity || 0),
      status: form.status,
    };

    if (!payload.schoolYearId || !payload.poleId || !payload.levelId || !payload.timeSlotId || !payload.roomId || !payload.teacherId) {
      toast.error('Veuillez renseigner tous les champs obligatoires');
      return;
    }

    if (payload.capacity <= 0) {
      toast.error('La capacité doit être supérieure à 0');
      return;
    }

    try {
      if (editingClass) {
        await api.put(`/admin/classes/${editingClass.id}`, payload);
        toast.success('Classe mise à jour');
      } else {
        await api.post('/admin/classes', payload);
        toast.success('Classe créée');
      }

      setModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Erreur lors de la sauvegarde');
    }
  };

  const deleteClass = async (cls) => {
    if (!window.confirm('Supprimer cette classe ?')) return;

    try {
      await api.delete(`/admin/classes/${cls.id}`);
      toast.success('Classe supprimée');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Suppression impossible');
    }
  };

  const indicator = (cls) => cls.fillIndicator?.label || '🟢';
  const statusLabel = (status) => {
    const labels = {
      OPEN: 'Ouverte',
      CLOSED: 'Fermée',
      FULL: 'Pleine',
      ACTIVE: 'Active',
      INACTIVE: 'Inactif',
    };
    return labels[status] || status;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des classes</h2>
        <button className="btn btn-primary" onClick={openCreateModal}>+ Créer une classe</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Année scolaire</label>
            <select className="form-control" value={filters.schoolYearId} onChange={(e) => setFilters((prev) => ({ ...prev, schoolYearId: e.target.value }))}>
              <option value="">Toutes</option>
              {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Pôle</label>
            <select className="form-control" value={filters.poleId} onChange={(e) => setFilters((prev) => ({ ...prev, poleId: e.target.value, levelId: '' }))}>
              <option value="">Tous</option>
              {poles.map((pole) => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Niveau</label>
            <select className="form-control" value={filters.levelId} onChange={(e) => setFilters((prev) => ({ ...prev, levelId: e.target.value }))}>
              <option value="">Tous</option>
              {levels.filter((level) => !filters.poleId || level.poleId === filters.poleId).map((level) => (
                <option key={level.id} value={level.id}>{level.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Pôle</th>
                  <th>Niveau</th>
                  <th>Jour</th>
                  <th>Horaire</th>
                  <th>Salle</th>
                  <th>Professeur</th>
                  <th>Effectif</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {classes.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: '#6B7280' }}>Aucune classe</td></tr>
                ) : (
                  visibleClasses.map((cls) => (
                    <tr key={cls.id}>
                      <td>{cls.pole?.name || cls.level?.pole?.name || '-'}</td>
                      <td>{cls.level?.name || '-'}</td>
                      <td>{cls.dayOfWeek}</td>
                      <td>{cls.startTime} - {cls.endTime}</td>
                      <td>{cls.roomRef?.name || cls.room || '-'}</td>
                      <td>{cls.teacher ? `${cls.teacher.firstName} ${cls.teacher.lastName}` : '-'}</td>
                      <td>{indicator(cls)} {cls.enrolledCount}/{cls.capacity}</td>
                      <td><span className={`badge ${cls.status === 'OPEN' ? 'badge-success' : 'badge-warning'}`}>{statusLabel(cls.status)}</span></td>
                      <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Link className="btn btn-outline btn-sm" to={`/admin/classes/${cls.id}`}>Détail</Link>
                        <button className="btn btn-icon btn-outline" title="Modifier" onClick={() => openEditModal(cls)}>
                          <FiEdit2 size={16} />
                        </button>
                        <button className="btn btn-icon btn-danger" title="Supprimer" onClick={() => deleteClass(cls)}>
                          <FiTrash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {classes.length > 0 && pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <button className="btn btn-outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Précédent</button>
            <span style={{ color: '#374151' }}>Page {currentPage} / {pageCount}</span>
            <button className="btn btn-outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Suivant</button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div style={overlayStyle}>
          <div className="card" style={{ width: 'min(780px, 95vw)' }}>
            <h3 style={{ marginBottom: 12 }}>{editingClass ? 'Modifier la classe' : 'Créer une classe'}</h3>
            <form onSubmit={saveClass} style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Année scolaire *</label>
                  <select className="form-control" value={form.schoolYearId} onChange={(e) => setForm((prev) => ({ ...prev, schoolYearId: e.target.value }))}>
                    <option value="">Sélectionner</option>
                    {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Pôle *</label>
                  <select className="form-control" value={form.poleId} onChange={(e) => setForm((prev) => ({ ...prev, poleId: e.target.value, levelId: '' }))}>
                    <option value="">Sélectionner</option>
                    {poles.map((pole) => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Niveau *</label>
                  <select className="form-control" value={form.levelId} onChange={(e) => setForm((prev) => ({ ...prev, levelId: e.target.value }))}>
                    <option value="">Sélectionner</option>
                    {filteredLevelsForForm.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Salle *</label>
                  <select className="form-control" value={form.roomId} onChange={(e) => onRoomChange(e.target.value)}>
                    <option value="">Sélectionner</option>
                    {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Créneau *</label>
                  <select className="form-control" value={form.timeSlotId} onChange={(e) => setForm((prev) => ({ ...prev, timeSlotId: e.target.value }))}>
                    <option value="">Sélectionner</option>
                    {availableSlotsForForm.map((slot) => (
                      <option key={slot.id} value={slot.id}>{slot.dayOfWeek} {slot.startTime}-{slot.endTime}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Professeur *</label>
                  <select className="form-control" value={form.teacherId} onChange={(e) => setForm((prev) => ({ ...prev, teacherId: e.target.value }))}>
                    <option value="">Sélectionner</option>
                    {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.lastName} {teacher.firstName}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Capacité *</label>
                  <input type="number" min="1" className="form-control" value={form.capacity} onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Statut</label>
                  <select className="form-control" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                    <option value="OPEN">Ouverte aux inscriptions</option>
                    <option value="CLOSED">Fermée</option>
                    <option value="FULL">Complète</option>
                  </select>
                </div>
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
