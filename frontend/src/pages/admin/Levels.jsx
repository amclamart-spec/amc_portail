import { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiTrash2, FiPlus } from 'react-icons/fi';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const CURSUS_OPTIONS = [
  { value: 'primaire', label: 'Primaire' },
  { value: 'college', label: 'Collège' },
  { value: 'lycee', label: 'Lycée' },
];

const isSoutienPoleName = (name) => String(name || '').toLowerCase().includes('soutien');

const emptyLevelForm = {
  id: null,
  poleId: '',
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  minAge: '',
  maxAge: '',
  cursus: '',
};

export default function AdminLevels() {
  const [poles, setPoles] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);

  const PERIOD_OPTIONS = [
    { value: 'ANNUEL',      label: 'Annuel' },
    { value: 'SEMESTRIEL',  label: 'Semestriel' },
    { value: 'TRIMESTRIEL', label: 'Trimestriel' },
    { value: 'MENSUEL',     label: 'Mensuel' },
  ];
  const periodLabel = (p) => PERIOD_OPTIONS.find((o) => o.value === p)?.label || p || 'Annuel';

  const [newPole, setNewPole] = useState({ name: '', description: '', sortOrder: 1, period: 'ANNUEL' });

  const [modalOpen, setModalOpen] = useState(false);
  const [levelForm, setLevelForm] = useState(emptyLevelForm);
  const [poleFilters, setPoleFilters] = useState({});

  const getPolePagination = (poleId, levels) => {
    const { query = '', page = 1 } = poleFilters[poleId] || {};
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const filteredLevels = normalizedQuery
      ? levels.filter((level) => String(level.name || '').toLowerCase().includes(normalizedQuery))
      : levels;
    const pageCount = Math.max(1, Math.ceil(filteredLevels.length / 10));
    const currentPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
    const pageLevels = filteredLevels.slice((currentPage - 1) * 10, currentPage * 10);
    return { filteredLevels, pageLevels, pageCount, currentPage };
  };

  const updatePoleFilter = (poleId, partial) => {
    setPoleFilters((prev) => ({
      ...prev,
      [poleId]: {
        ...(prev[poleId] || { page: 1, query: '' }),
        ...partial,
      },
    }));
  };

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
      setNewPole({ name: '', description: '', sortOrder: 1, period: 'ANNUEL' });
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Création pôle impossible');
    }
  };

  const cleanupFictiveLevels = async () => {
    if (!window.confirm('Supprimer tous les niveaux fictifs (code FICTIF_…) ? Les inscriptions concernées seront déplacées vers la classe fictive globale.')) return;
    try {
      const { data } = await api.delete('/admin/niveaux/fictifs');
      toast.success(data.message || 'Niveaux fictifs supprimés');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Erreur suppression niveaux fictifs');
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
      minAge: level.minAge || '',
      maxAge: level.maxAge || '',
      cursus: level.cursus || '',
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
        minAge: levelForm.minAge ? Number(levelForm.minAge) : null,
        maxAge: levelForm.maxAge ? Number(levelForm.maxAge) : null,
        cursus: levelForm.cursus || null,
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

  const togglePoleBlocking = async (poleId, field, value) => {
    setPoles((prev) => prev.map((p) => (p.id === poleId ? { ...p, [field]: value } : p)));
    try {
      await api.put(`/admin/poles/${poleId}`, { [field]: value });
    } catch (error) {
      console.error(error);
      toast.error('Mise à jour impossible');
      fetchData();
    }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Gestion des niveaux par pôle</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Créer un pôle</h3>
        <form onSubmit={createPole} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 160px 100px auto', gap: 10, alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Nom</label>
            <input className="form-control" value={newPole.name} onChange={(e) => setNewPole((prev) => ({ ...prev, name: e.target.value }))} placeholder="Arabe / Coran / Sciences islamiques" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Description</label>
            <input className="form-control" value={newPole.description} onChange={(e) => setNewPole((prev) => ({ ...prev, description: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Période des notes</label>
            <select className="form-control" value={newPole.period} onChange={(e) => setNewPole((prev) => ({ ...prev, period: e.target.value }))}>
              {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger btn-sm" onClick={cleanupFictiveLevels}>Supprimer niveaux fictifs</button>
            <button className="btn btn-primary" onClick={() => openCreateLevel()}>+ Ajouter un niveau</button>
          </div>
        </div>

        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {levelsByPole.map((pole) => (
              <div key={pole.id} style={{ border: '1px solid var(--amc-border)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0 }}>{pole.name}</h4>
                      <select
                        className="form-control"
                        value={pole.period || 'ANNUEL'}
                        onChange={(e) => togglePoleBlocking(pole.id, 'period', e.target.value)}
                        style={{ width: 'auto', fontSize: 12, padding: '2px 6px', height: 28 }}
                        title="Période des notes pour ce pôle"
                      >
                        {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <p style={{ margin: '2px 0 0', color: '#6B7280' }}>{pole.description || 'Sans description'}</p>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: pole.blockReenrollments ? '#B91C1C' : '#374151', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={pole.blockReenrollments || false}
                          onChange={(e) => togglePoleBlocking(pole.id, 'blockReenrollments', e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        Bloquer les ré-inscriptions
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: pole.blockNewEnrollments ? '#B91C1C' : '#374151', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={pole.blockNewEnrollments || false}
                          onChange={(e) => togglePoleBlocking(pole.id, 'blockNewEnrollments', e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        Bloquer les nouvelles inscriptions
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-icon btn-outline" title="Ajouter un niveau" onClick={() => openCreateLevel(pole.id)}>
                    <FiPlus size={16} />
                  </button>
                    <button className="btn btn-icon btn-danger" title="Supprimer le pôle" onClick={() => deletePole(pole)}>
                      <FiTrash2 size={16} />
                    </button>
                  </div>
                </div>

                {(() => {
                  const { filteredLevels, pageLevels, pageCount, currentPage } = getPolePagination(pole.id, pole.levels);
                  const queryValue = poleFilters[pole.id]?.query || '';

                  return (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ flex: '0 1 240px', minWidth: 180 }}>
                          <input
                            className="form-control"
                            placeholder="Filtrer par nom de niveau"
                            value={queryValue}
                            onChange={(event) => updatePoleFilter(pole.id, { query: event.target.value, page: 1 })}
                          />
                        </div>
                        <div style={{ minWidth: 140, textAlign: 'right', color: '#374151' }}>
                          {filteredLevels.length} niveau{filteredLevels.length > 1 ? 's' : ''}
                        </div>
                      </div>

                      <div className="table-container" style={{ marginTop: 0 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Ordre</th>
                              <th>Code</th>
                              <th>Nom</th>
                              <th>Description</th>
                              <th>Âge Min</th>
                              <th>Âge Max</th>
                              {isSoutienPoleName(pole.name) && <th>Cursus</th>}
                              <th>Classes</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageLevels.length === 0 ? (
                              <tr><td colSpan={isSoutienPoleName(pole.name) ? 9 : 8} style={{ textAlign: 'center', color: '#6B7280' }}>Aucun niveau</td></tr>
                            ) : (
                              pageLevels.map((level) => (
                                <tr key={level.id}>
                                  <td>{level.sortOrder}</td>
                                  <td>{level.code}</td>
                                  <td>{level.name}</td>
                                  <td>{level.description || '-'}</td>
                                  <td>{level.minAge || '-'}</td>
                                  <td>{level.maxAge || '-'}</td>
                                  {isSoutienPoleName(pole.name) && (
                                    <td>{CURSUS_OPTIONS.find((o) => o.value === level.cursus)?.label || '-'}</td>
                                  )}
                                  <td>{level._count?.classes || 0}</td>
                                  <td style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-icon btn-outline" title="Modifier" onClick={() => openEditLevel(level)}>
                                      <FiEdit2 size={16} />
                                    </button>
                                    <button className="btn btn-icon btn-danger" title="Supprimer" onClick={() => deleteLevel(level)}>
                                      <FiTrash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {pageCount > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={currentPage <= 1}
                            onClick={() => updatePoleFilter(pole.id, { page: currentPage - 1 })}
                          >
                            Précédent
                          </button>
                          <span style={{ color: '#374151' }}>Page {currentPage} / {pageCount}</span>
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={currentPage >= pageCount}
                            onClick={() => updatePoleFilter(pole.id, { page: currentPage + 1 })}
                          >
                            Suivant
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
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
                <select className="form-control" value={levelForm.poleId} onChange={(e) => setLevelForm((prev) => ({ ...prev, poleId: e.target.value, cursus: '' }))}>
                  <option value="">Sélectionner</option>
                  {poles.map((pole) => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
                </select>
              </div>

              {isSoutienPoleName(poles.find((p) => p.id === levelForm.poleId)?.name) && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Cursus</label>
                  <select className="form-control" value={levelForm.cursus} onChange={(e) => setLevelForm((prev) => ({ ...prev, cursus: e.target.value }))}>
                    <option value="">— Non défini —</option>
                    {CURSUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              )}

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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Âge minimum</label>
                  <input type="number" className="form-control" value={levelForm.minAge} onChange={(e) => setLevelForm((prev) => ({ ...prev, minAge: e.target.value }))} placeholder="3" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Âge maximum</label>
                  <input type="number" className="form-control" value={levelForm.maxAge} onChange={(e) => setLevelForm((prev) => ({ ...prev, maxAge: e.target.value }))} placeholder="8" />
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
