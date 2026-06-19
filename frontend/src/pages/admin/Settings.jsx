import { useEffect, useState } from 'react';
import { FiEdit2 } from 'react-icons/fi';
import api from '../../api/axios';
import toast from 'react-hot-toast';

function getDefaultSchoolYearDates() {
  const now = new Date();
  const month = now.getMonth(); // 0=Jan, 8=Sept
  const startYear = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    startDate: `${startYear}-09-01`,
    endDate: `${startYear + 1}-06-30`,
  };
}

const defaultPricing = {
  registrationFee: 10,
  fraisPrelevement: 0,
  arabicTier1: 310,
  arabicTier2: 570,
  arabicTier3: 750,
  arabicTier4: 900,
  arabicTier5: 1050,
  arabicExtraPerStudent: 150,
  coranEnfant: 220,
  coranAdulteHomme: 300,
  coranAdulteFemme: 250,
  sciencesIslamiques: 300,
};

const SOUTIEN_SEANCES = [
  { value: 'seances-1', label: '1 séance' },
  { value: 'seances-2', label: '2 séances' },
  { value: 'seances-3', label: '3 séances' },
];

const isSoutienPoleName = (name) => String(name || '').toLowerCase().includes('soutien');

const PRICING_ROW_DEFINITIONS = [
  { id: 'arabic-1', label: 'Arabe - 1 élève', defaultPoleKeyword: 'arabe', defaultLevelMatch: '', peopleCount: 1, pricingKey: 'arabicTier1' },
  { id: 'arabic-2', label: 'Arabe - 2 élèves', defaultPoleKeyword: 'arabe', defaultLevelMatch: '', peopleCount: 2, pricingKey: 'arabicTier2' },
  { id: 'arabic-3', label: 'Arabe - 3 élèves', defaultPoleKeyword: 'arabe', defaultLevelMatch: '', peopleCount: 3, pricingKey: 'arabicTier3' },
  { id: 'arabic-4', label: 'Arabe - 4 élèves', defaultPoleKeyword: 'arabe', defaultLevelMatch: '', peopleCount: 4, pricingKey: 'arabicTier4' },
  { id: 'arabic-5', label: 'Arabe - 5 élèves', defaultPoleKeyword: 'arabe', defaultLevelMatch: '', peopleCount: 5, pricingKey: 'arabicTier5' },
  { id: 'arabic-6-plus', label: 'Arabe - 6+ élèves (unitaire)', defaultPoleKeyword: 'arabe', defaultLevelMatch: '', peopleCount: 6, pricingKey: 'arabicExtraPerStudent' },
  { id: 'coran-enfant', label: 'Coran - Enfant', defaultPoleKeyword: 'coran', defaultLevelMatch: 'enfant', peopleCount: 1, pricingKey: 'coranEnfant' },
  { id: 'coran-adulte-homme', label: 'Coran - Adulte homme', defaultPoleKeyword: 'coran', defaultLevelMatch: 'homme', peopleCount: 1, pricingKey: 'coranAdulteHomme' },
  { id: 'coran-adulte-femme', label: 'Coran - Adulte femme', defaultPoleKeyword: 'coran', defaultLevelMatch: 'femme', peopleCount: 1, pricingKey: 'coranAdulteFemme' },
  { id: 'sciences-islamiques', label: 'Sciences islamiques', defaultPoleKeyword: 'sciences', defaultLevelMatch: '', peopleCount: 1, pricingKey: 'sciencesIslamiques' },
];

