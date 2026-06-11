import { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const DAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];

const emptyForm = {
  dayOfWeek: 'MERCREDI',
  startTime: '14:00',
  endTime: '16:00',
  roomId: '',
  poleId: '',
  recurring: true,
};

export default function AdminTimeslots() {
  const [rooms, setRooms] = useState([]);
  const [poles, setPoles] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({ dayOfWeek: '', roomId: '', poleId: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [roomsRes, polesRes, slotsRes] = await Promise.all([
        api.get('/admin/salles'),
        api.get('/admin/poles'),
        api.get('/admin/creneaux', { params: filters }),
      ]);
      setRooms(roomsRes.data.rooms || []);
      setPoles(polesRes.data.poles || []);
      setTimeSlots(slotsRes.data.timeSlots || []);
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger les créneaux');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters.dayOfWeek, filters.roomId, filters.poleId]);

  const groupedByDay = useMemo(() => {
    const grouped = Object.fromEntries(DAYS.map((day) => [day, []]));
    for (const slot of timeSlots) {
      if (!grouped[slot.dayOfWeek]) grouped[slot.dayOfWeek] = [];
      grouped[slot.dayOfWeek].push(slot);
    }
    for (const day of Object.keys(grouped)) {
      grouped[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return grouped;
  }, [timeSlots]);

  const openCreateModal = () => {
    setEditingSlot(null);
    setForm({ ...emptyForm, roomId: rooms[0]?.id || '' });
    setModalOpen(true);
  };

  const openEditModal = (slot) => {
    setEditingSlot(slot);
    setForm({
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomId: slot.roomId,
      poleId: slot.poleId || '',
      recurring: Boolean(slot.recurring),
    });
    setModalOpen(true);
  };

  const saveSlot = async (event) => {
    event.preventDefault();
    if (!form.dayOfWeek || !form.startTime || !form.endTime || !form.roomId) {
      toast.error('Tous les champs obligatoires doivent être renseignés');
      return;
    }

    try {
      if (editingSlot) {
        await api.put(`/admin/creneaux/${editingSlot.id}`, form);
        toast.success('Créneau mis à jour');
      } else {
        await api.post('/admin/creneaux', form);
        toast.success('Créneau créé');
      }
      setModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Erreur sur le créneau');
    }
  };

  const deleteSlot = async (slot) => {
    if (!window.confirm('Supprimer ce créneau ?')) return;
    try {
      await api.delete(`/admin/creneaux/${slot.id}`);
      toast.success('Créneau supprimé');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Suppression impossible');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des créneaux</h2>
        <button className="btn btn-primary" onClick={openCreateModal}>+ Créer un créneau</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Filtrer par jour</label>
            <select className="form-control" value={filters.dayOfWeek} onChange={(e) => setFilters((prev) => ({ ...prev, dayOfWeek: e.target.value }))}>
              <option value="">Tous les jours</option>
              {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Filtrer par salle</label>
            <select className="form-control" value={filters.roomId} onChange={(e) => setFilters((prev) => ({ ...prev, roomId: e.target.value }))}>
              <option value="">Toutes les salles</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Filtrer par pôle</label>
            <select className="form-control" value={filters.poleId} onChange={(e) => setFilters((prev) => ({ ...prev, poleId: e.target.value }))}>
              <option value="">Tous les pôles</option>
              {poles.map((pole) => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Planning hebdomadaire</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(180px, 1fr))', gap: 10, overflowX: 'auto' }}>
            {DAYS.map((day) => (
              <div key={day} style={{ border: '1px solid var(--amc-border)', borderRadius: 10, minHeight: 160, padding: 10 }}>
                <h4 style={{ marginBottom: 10, color: 'var(--amc-primary)' }}>{day}</h4>
                {(groupedByDay[day] || []).length === 0 ? (
                  <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun créneau</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {groupedByDay[day].map((slot) => (
                      <div key={slot.id} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 8 }}>
                        <div style={{ fontWeight: 700 }}>{slot.startTime} - {slot.endTime}</div>
                        <div style={{ fontSize: 13 }}>{slot.room?.name}</div>
                        {slot.pole?.name && <div style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>{slot.pole.name}</div>}
                        <div style={{ fontSize: 12, color: '#6B7280' }}>{slot.recurring ? 'Chaque semaine' : 'Ponctuel'}</div>
                        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                          <button className="btn btn-icon btn-outline" title="Modifier" onClick={() => openEditModal(slot)}>
                            <FiEdit2 size={16} />
                          </button>
                          <button className="btn btn-icon btn-danger" title="Supprimer" onClick={() => deleteSlot(slot)}>
                            <FiTrash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div style={overlayStyle}>
          <div className="card" style={{ width: 'min(520px, 95vw)' }}>
            <h3 style={{ marginBottom: 12 }}>{editingSlot ? 'Modifier un créneau' : 'Créer un créneau'}</h3>
            <form onSubmit={saveSlot} style={{ display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Jour *</label>
                <select className="form-control" value={form.dayOfWeek} onChange={(e) => setForm((prev) => ({ ...prev, dayOfWeek: e.target.value }))}>
                  {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Heure début *</label>
                  <input type="time" className="form-control" value={form.startTime} onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Heure fin *</label>
                  <input type="time" className="form-control" value={form.endTime} onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Salle *</label>
                <select className="form-control" value={form.roomId} onChange={(e) => setForm((prev) => ({ ...prev, roomId: e.target.value }))}>
                  <option value="">Sélectionner</option>
                  {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Pôle</label>
                <select className="form-control" value={form.poleId} onChange={(e) => setForm((prev) => ({ ...prev, poleId: e.target.value }))}>
                  <option value="">— Aucun pôle —</option>
                  {poles.map((pole) => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.recurring} onChange={(e) => setForm((prev) => ({ ...prev, recurring: e.target.checked }))} />
                Chaque semaine
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">{editingSlot ? 'Enregistrer' : 'Créer'}</button>
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
