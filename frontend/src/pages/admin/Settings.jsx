import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

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

export default function AdminSettings() {
  const [schoolYears, setSchoolYears] = useState([]);
  const [poles, setPoles] = useState([]);
  const [newYear, setNewYear] = useState({ label: '', startDate: '', endDate: '', period: 'ANNUEL', isCurrent: false });
  const [pricing, setPricing] = useState(defaultPricing);

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
      setNewYear({ label: '', startDate: '', endDate: '', period: 'ANNUEL', isCurrent: false });
      const { data } = await api.get('/admin/school-years');
      setSchoolYears(data.schoolYears);
    } catch {
      toast.error('Erreur');
    }
  };

  const savePricing = async (e) => {
    e.preventDefault();
    try {
      await api.put('/admin/pricing', pricing);
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
              <tr><th>Label</th><th>Début</th><th>Fin</th><th>Période</th><th>Active</th></tr>
            </thead>
            <tbody>
              {schoolYears.map((y) => (
                <tr key={y.id}>
                  <td style={{ fontWeight: 700 }}>{y.label}</td>
                  <td>{new Date(y.startDate).toLocaleDateString('fr-FR')}</td>
                  <td>{new Date(y.endDate).toLocaleDateString('fr-FR')}</td>
                  <td>{y.period === 'MENSUEL' ? 'Mensuel' : y.period === 'TRIMESTRIEL' ? 'Trimestriel' : y.period === 'SEMESTRIEL' ? 'Semestriel' : 'Annuel'}</td>
                  <td>{y.isCurrent ? <span className="badge badge-success">Active</span> : <span className="badge badge-gray">Non</span>}</td>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="form-group"><label>Frais inscription</label><input className="form-control" type="number" step="0.01" value={pricing.registrationFee} onChange={(e) => setPricing((p) => ({ ...p, registrationFee: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Frais prélèvement</label><input className="form-control" type="number" step="0.01" value={pricing.fraisPrelevement} onChange={(e) => setPricing((p) => ({ ...p, fraisPrelevement: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Arabe 1 élève</label><input className="form-control" type="number" step="0.01" value={pricing.arabicTier1} onChange={(e) => setPricing((p) => ({ ...p, arabicTier1: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Arabe 2 élèves</label><input className="form-control" type="number" step="0.01" value={pricing.arabicTier2} onChange={(e) => setPricing((p) => ({ ...p, arabicTier2: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Arabe 3 élèves</label><input className="form-control" type="number" step="0.01" value={pricing.arabicTier3} onChange={(e) => setPricing((p) => ({ ...p, arabicTier3: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Arabe 4 élèves</label><input className="form-control" type="number" step="0.01" value={pricing.arabicTier4} onChange={(e) => setPricing((p) => ({ ...p, arabicTier4: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Arabe 5 élèves</label><input className="form-control" type="number" step="0.01" value={pricing.arabicTier5} onChange={(e) => setPricing((p) => ({ ...p, arabicTier5: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Arabe élève 6+ (unitaire)</label><input className="form-control" type="number" step="0.01" value={pricing.arabicExtraPerStudent} onChange={(e) => setPricing((p) => ({ ...p, arabicExtraPerStudent: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Coran enfant</label><input className="form-control" type="number" step="0.01" value={pricing.coranEnfant} onChange={(e) => setPricing((p) => ({ ...p, coranEnfant: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Coran adulte homme</label><input className="form-control" type="number" step="0.01" value={pricing.coranAdulteHomme} onChange={(e) => setPricing((p) => ({ ...p, coranAdulteHomme: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Coran adulte femme</label><input className="form-control" type="number" step="0.01" value={pricing.coranAdulteFemme} onChange={(e) => setPricing((p) => ({ ...p, coranAdulteFemme: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Sciences islamiques</label><input className="form-control" type="number" step="0.01" value={pricing.sciencesIslamiques} onChange={(e) => setPricing((p) => ({ ...p, sciencesIslamiques: Number(e.target.value) }))} /></div>
          </div>
          <button type="submit" className="btn btn-primary">Enregistrer la tarification</button>
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
    </div>
  );
}
