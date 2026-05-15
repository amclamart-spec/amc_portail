import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const emptyLevelForm = {
  id: null,
  poleId: '',
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
};

export default function AdminLevels() {
  const [poles, setPoles] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newPole, setNewPole] = useState({ name: '', description: '', sortOrder: 1 });

  const [modalOpen, setModalOpen] = useState(false);
  const [levelForm, setLevelForm] = useState(emptyLevelForm);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [polesRes, levelsRes] = await Promise.all([
        api.get('/admin/poles'),
        api.get('/admin/niveaux'),
      ]);
      setPoles(polesRes.data.poles || []);
      setLevels(levelsRes.data.levels || []);
    } catch (error) {
      console.error(error);
      toast.error('Erreur chargement pôles/niveaux');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const levelsByPole = useMemo(() => {
    return poles.map((pole) => ({
      ...pole,
      levels: levels.filter((level) => level.poleId === pole.id).sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }, [poles, levels]);

  const createPole = async (event) => {
    event.preventDefault();
    if (!newPole.name.trim()) {
      toast.error('Le nom du pôle est obligatoire');
      return;
    }

    try {
      await api.post('/admin/poles', {
        ...newPole,
        sortOrder: Number(newPole.sortOrder || 0),
      });
      toast.success('Pôle créé');
      setNewPole({ name: '', description: '', sortOrder: 1 });
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Création pôle impossible');
    }
  };

  const deletePole = async (pole) => {
    if (!window.confirm(`Supprimer le pôle ${pole.name} ?`)) return;
    try {
      await api.delete(`/admin/poles/${pole.id}`);
      toast.success('Pôle supprimé');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Suppression impossible');
    }
  };

  const openCreateLevel = (poleId = '') => {
    setLevelForm({ ...emptyLevelForm, poleId: poleId || poles[0]?.id || '' });
    setModalOpen(true);
  };

  const openEditLevel = (level) => {
    setLevelForm({
      id: level.id,
      poleId: level.poleId,
      code: level.code || '',
      name: level.name || '',
      description: level.description || '',
      sortOrder: level.sortOrder || 0,
    });
    setModalOpen(true);
  };

  const saveLevel = async (event) => {
    event.preventDefault();
    if (!levelForm.poleId || !levelForm.name.trim()) {
      toast.error('Pôle et nom du niveau sont requis');
      return;
    }

    try {
      const payload = {
        poleId: levelForm.poleId,
        code: levelForm.code,
        name: levelForm.name,
        description: levelForm.description,
        sortOrder: Number(levelForm.sortOrder || 0),
      };

      if (levelForm.id) {
        await api.put(`/admin/niveaux/${levelForm.id}`, payload);
        toast.success('Niveau mis à jour');
      } else {
        await api.post('/admin/niveaux', payload);
        toast.success('Niveau créé');
      }

      setModalOpen(false);
      setLevelForm(emptyLevelForm);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Sauvegarde du niveau impossible');
    }
  };

  const deleteLevel = async (level) => {
    if (!window.confirm(`Supprimer le niveau ${level.name} ?`)) return;
    try {
      await api.delete(`/admin/niveaux/${level.id}`);
      toast.success('Niveau supprimé');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Suppression impossible');
    }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Gestion des niveaux par pôle</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Créer un pôle</h3>
        <form onSubmit={createPole} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 120px auto', gap: 10, alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Nom</label>
            <input className="form-control" value={newPole.name} onChange={(e) => setNewPole((prev) => ({ ...prev, name: e.target.value }))} placeholder="Arabe / Coran / Sciences islamiques" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Description</label>
            <input className="form-control" value={newPole.description} onChange={(e) => setNewPole((prev) => ({ ...prev, description: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Ordre</label>
            <input type="number" className="form-control" value={newPole.sortOrder} onChange={(e) => setNewPole((prev) => ({ ...prev, sortOrder: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-primary">Ajouter</button>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3>Niveaux d'enseignement</h3>
          <button className="btn btn-primary" onClick={() => openCreateLevel()}>+ Ajouter un niveau</button>
        </div>

        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {levelsByPole.map((pole) => (
              <div key={pole.id} style={{ border: '1px solid var(--amc-border)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: 0 }}>{pole.name}</h4>
                    <p style={{ margin: 0, color: '#6B7280' }}>{pole.description || 'Sans description'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openCreateLevel(pole.id)}>Ajouter niveau</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deletePole(pole)}>Supprimer pôle</button>
                  </div>
                </div>

                <div className="table-container" style={{ marginTop: 10 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Ordre</th>
                        <th>Code</th>
                        <th>Nom</th>
                        <th>Description</th>
                        <th>Classes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pole.levels.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', color: '#6B7280' }}>Aucun niveau</td></tr>
                      ) : (
                        pole.levels.map((level) => (
                          <tr key={level.id}>
                            <td>{level.sortOrder}</td>
                            <td>{level.code}</td>
                            <td>{level.name}</td>
                            <td>{level.description || '-'}</td>
                            <td>{level._count?.classes || 0}</td>
                            <td style={{ display: 'flex', gap: 8 }}>
                              <button className="btn btn-outline btn-sm" onClick={() => openEditLevel(level)}>Modifier</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteLevel(level)}>Supprimer</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div style={overlayStyle}>
          <div className="card" style={{ width: 'min(560px, 95vw)' }}>
            <h3 style={{ marginBottom: 12 }}>{levelForm.id ? 'Modifier niveau' : 'Ajouter niveau'}</h3>
            <form onSubmit={saveLevel} style={{ display: 'grid', gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Pôle *</label>
                <select className="form-control" value={levelForm.poleId} onChange={(e) => setLevelForm((prev) => ({ ...prev, poleId: e.target.value }))}>
                  <option value="">Sélectionner</option>
                  {poles.map((pole) => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Code</label>
                  <input className="form-control" value={levelForm.code} onChange={(e) => setLevelForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="NIV1" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nom *</label>
                  <input className="form-control" value={levelForm.name} onChange={(e) => setLevelForm((prev) => ({ ...prev, name: e.target.value }))} required />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Description</label>
                <input className="form-control" value={levelForm.description} onChange={(e) => setLevelForm((prev) => ({ ...prev, description: e.target.value }))} />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Ordre</label>
                <input type="number" className="form-control" value={levelForm.sortOrder} onChange={(e) => setLevelForm((prev) => ({ ...prev, sortOrder: e.target.value }))} />
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
