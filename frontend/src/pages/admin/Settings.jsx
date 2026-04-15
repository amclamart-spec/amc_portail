import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function AdminSettings() {
  const [schoolYears, setSchoolYears] = useState([]);
  const [poles, setPoles] = useState([]);
  const [newYear, setNewYear] = useState({ label: '', startDate: '', endDate: '', isCurrent: false });

  useEffect(() => {
    api.get('/admin/school-years').then(({ data }) => setSchoolYears(data.schoolYears)).catch(console.error);
    api.get('/admin/poles').then(({ data }) => setPoles(data.poles)).catch(console.error);
  }, []);

  const handleCreateYear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/school-years', newYear);
      toast.success('Année scolaire créée');
      setNewYear({ label: '', startDate: '', endDate: '', isCurrent: false });
      const { data } = await api.get('/admin/school-years');
      setSchoolYears(data.schoolYears);
    } catch { toast.error('Erreur'); }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>Paramètres</h2>

      {/* Années scolaires */}
      <div className="card">
        <div className="card-header">
          <h3>Années scolaires</h3>
        </div>
        <div className="table-container mb-2">
          <table>
            <thead>
              <tr><th>Label</th><th>Début</th><th>Fin</th><th>Active</th></tr>
            </thead>
            <tbody>
              {schoolYears.map((y) => (
                <tr key={y.id}>
                  <td style={{ fontWeight: 700 }}>{y.label}</td>
                  <td>{new Date(y.startDate).toLocaleDateString('fr-FR')}</td>
                  <td>{new Date(y.endDate).toLocaleDateString('fr-FR')}</td>
                  <td>{y.isCurrent ? <span className="badge badge-success">Active</span> : <span className="badge badge-gray">Non</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={handleCreateYear} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Label</label>
            <input className="form-control" placeholder="2025-2026" value={newYear.label} onChange={(e) => setNewYear({...newYear, label: e.target.value})} required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Début</label>
            <input type="date" className="form-control" value={newYear.startDate} onChange={(e) => setNewYear({...newYear, startDate: e.target.value})} required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Fin</label>
            <input type="date" className="form-control" value={newYear.endDate} onChange={(e) => setNewYear({...newYear, endDate: e.target.value})} required />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={newYear.isCurrent} onChange={(e) => setNewYear({...newYear, isCurrent: e.target.checked})} />
            Active
          </label>
          <button type="submit" className="btn btn-primary btn-sm">Créer</button>
        </form>
      </div>

      {/* Pôles et Niveaux */}
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