export default function AdminSettings() {
  const [schoolYears, setSchoolYears] = useState([]);
  const [poles, setPoles] = useState([]);
  const { startDate: defaultStart, endDate: defaultEnd } = getDefaultSchoolYearDates();
  const [newYear, setNewYear] = useState({ label: '', startDate: defaultStart, endDate: defaultEnd, period: 'ANNUEL', isCurrent: false });
  const [editYear, setEditYear] = useState(null);
  const [pricing, setPricing] = useState(defaultPricing);
  const [pricingRows, setPricingRows] = useState([]);
  const [filterPoleId, setFilterPoleId] = useState('');

  const getPoleByKeyword = (keyword) => poles.find((pole) => String(pole.name || '').toLowerCase().includes(keyword));
  const getDefaultLevelId = (pole, match) => {
    if (!pole?.levels?.length) return '';
    if (!match) return pole.levels[0]?.id || '';
    const normalizedMatch = String(match).toLowerCase();
    const found = pole.levels.find((level) => String(level.name || '').toLowerCase().includes(normalizedMatch) || String(level.code || '').toLowerCase().includes(normalizedMatch));
    return found?.id || pole.levels[0]?.id || '';
  };
  const getPricingKeyForRowId = (id) => PRICING_ROW_DEFINITIONS.find((row) => row.id === id)?.pricingKey || null;
  const createCustomPricingRow = () => ({
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: 'Ligne de tarif',
    poleId: '',
    poleName: '',
    levelId: 'ALL',
    levelCode: '',
    peopleCount: 1,
    price: 0,
  });
  const buildPricingRows = (raw, poleList) => {
    if (Array.isArray(raw.tariffRows) && raw.tariffRows.length > 0) {
      return raw.tariffRows.map((row) => {
        const seance = SOUTIEN_SEANCES.find((s) => s.value === row.levelId);
        return {
          id: row.id || `row-${Math.random().toString(36).slice(2, 6)}`,
          label: row.label || 'Ligne de tarif',
          poleId: row.poleId || '',
          poleName: row.poleName || '',
          levelId: row.levelId || 'ALL',
          levelCode: seance ? seance.label : (row.levelCode || ''),
          peopleCount: Number(row.peopleCount) || 0,
          price: Number(row.price) || 0,
        };
      });
    }

    return PRICING_ROW_DEFINITIONS.map((definition) => {
      const pole = poleList.find((p) => String(p.name || '').toLowerCase().includes(definition.defaultPoleKeyword));
      const level = pole ? pole.levels?.find((l) => String(l.name || '').toLowerCase().includes(definition.defaultLevelMatch) || String(l.code || '').toLowerCase().includes(definition.defaultLevelMatch)) : null;
      return {
        id: definition.id,
        label: definition.label,
        poleId: pole?.id || '',
        poleName: pole?.name || '',
        levelId: level?.id || getDefaultLevelId(pole, definition.defaultLevelMatch),
        levelCode: level?.code || '',
        peopleCount: definition.peopleCount,
        price: Number(raw[definition.pricingKey] || 0),
      };
    });
  };
  const addPricingRow = () => {
    setPricingRows((prev) => [...prev, createCustomPricingRow()]);
  };
  const removePricingRow = (rowId) => {
    setPricingRows((prev) => prev.filter((row) => row.id !== rowId));
  };
  const handlePricingRowChange = (rowId, field, value) => {
    setPricingRows((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      const nextRow = { ...row };
      if (field === 'poleId') {
        nextRow.poleId = value;
        const pole = poles.find((p) => p.id === value);
        nextRow.poleName = pole?.name || '';
        if (isSoutienPoleName(pole?.name)) {
          nextRow.levelId = 'seances-1';
          nextRow.levelCode = '1 séance';
        } else {
          nextRow.levelId = getDefaultLevelId(pole, '');
          nextRow.levelCode = '';
        }
      } else if (field === 'levelId') {
        nextRow.levelId = value;
        const pole = poles.find((p) => p.id === row.poleId);
        if (isSoutienPoleName(pole?.name)) {
          const seance = SOUTIEN_SEANCES.find((s) => s.value === value);
          nextRow.levelCode = seance?.label || '';
        } else {
          const level = pole?.levels?.find((l) => l.id === value);
          nextRow.levelCode = level?.code || '';
        }
      } else if (field === 'peopleCount') {
        nextRow.peopleCount = Number(value) || 0;
      } else if (field === 'price') {
        nextRow.price = Number(value) || 0;
      }
      return nextRow;
    }));

    if (field === 'price') {
      const pricingKey = getPricingKeyForRowId(rowId);
      if (pricingKey) {
        setPricing((prev) => ({ ...prev, [pricingKey]: Number(value) || 0 }));
      }
    }
  };

  const load = async () => {
    try {
      const [yearsRes, polesRes, pricingRes] = await Promise.all([
        api.get('/admin/school-years'),
        api.get('/admin/poles'),
        api.get('/admin/pricing'),
      ]);

      setSchoolYears(yearsRes.data.schoolYears || []);
      setPoles(polesRes.data.poles || []);

      const raw = pricingRes.data.raw;
      if (raw) {
        setPricing({
          registrationFee: Number(raw.registrationFee || 0),
          fraisPrelevement: Number(raw.fraisPrelevement || 0),
          arabicTier1: Number(raw.arabicTier1),
          arabicTier2: Number(raw.arabicTier2),
          arabicTier3: Number(raw.arabicTier3),
          arabicTier4: Number(raw.arabicTier4),
          arabicTier5: Number(raw.arabicTier5),
          arabicExtraPerStudent: Number(raw.arabicExtraPerStudent),
          coranEnfant: Number(raw.coranEnfant),
          coranAdulteHomme: Number(raw.coranAdulteHomme),
          coranAdulteFemme: Number(raw.coranAdulteFemme),
          sciencesIslamiques: Number(raw.sciencesIslamiques),
        });
        setPricingRows(buildPricingRows(raw, polesRes.data.poles || []));
      } else {
        setPricingRows(buildPricingRows({}, polesRes.data.poles || []));
      }
    } catch {
      toast.error('Erreur de chargement des paramètres');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateYear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/school-years', newYear);
      toast.success('Année scolaire créée');
      const { startDate: ds, endDate: de } = getDefaultSchoolYearDates();
      setNewYear({ label: '', startDate: ds, endDate: de, period: 'ANNUEL', isCurrent: false });
      const { data } = await api.get('/admin/school-years');
      setSchoolYears(data.schoolYears);
    } catch {
      toast.error('Erreur');
    }
  };

  const handleUpdateYear = async (e) => {
    e.preventDefault();
    if (!editYear) return;
    try {
      await api.put(`/admin/school-years/${editYear.id}`, {
        label: editYear.label,
        startDate: editYear.startDate,
        endDate: editYear.endDate,
        isCurrent: editYear.isCurrent,
      });
      toast.success('Année scolaire mise à jour');
      setEditYear(null);
      const { data } = await api.get('/admin/school-years');
      setSchoolYears(data.schoolYears);
    } catch {
      toast.error('Erreur mise à jour');
    }
  };

  const savePricing = async (e) => {
    e.preventDefault();
    try {
      await api.put('/admin/pricing', { ...pricing, tariffRows: pricingRows.map((row) => ({
        id: row.id,
        label: row.label,
        poleId: row.poleId,
        poleName: row.poleName,
        levelId: row.levelId,
        levelCode: row.levelCode,
        peopleCount: row.peopleCount,
        price: row.price,
      })) });
      toast.success('Tarification mise à jour');
      load();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur mise à jour tarification');
    }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>Paramètres</h2>

      <div className="card">
        <div className="card-header">
          <h3>Années scolaires</h3>
        </div>
        <div className="table-container mb-2">
          <table>
            <thead>
              <tr><th>Label</th><th>Début</th><th>Fin</th><th>Période</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {schoolYears.map((y) => (
                <tr key={y.id}>
                  <td style={{ fontWeight: 700 }}>{y.label}</td>
                  <td>{new Date(y.startDate).toLocaleDateString('fr-FR')}</td>
                  <td>{new Date(y.endDate).toLocaleDateString('fr-FR')}</td>
                  <td>{y.period === 'MENSUEL' ? 'Mensuel' : y.period === 'TRIMESTRIEL' ? 'Trimestriel' : y.period === 'SEMESTRIEL' ? 'Semestriel' : 'Annuel'}</td>
                  <td>{y.isCurrent ? <span className="badge badge-success">Active</span> : <span className="badge badge-gray">Non</span>}</td>
                  <td>
                    <button
                      className="btn btn-icon btn-outline"
                      title="Modifier"
                      onClick={() => setEditYear({
                        id: y.id,
                        label: y.label,
                        startDate: y.startDate ? new Date(y.startDate).toISOString().slice(0, 10) : '',
                        endDate: y.endDate ? new Date(y.endDate).toISOString().slice(0, 10) : '',
                        isCurrent: y.isCurrent,
                      })}
                    >
                      <FiEdit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={handleCreateYear} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Label</label>
            <input className="form-control" placeholder="2025-2026" value={newYear.label} onChange={(e) => setNewYear({ ...newYear, label: e.target.value })} required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Début</label>
            <input type="date" className="form-control" value={newYear.startDate} onChange={(e) => setNewYear({ ...newYear, startDate: e.target.value })} required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Fin</label>
            <input type="date" className="form-control" value={newYear.endDate} onChange={(e) => setNewYear({ ...newYear, endDate: e.target.value })} required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Période scolaire</label>
            <select className="form-control" value={newYear.period} onChange={(e) => setNewYear({ ...newYear, period: e.target.value })}>
              <option value="MENSUEL">Mensuel</option>
              <option value="TRIMESTRIEL">Trimestriel</option>
              <option value="SEMESTRIEL">Semestriel</option>
              <option value="ANNUEL">Annuel</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={newYear.isCurrent} onChange={(e) => setNewYear({ ...newYear, isCurrent: e.target.checked })} />
            Active
          </label>
          <button type="submit" className="btn btn-primary btn-sm">Créer</button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Tarification annuelle paramétrable</h3>
        </div>
        <form onSubmit={savePricing}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
            <div className="form-group">
              <label>Frais inscription</label>
              <input
                className="form-control"
                type="number"
                step="0.01"
                value={pricing.registrationFee}
                onChange={(e) => setPricing((p) => ({ ...p, registrationFee: Number(e.target.value) }))}
              />
            </div>
            <div className="form-group">
              <label>Frais prélèvement</label>
              <input
                className="form-control"
                type="number"
                step="0.01"
                value={pricing.fraisPrelevement}
                onChange={(e) => setPricing((p) => ({ ...p, fraisPrelevement: Number(e.target.value) }))}
              />
            </div>
          </div>
          {/* Filtre par pôle */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Filtrer par pôle :</span>
            <button
              type="button"
              onClick={() => setFilterPoleId('')}
              style={{
                padding: '4px 14px', borderRadius: 999, border: '1px solid', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: filterPoleId === '' ? 'var(--amc-primary)' : '#fff',
                color: filterPoleId === '' ? '#fff' : '#374151',
                borderColor: filterPoleId === '' ? 'var(--amc-primary)' : '#D1D5DB',
              }}
            >
              Tous
            </button>
            {poles.map((pole) => (
              <button
                key={pole.id}
                type="button"
                onClick={() => setFilterPoleId(pole.id)}
                style={{
                  padding: '4px 14px', borderRadius: 999, border: '1px solid', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: filterPoleId === pole.id ? 'var(--amc-primary)' : '#fff',
                  color: filterPoleId === pole.id ? '#fff' : '#374151',
                  borderColor: filterPoleId === pole.id ? 'var(--amc-primary)' : '#D1D5DB',
                }}
              >
                {pole.name}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 720, background: '#FFFFFF', borderRadius: 16, overflow: 'hidden' }}>
              <thead style={{ background: '#F1F5F9' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '16px', fontSize: 14, color: '#0F172A' }}>Pôle</th>
                  <th style={{ textAlign: 'left', padding: '16px', fontSize: 14, color: '#0F172A' }}>Niveau</th>
                  <th style={{ textAlign: 'left', padding: '16px', fontSize: 14, color: '#0F172A' }}>Nombre de personnes</th>
                  <th style={{ textAlign: 'left', padding: '16px', fontSize: 14, color: '#0F172A' }}>Tarif (€)</th>
                </tr>
              </thead>
              <tbody>
                {pricingRows.filter((row) => !filterPoleId || row.poleId === filterPoleId).map((row) => {
                  const selectedPole = poles.find((pole) => pole.id === row.poleId);
                  const levelOptions = selectedPole?.levels || [];
                  const isSoutien = isSoutienPoleName(selectedPole?.name);
                  return (
                    <tr key={row.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <select
                          className="form-control"
                          value={row.poleId}
                          onChange={(e) => handlePricingRowChange(row.id, 'poleId', e.target.value)}
                          style={{ width: '100%', borderRadius: 12, minHeight: 44 }}
                        >
                          <option value="">Sélectionner un pôle</option>
                          {poles.map((pole) => (
                            <option key={pole.id} value={pole.id}>{pole.name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        {isSoutien ? (
                          <select
                            className="form-control"
                            value={SOUTIEN_SEANCES.some((s) => s.value === row.levelId) ? row.levelId : 'seances-1'}
                            onChange={(e) => handlePricingRowChange(row.id, 'levelId', e.target.value)}
                            style={{ width: '100%', borderRadius: 12, minHeight: 44 }}
                          >
                            {SOUTIEN_SEANCES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        ) : levelOptions.length > 0 ? (
                          <select
                            className="form-control"
                            value={row.levelId}
                            onChange={(e) => handlePricingRowChange(row.id, 'levelId', e.target.value)}
                            style={{ width: '100%', borderRadius: 12, minHeight: 44 }}
                          >
                            <option value="ALL">Tout niveau</option>
                            <option value="">Sélectionner un niveau</option>
                            {levelOptions.map((level) => (
                              <option key={level.id} value={level.id}>{level.name || level.code}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ display: 'inline-block', padding: '12px 14px', width: '100%', borderRadius: 12, background: '#F8FAFC', color: '#64748B' }}>Aucun niveau disponible</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <input
                          className="form-control"
                          type="number"
                          min="1"
                          value={row.peopleCount}
                          onChange={(e) => handlePricingRowChange(row.id, 'peopleCount', e.target.value)}
                          style={{ width: '100%', borderRadius: 12, minHeight: 44 }}
                        />
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            className="form-control"
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.price}
                            onChange={(e) => handlePricingRowChange(row.id, 'price', e.target.value)}
                            style={{ width: '100%', borderRadius: 12, minHeight: 44 }}
                          />
                          <button
                            type="button"
                            onClick={() => removePricingRow(row.id)}
                            style={{
                              border: '1px solid #E2E8F0',
                              background: '#FFFFFF',
                              color: '#475569',
                              borderRadius: 12,
                              minWidth: 44,
                              minHeight: 44,
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
            <button type="button" className="btn btn-outline" onClick={addPricingRow}>Ajouter une ligne</button>
            <button type="submit" className="btn btn-primary">Enregistrer la tarification</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Pôles et niveaux</h3>
        </div>
        {poles.map((pole) => (
          <div key={pole.id} style={{ marginBottom: 16 }}>
            <h4 style={{ color: 'var(--amc-primary)', marginBottom: 8 }}>{pole.name}</h4>
            <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 8 }}>{pole.description}</p>
            <ul style={{ paddingLeft: 20 }}>
              {pole.levels?.map((level) => (
                <li key={level.id} style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>{level.code}</strong> — {level.name}
                  {level.minAge && <span style={{ color: '#F59E0B', marginLeft: 8 }}>(âge min: {level.minAge} ans)</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Modale édition année scolaire */}
      {editYear && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div className="card" style={{ width: 480, maxWidth: '95vw' }}>
            <h3 style={{ marginBottom: 16 }}>Modifier l'année scolaire</h3>
            <form onSubmit={handleUpdateYear} style={{ display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Label</label>
                <input className="form-control" value={editYear.label} onChange={(e) => setEditYear((p) => ({ ...p, label: e.target.value }))} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date de début</label>
                  <input type="date" className="form-control" value={editYear.startDate} onChange={(e) => setEditYear((p) => ({ ...p, startDate: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date de fin</label>
                  <input type="date" className="form-control" value={editYear.endDate} onChange={(e) => setEditYear((p) => ({ ...p, endDate: e.target.value }))} required />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={editYear.isCurrent} onChange={(e) => setEditYear((p) => ({ ...p, isCurrent: e.target.checked }))} />
                Année active (courante)
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditYear(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
