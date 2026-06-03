import { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const EQUIPMENT_OPTIONS = ['Tableau blanc', 'Vidéoprojecteur', 'Système audio', 'Ordinateur'];

const emptyForm = {
  name: '',
  capacity: 20,
  equipments: [],
  location: '',
  status: 'ACTIVE',
};

export default function AdminRooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [roomSearch, setRoomSearch] = useState('');
  const [roomStatusFilter, setRoomStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const sortedRooms = useMemo(() => [...rooms].sort((a, b) => a.name.localeCompare(b.name)), [rooms]);
  const filteredRooms = useMemo(() => {
    const search = roomSearch.trim().toLowerCase();
    return sortedRooms.filter((room) => {
      const title = (room.name || '').toLowerCase();
      const location = (room.location || '').toLowerCase();
      const equipments = (room.equipments || []).join(' ').toLowerCase();
      const matchesSearch = !search || title.includes(search) || location.includes(search) || equipments.includes(search);
      const matchesStatus = !roomStatusFilter || room.status === roomStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sortedRooms, roomSearch, roomStatusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRooms.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleRooms = filteredRooms.slice((currentPage - 1) * 10, currentPage * 10);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  useEffect(() => {
    setPage(1);
  }, [roomSearch, roomStatusFilter]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/salles');
      setRooms(data.rooms || []);
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger les salles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const openCreateModal = () => {
    setEditingRoom(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (room) => {
    setEditingRoom(room);
    setForm({
      name: room.name || '',
      capacity: room.capacity || 20,
      equipments: room.equipments || [],
      location: room.location || '',
      status: room.status || 'ACTIVE',
    });
    setModalOpen(true);
  };

  const toggleEquipment = (equipment) => {
    setForm((prev) => ({
      ...prev,
      equipments: prev.equipments.includes(equipment)
        ? prev.equipments.filter((item) => item !== equipment)
        : [...prev.equipments, equipment],
    }));
  };

  const saveRoom = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error('Le nom de la salle est obligatoire');
      return;
    }

    if (!Number(form.capacity) || Number(form.capacity) <= 0) {
      toast.error('La capacité doit être supérieure à 0');
      return;
    }

    try {
      if (editingRoom) {
        await api.put(`/admin/salles/${editingRoom.id}`, {
          ...form,
          capacity: Number(form.capacity),
        });
        toast.success('Salle mise à jour');
      } else {
        await api.post('/admin/salles', {
          ...form,
          capacity: Number(form.capacity),
        });
        toast.success('Salle créée');
      }

      setModalOpen(false);
      setForm(emptyForm);
      setEditingRoom(null);
      fetchRooms();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (room) => {
    const ok = window.confirm(`Supprimer la salle « ${room.name} » ?`);
    if (!ok) return;

    try {
      await api.delete(`/admin/salles/${room.id}`);
      toast.success('Salle supprimée');
      fetchRooms();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Suppression impossible');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des salles</h2>
        <button className="btn btn-primary" onClick={openCreateModal}>+ Ajouter une salle</button>
      </div>

      <div className="card">
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 220px', minWidth: 220, maxWidth: 300 }}>
                <label style={{ display: 'block', marginBottom: 6, color: '#374151' }}>Recherche</label>
                <input
                  className="form-control"
                  type="search"
                  placeholder="Nom, localisation ou équipements"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                />
              </div>
              <div style={{ width: 150, minWidth: 150 }}>
                <label style={{ display: 'block', marginBottom: 6, color: '#374151' }}>Statut</label>
                <select
                  className="form-control"
                  value={roomStatusFilter}
                  onChange={(e) => setRoomStatusFilter(e.target.value)}
                >
                  <option value="">Tous</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Capacité</th>
                    <th>Équipements</th>
                    <th>Localisation</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRooms.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: '#6B7280' }}>Aucune salle</td>
                    </tr>
                  ) : (
                    visibleRooms.map((room) => (
                      <tr key={room.id}>
                        <td style={{ fontWeight: 700 }}>{room.name}</td>
                        <td>{room.capacity}</td>
                        <td>{(room.equipments || []).length ? room.equipments.join(', ') : '-'}</td>
                        <td>{room.location || '-'}</td>
                        <td>
                          <span className={`badge ${room.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                            {room.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-icon btn-outline" title="Modifier" onClick={() => openEditModal(room)}>
                            <FiEdit2 size={16} />
                          </button>
                          <button className="btn btn-icon btn-danger" title="Supprimer" onClick={() => handleDelete(room)}>
                            <FiTrash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {sortedRooms.length > 0 && pageCount > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <button className="btn btn-outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Précédent</button>
                <span style={{ color: '#374151' }}>Page {currentPage} / {pageCount}</span>
                <button className="btn btn-outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Suivant</button>
              </div>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <div style={overlayStyle}>
          <div className="card" style={{ width: 'min(680px, 95vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 12 }}>{editingRoom ? 'Modifier la salle' : 'Ajouter une salle'}</h3>
            <form onSubmit={saveRoom} style={{ display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom de la salle *</label>
                <input className="form-control" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Capacité maximale *</label>
                <input type="number" min="1" className="form-control" value={form.capacity} onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))} required />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Équipements</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  {EQUIPMENT_OPTIONS.map((equipment) => (
                    <label key={equipment} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.equipments.includes(equipment)} onChange={() => toggleEquipment(equipment)} />
                      {equipment}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Localisation</label>
                <input className="form-control" value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} placeholder="Bâtiment / étage" />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Statut</label>
                <select className="form-control" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
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
