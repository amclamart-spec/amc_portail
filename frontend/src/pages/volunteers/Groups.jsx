import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiUsers } from 'react-icons/fi';

const EMPTY = { name: '', description: '' };

export default function VolunteerGroups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [membersModal, setMembersModal] = useState(null); // group being edited
  const [allVolunteers, setAllVolunteers] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [membersSaving, setMembersSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/volunteers/groups');
      setGroups(data.groups || []);
    } catch { toast.error('Impossible de charger les groupes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setEditId(null); setModal(true); };
  const openEdit = (g) => { setForm({ name: g.name, description: g.description || '' }); setEditId(g.id); setModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nom du groupe requis'); return; }
    setSaving(true);
    try {
      if (editId) await api.put(`/volunteers/groups/${editId}`, form);
      else await api.post('/volunteers/groups', form);
      toast.success(editId ? 'Groupe modifié' : 'Groupe créé');
      setModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/volunteers/groups/${id}`);
      toast.success('Groupe supprimé');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const openMembers = async (group) => {
    setMembersModal(group);
    try {
      const [{ data: allData }, { data: membersData }] = await Promise.all([
        api.get('/volunteers', { params: { limit: 200 } }),
        api.get(`/volunteers/groups/${group.id}/members`),
      ]);
      setAllVolunteers(allData.volunteers || []);
      setSelectedMemberIds((membersData.members || []).map((m) => m.id));
    } catch {
      toast.error('Impossible de charger les bénévoles');
    }
  };

  const toggleMember = (id) => {
    setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSaveMembers = async () => {
    setMembersSaving(true);
    try {
      await api.put(`/volunteers/groups/${membersModal.id}/members`, { volunteerIds: selectedMemberIds });
      toast.success('Membres du groupe mis à jour');
      setMembersModal(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setMembersSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Groupes de bénévoles</h2>
        <button className="btn btn-primary" onClick={openCreate}><FiPlus size={14} /> Nouveau groupe</button>
      </div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Organisez vos bénévoles en groupes (un bénévole peut appartenir à plusieurs groupes) afin de cibler la diffusion des événements.
      </p>

      <div className="card">
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Nom</th><th>Description</th><th>Membres</th><th>Actions</th></tr></thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun groupe</td></tr>
                ) : groups.map((g) => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 600 }}>{g.name}</td>
                    <td>{g.description || '—'}</td>
                    <td>{g.memberCount}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => openMembers(g)}><FiUsers size={12} /> Membres</button>
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(g)}><FiEdit2 size={12} /></button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(g.id)}><FiTrash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal création/édition groupe */}
      {modal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>{editId ? 'Modifier le groupe' : 'Nouveau groupe'}</h3><button className="btn btn-outline btn-sm" onClick={() => setModal(false)}>Fermer</button></div>
            <form onSubmit={handleSave} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input className="form-control" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Description</label>
                <textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal gestion des membres */}
      {membersModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 480 }}>
            <div className="card-header"><h3>Membres — {membersModal.name}</h3><button className="btn btn-outline btn-sm" onClick={() => setMembersModal(null)}>Fermer</button></div>
            <div style={{ padding: 16 }}>
              {allVolunteers.length === 0 ? (
                <p style={{ color: '#6B7280', textAlign: 'center' }}>Aucun bénévole actif</p>
              ) : (
                <div style={{ display: 'grid', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
                  {allVolunteers.map((v) => (
                    <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedMemberIds.includes(v.id)} onChange={() => toggleMember(v.id)} />
                      <span>{v.lastName} {v.firstName}</span>
                      <span style={{ marginLeft: 'auto', color: '#94A3B8', fontSize: 12 }}>{v.email}</span>
                    </label>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={() => setMembersModal(null)}>Annuler</button>
                <button type="button" className="btn btn-primary" onClick={handleSaveMembers} disabled={membersSaving}>{membersSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
