import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiX } from 'react-icons/fi';

const EMPTY = { name: '', maxMonthlyIncome: '', maxHouseholdSize: '', allowedCities: [], isActive: true };

export default function SocialEligibility() {
  const [criteria, setCriteria] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [cityInput, setCityInput] = useState('');
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/social/eligibility-criteria');
      setCriteria(data.criteria || []);
    } catch { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (c) => {
    setForm({
      name: c.name,
      maxMonthlyIncome: c.maxMonthlyIncome ?? '',
      maxHouseholdSize: c.maxHouseholdSize ?? '',
      allowedCities: c.allowedCities || [],
      isActive: c.isActive,
    });
    setCityInput('');
    setEditId(c.id);
    setModal(true);
  };
  const openCreate = () => { setForm(EMPTY); setCityInput(''); setEditId(null); setModal(true); };

  const addCity = () => {
    const value = cityInput.trim();
    if (!value) return;
    if (form.allowedCities.some((c) => c.toLowerCase() === value.toLowerCase())) {
      toast.error('Cette ville est déjà dans la liste');
      return;
    }
    setForm((p) => ({ ...p, allowedCities: [...p.allowedCities, value] }));
    setCityInput('');
  };

  const removeCity = (city) => {
    setForm((p) => ({ ...p, allowedCities: p.allowedCities.filter((c) => c !== city) }));
  };

  const handleCityKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCity(); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.maxMonthlyIncome === '' || form.maxHouseholdSize === '' || form.allowedCities.length === 0) {
      toast.error('Nom, revenu, composition du foyer et au moins une ville sont requis');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        maxMonthlyIncome: Number(form.maxMonthlyIncome),
        maxHouseholdSize: Number(form.maxHouseholdSize),
        allowedCities: form.allowedCities,
        isActive: Boolean(form.isActive),
      };
      if (editId) await api.put(`/social/eligibility-criteria/${editId}`, payload);
      else await api.post('/social/eligibility-criteria', payload);
      toast.success(editId ? 'Critère modifié' : 'Critère créé');
      setModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Critères d'éligibilité</h2>
        <button className="btn btn-primary" onClick={openCreate}><FiPlus size={14} /> Nouveau critère</button>
      </div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Chaque critère est composé de 3 conditions obligatoires : le revenu global mensuel de la famille, la
        composition du foyer (nombre total d'adultes et d'enfants) et la ville d'habitation. La validation d'un
        dossier doit satisfaire les 3 conditions de <strong>tous</strong> les critères actifs pour obtenir un avis
        automatique favorable ; sinon l'avis automatique est défavorable. Dans tous les cas, l'acceptation ou le
        refus final du dossier reste sous la responsabilité du responsable de pôle.
      </p>

      <div className="card">
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Nom</th><th>Revenu max</th><th>Taille foyer max</th><th>Villes éligibles</th><th>Actif</th><th>Actions</th></tr></thead>
              <tbody>
                {criteria.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun critère</td></tr>
                ) : criteria.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.maxMonthlyIncome != null ? `${Number(c.maxMonthlyIncome).toFixed(0)} €` : '—'}</td>
                    <td>{c.maxHouseholdSize} personne(s)</td>
                    <td>{(c.allowedCities || []).join(', ') || '—'}</td>
                    <td><span className={`badge ${c.isActive ? 'badge-success' : 'badge-gray'}`}>{c.isActive ? 'Actif' : 'Inactif'}</span></td>
                    <td><button className="btn btn-sm btn-outline" onClick={() => openEdit(c)}><FiEdit2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 520 }}>
            <div className="card-header"><h3>{editId ? 'Modifier le critère' : 'Nouveau critère'}</h3><button className="btn btn-outline btn-sm" onClick={() => setModal(false)}>Fermer</button></div>
            <form onSubmit={handleSave} style={{ padding: 16, display: 'grid', gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom du critère *</label>
                <input className="form-control" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex: Critère aide alimentaire 2026" required />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 13 }}>1. Revenu global mensuel de la famille</label>
                <input className="form-control" type="number" min="0" step="any" value={form.maxMonthlyIncome} onChange={(e) => setForm((p) => ({ ...p, maxMonthlyIncome: e.target.value }))} placeholder="Revenu mensuel maximum (€)" required />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 13 }}>2. Composition de la famille</label>
                <input className="form-control" type="number" min="1" step="1" value={form.maxHouseholdSize} onChange={(e) => setForm((p) => ({ ...p, maxHouseholdSize: e.target.value }))} placeholder="Taille maximale du foyer (adultes + enfants)" required />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 13 }}>3. Villes d'habitation éligibles</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-control" placeholder="Nom de la ville" value={cityInput} onChange={(e) => setCityInput(e.target.value)} onKeyDown={handleCityKeyDown} />
                  <button type="button" className="btn btn-outline" onClick={addCity}><FiPlus size={14} /></button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {form.allowedCities.length === 0 ? (
                    <span style={{ color: '#94A3B8', fontSize: 13 }}>Aucune ville renseignée</span>
                  ) : form.allowedCities.map((city) => (
                    <span key={city} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#EEF2FF', color: 'var(--amc-primary)', borderRadius: 16, padding: '4px 10px', fontSize: 13, fontWeight: 600 }}>
                      {city}
                      <button type="button" onClick={() => removeCity(city)} style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--amc-primary)' }}>
                        <FiX size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
                Critère actif (pris en compte pour l'évaluation automatique)
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
