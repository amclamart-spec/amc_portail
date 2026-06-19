import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const emptyForm = {
  schoolYearId: '',
  poleId: '',
  levelId: '',
  timeSlotIds: [],
  teacherId: '',
  capacity: '',
  status: 'OPEN',
  validFrom: '',
  validTo: '',
  applyEnrollmentFee: true,
  examPreparation: false,
};

function slotLabel(slot) {
  return `${slot.dayOfWeek} ${slot.startTime}-${slot.endTime}${slot.room ? ` (${slot.room.name})` : ''}`;
}

function classSlotsSummary(cls) {
  const slots = cls.classTimeSlots?.map((cts) => cts.timeSlot) || [];
  if (slots.length === 0) {
    return cls.dayOfWeek ? `${cls.dayOfWeek} ${cls.startTime}-${cls.endTime}` : '-';
  }
  return slots.map((s) => `${s.dayOfWeek} ${s.startTime}-${s.endTime}`).join(', ');
}

export default function AdminClasses() {
  const [classes, setClasses] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [poles, setPoles] = useState([]);
  const [levels, setLevels] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [filters, setFilters] = useState({ schoolYearId: '', poleId: '', levelId: '' });

  const [waitlistModalOpen, setWaitlistModalOpen] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistClass, setWaitlistClass] = useState(null);
  const [waitlistStudents, setWaitlistStudents] = useState([]);
  const [waitlistPage, setWaitlistPage] = useState(1);
  const WAITLIST_PER_PAGE = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [classesRes, yearsRes, polesRes, levelsRes, slotsRes, teachersRes] = await Promise.all([
        api.get('/admin/classes', { params: filters }),
        api.get('/admin/school-years'),
        api.get('/admin/poles'),
        api.get('/admin/niveaux'),
        api.get('/admin/creneaux'),
        api.get('/admin/professeurs'),
      ]);

      setClasses(classesRes.data.classes || []);
      setSchoolYears(yearsRes.data.schoolYears || []);
      setPoles(polesRes.data.poles || []);
      setLevels(levelsRes.data.levels || []);
      setTimeSlots(slotsRes.data.timeSlots || []);
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
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const filteredLevelsForForm = useMemo(() => {
    if (!form.poleId) return levels;
    return levels.filter((level) => level.poleId === form.poleId);
  }, [levels, form.poleId]);

  // Group time slots by day, filtered by selected pole
  const slotsByDay = useMemo(() => {
    const days = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
    const slotsForPole = form.poleId
      ? timeSlots.filter((s) => s.poleId === form.poleId)
      : timeSlots;
    return days
      .map((day) => ({ day, slots: slotsForPole.filter((s) => s.dayOfWeek === day) }))
      .filter((g) => g.slots.length > 0);
  }, [timeSlots, form.poleId]);

  const toggleSlot = (slotId) => {
    setForm((prev) => {
      const already = prev.timeSlotIds.includes(slotId);
      return {
        ...prev,
        timeSlotIds: already
          ? prev.timeSlotIds.filter((id) => id !== slotId)
          : [...prev.timeSlotIds, slotId],
      };
    });
  };

  const openCreateModal = () => {
    const defaultYearObj = schoolYears.find((year) => year.isCurrent) || schoolYears[0];
    const defaultYear = defaultYearObj?.id || '';
    const defaultPole = poles[0]?.id || '';
    setEditingClass(null);
    setForm({
      ...emptyForm,
      schoolYearId: defaultYear,
      poleId: defaultPole,
      levelId: levels.find((level) => level.poleId === defaultPole)?.id || '',
      teacherId: teachers[0]?.id || '',
      validFrom: defaultYearObj?.startDate ? new Date(defaultYearObj.startDate).toISOString().slice(0, 10) : '',
      validTo: defaultYearObj?.endDate ? new Date(defaultYearObj.endDate).toISOString().slice(0, 10) : '',
    });
    setModalOpen(true);
  };

  const openEditModal = (cls) => {
    setEditingClass(cls);
    const slotIds = cls.classTimeSlots?.length > 0
      ? cls.classTimeSlots.map((cts) => cts.timeSlotId)
      : (cls.timeSlotId ? [cls.timeSlotId] : []);
    const yearObj = schoolYears.find((y) => y.id === cls.schoolYearId);
    setForm({
      schoolYearId: cls.schoolYearId,
      poleId: cls.poleId || cls.level?.poleId || '',
      levelId: cls.levelId,
      timeSlotIds: slotIds,
      teacherId: cls.teacherId || '',
      capacity: cls.capacity,
      status: cls.status,
      validFrom: cls.validFrom ? new Date(cls.validFrom).toISOString().slice(0, 10) : (yearObj?.startDate ? new Date(yearObj.startDate).toISOString().slice(0, 10) : ''),
      validTo: cls.validTo ? new Date(cls.validTo).toISOString().slice(0, 10) : (yearObj?.endDate ? new Date(yearObj.endDate).toISOString().slice(0, 10) : ''),
      applyEnrollmentFee: cls.applyEnrollmentFee !== false,
      examPreparation: cls.examPreparation ?? false,
    });
    setModalOpen(true);
  };

  const saveClass = async (event) => {
    event.preventDefault();

    const payload = {
      schoolYearId: form.schoolYearId,
      poleId: form.poleId,
      levelId: form.levelId,
      timeSlotIds: form.timeSlotIds,
      teacherId: form.teacherId,
      capacity: Number(form.capacity || 0),
      status: form.status,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      applyEnrollmentFee: form.applyEnrollmentFee !== false,
      examPreparation: form.examPreparation === true,
    };

    if (!payload.schoolYearId || !payload.poleId || !payload.levelId || payload.timeSlotIds.length === 0 || !payload.teacherId) {
      toast.error('Veuillez sélectionner au moins un créneau et renseigner tous les champs obligatoires');
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

  const openWaitlistModal = async (cls) => {
    setWaitlistModalOpen(true);
    setWaitlistLoading(true);
    setWaitlistClass(cls);
    setWaitlistStudents([]);
    setWaitlistPage(1);

    try {
      const { data } = await api.get(`/admin/classes/${cls.id}/waitlist`);
      const sorted = (data.waitlist || [])
        .slice()
        .sort((a, b) => {
          const aOrder = a.waitlistOrder == null ? Number.MAX_SAFE_INTEGER : Number(a.waitlistOrder);
          const bOrder = b.waitlistOrder == null ? Number.MAX_SAFE_INTEGER : Number(b.waitlistOrder);
          return aOrder - bOrder;
        });
      setWaitlistStudents(sorted);
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || "Impossible de charger la liste d'attente");
      setWaitlistModalOpen(false);
      setWaitlistClass(null);
    } finally {
      setWaitlistLoading(false);
    }
  };

  const indicator = (cls) => cls.fillIndicator?.label || '🟢';
  const waitlistPageCount = Math.max(1, Math.ceil(waitlistStudents.length / WAITLIST_PER_PAGE));
  const currentWaitlistPage = Math.min(waitlistPage, waitlistPageCount);
  const visibleWaitlistStudents = waitlistStudents.slice((currentWaitlistPage - 1) * WAITLIST_PER_PAGE, currentWaitlistPage * WAITLIST_PER_PAGE);

  const statusLabel = (status) => {
    const labels = { OPEN: 'Ouverte', CLOSED: 'Fermée', FULL: 'Pleine', ACTIVE: 'Active', INACTIVE: 'Inactif' };
    return labels[status] || status;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des classes</h2>
        <button className="btn btn-primary" onClick={openCreateModal}>+ Créer une classe</button>
      </div>

      {/* Filtres */}
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

      {/* Grille */}
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
                  <th>Créneaux</th>
                  <th>Salle(s)</th>
                  <th>Professeur</th>
                  <th>Effectif</th>
                  <th>Statut</th>
                  <th>Validité</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {classes.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: '#6B7280' }}>Aucune classe</td></tr>
                ) : (
                  visibleClasses.map((cls) => {
                    const slots = cls.classTimeSlots?.map((cts) => cts.timeSlot) || [];
                    const rooms = [...new Set(slots.map((s) => s.room?.name).filter(Boolean))];
                    return (
                      <tr key={cls.id}>
                        <td>{cls.pole?.name || cls.level?.pole?.name || '-'}</td>
                        <td>{cls.level?.name || '-'}</td>
                        <td>
                          {slots.length > 0
                            ? slots.map((s, i) => (
                                <div key={i} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                  {s.dayOfWeek} {s.startTime}-{s.endTime}
                                </div>
                              ))
                            : <span style={{ fontSize: 12 }}>{cls.dayOfWeek} {cls.startTime}-{cls.endTime}</span>
                          }
                        </td>
                        <td style={{ fontSize: 12 }}>{rooms.length > 0 ? rooms.join(', ') : (cls.roomRef?.name || cls.room || '-')}</td>
                        <td>{cls.teacher ? `${cls.teacher.firstName} ${cls.teacher.lastName}` : '-'}</td>
                        <td>{indicator(cls)} {cls.enrolledCount}/{cls.capacity}</td>
                        <td><span className={`badge ${cls.status === 'OPEN' ? 'badge-success' : 'badge-warning'}`}>{statusLabel(cls.status)}</span></td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {cls.validFrom ? new Date(cls.validFrom).toLocaleDateString('fr-FR') : '—'}
                          {' → '}
                          {cls.validTo ? new Date(cls.validTo).toLocaleDateString('fr-FR') : '—'}
                        </td>
                        <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Link className="btn btn-outline btn-sm" to={`/admin/classes/${cls.id}`}>Détail</Link>
                          {Number(cls.enrolledCount || 0) > Number(cls.capacity || 0) && (
                            <button className="btn btn-outline btn-sm" onClick={() => openWaitlistModal(cls)}>Liste d'attente</button>
                          )}
                          <button className="btn btn-icon btn-outline" title="Modifier" onClick={() => openEditModal(cls)}>
                            <FiEdit2 size={16} />
                          </button>
                          <button className="btn btn-icon btn-danger" title="Supprimer" onClick={() => deleteClass(cls)}>
                            <FiTrash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
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

      {/* Modale liste d'attente */}
      {waitlistModalOpen && (
        <div style={overlayStyle}>
          <div className="card" style={{ width: 900, maxWidth: '95vw', height: 620, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: 12 }}>
              Liste d'attente — {waitlistClass?.level?.pole?.name || waitlistClass?.pole?.name || '-'} / {waitlistClass?.level?.name || '-'}
            </h3>
            {waitlistLoading ? <p>Chargement...</p> : (
              <>
                <div style={{ marginBottom: 10, color: '#374151', fontWeight: 600 }}>
                  Nombre de personnes en liste d'attente : {waitlistStudents.length}
                </div>
                {waitlistStudents.length === 0 ? (
                  <p style={{ color: '#6B7280' }}>Aucun élève en liste d'attente</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div className="table-container" style={{ flex: 1, overflow: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Ordre</th>
                            <th>Nom</th>
                            <th>Date de demande</th>
                            <th>Coordonnées famille</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleWaitlistStudents.map((student) => (
                            <tr key={student.id}>
                              <td>{student.waitlistOrder}</td>
                              <td>{student.studentLastName} {student.studentFirstName}</td>
                              <td>{new Date(student.createdAt).toLocaleDateString('fr-FR')}</td>
                              <td>{student.familyEmail || '-'} / {student.familyPhone || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {waitlistStudents.length > WAITLIST_PER_PAGE && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <button className="btn btn-outline" disabled={currentWaitlistPage <= 1} onClick={() => setWaitlistPage((p) => Math.max(1, p - 1))}>Précédent</button>
                        <span style={{ color: '#374151' }}>Page {currentWaitlistPage} / {waitlistPageCount}</span>
                        <button className="btn btn-outline" disabled={currentWaitlistPage >= waitlistPageCount} onClick={() => setWaitlistPage((p) => Math.min(waitlistPageCount, p + 1))}>Suivant</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setWaitlistModalOpen(false); setWaitlistClass(null); setWaitlistStudents([]); setWaitlistPage(1); }}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modale création/modification */}
      {modalOpen && (
        <div style={overlayStyle}>
          <div className="card" style={{ width: 'min(820px, 95vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 12 }}>{editingClass ? 'Modifier la classe' : 'Créer une classe'}</h3>
            <form onSubmit={saveClass} style={{ display: 'grid', gap: 12 }}>

              {/* Ligne 1 : Année / Pôle / Niveau */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Année scolaire *</label>
                  <select
                    className="form-control"
                    value={form.schoolYearId}
                    onChange={(e) => {
                      const yr = schoolYears.find((y) => y.id === e.target.value);
                      setForm((p) => ({
                        ...p,
                        schoolYearId: e.target.value,
                        validFrom: yr?.startDate ? new Date(yr.startDate).toISOString().slice(0, 10) : p.validFrom,
                        validTo: yr?.endDate ? new Date(yr.endDate).toISOString().slice(0, 10) : p.validTo,
                      }));
                    }}
                  >
                    <option value="">Sélectionner</option>
                    {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Pôle *</label>
                  <select className="form-control" value={form.poleId} onChange={(e) => setForm((p) => ({ ...p, poleId: e.target.value, levelId: '', timeSlotIds: [] }))}>
                    <option value="">Sélectionner</option>
                    {poles.map((pole) => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Niveau *</label>
                  <select className="form-control" value={form.levelId} onChange={(e) => setForm((p) => ({ ...p, levelId: e.target.value }))}>
                    <option value="">Sélectionner</option>
                    {filteredLevelsForForm.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Ligne 2 : Professeur / Capacité / Statut */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Professeur *</label>
                  <select className="form-control" value={form.teacherId} onChange={(e) => setForm((p) => ({ ...p, teacherId: e.target.value }))}>
                    <option value="">Sélectionner</option>
                    {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.lastName} {teacher.firstName}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Capacité *</label>
                  <input type="number" min="1" className="form-control" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Statut</label>
                  <select className="form-control" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                    <option value="OPEN">Ouverte aux inscriptions</option>
                    <option value="CLOSED">Fermée</option>
                    <option value="FULL">Complète</option>
                  </select>
                </div>
              </div>

              {/* Sélection multi-créneaux */}
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ marginBottom: 6, display: 'block' }}>
                  Créneaux * <span style={{ fontWeight: 400, color: '#6B7280', fontSize: 12 }}>({form.timeSlotIds.length} sélectionné{form.timeSlotIds.length > 1 ? 's' : ''})</span>
                </label>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, maxHeight: 260, overflowY: 'auto', background: '#F9FAFB' }}>
                  {slotsByDay.length === 0 ? (
                    <p style={{ color: '#6B7280', margin: 0 }}>Aucun créneau disponible</p>
                  ) : slotsByDay.map(({ day, slots }) => (
                    <div key={day} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{day}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {slots.map((slot) => {
                          const selected = form.timeSlotIds.includes(slot.id);
                          return (
                            <label
                              key={slot.id}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
                                border: `1px solid ${selected ? '#2563EB' : '#D1D5DB'}`,
                                background: selected ? '#EFF6FF' : '#FFFFFF',
                                color: selected ? '#1D4ED8' : '#374151',
                                fontWeight: selected ? 700 : 400,
                                transition: 'all 0.15s',
                              }}
                            >
                              <input
                                type="checkbox"
                                style={{ display: 'none' }}
                                checked={selected}
                                onChange={() => toggleSlot(slot.id)}
                              />
                              {slot.startTime}-{slot.endTime}
                              {slot.room?.name ? <span style={{ color: '#6B7280', fontWeight: 400 }}> · {slot.room.name}</span> : null}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Frais d'inscription */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.applyEnrollmentFee !== false}
                    onChange={(e) => setForm((p) => ({ ...p, applyEnrollmentFee: e.target.checked }))}
                  />
                  Appliquer frais d'inscription
                  <span style={{ fontWeight: 400, color: '#6B7280', fontSize: 12 }}>
                    (décocher = pas de frais d'inscription pour cette classe)
                  </span>
                </label>
              </div>

              {/* Préparation examen — soutien scolaire uniquement */}
              {String(poles.find((p) => p.id === form.poleId)?.name || '').toLowerCase().includes('soutien') && (
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.examPreparation === true}
                      onChange={(e) => setForm((p) => ({ ...p, examPreparation: e.target.checked }))}
                    />
                    Préparation examen
                    <span style={{ fontWeight: 400, color: '#6B7280', fontSize: 12 }}>
                      (classe dédiée à la préparation du brevet / bac)
                    </span>
                  </label>
                </div>
              )}

              {/* Période de validité */}
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                  Période de validité{' '}
                  <span style={{ fontWeight: 400, color: '#6B7280', fontSize: 12 }}>(laisser vide = toute l'année scolaire)</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Du</label>
                    <input type="date" className="form-control" value={form.validFrom} onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Au</label>
                    <input type="date" className="form-control" value={form.validTo} onChange={(e) => setForm((p) => ({ ...p, validTo: e.target.value }))} />
                  </div>
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
