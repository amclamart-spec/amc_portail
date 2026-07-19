import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

export default function SocialBudget() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ totalAmount: '', observations: '' });
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const load = async (y = year) => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/social/budget', { params: { year: y } });
      setData(d);
      if (d.budget) {
        setForm({ totalAmount: Number(d.budget.totalAmount).toFixed(2), observations: d.budget.observations || '' });
        setEditMode(false);
      } else {
        setForm({ totalAmount: '', observations: '' });
        setEditMode(true);
      }
    } catch { toast.error('Erreur chargement'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.totalAmount || Number(form.totalAmount) <= 0) { toast.error('Montant invalide'); return; }
    setSaving(true);
    try {
      await api.post('/social/budget', { year, totalAmount: Number(form.totalAmount), observations: form.observations });
      toast.success(data?.budget ? 'Budget modifié' : 'Budget créé');
      load(year);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const budget = data?.budget;
  const purchases = data?.purchases || [];
  const consumed = budget?.consumed || 0;
  const remaining = budget?.remaining || 0;
  const pct = budget ? Math.min(100, Math.round((consumed / Number(budget.totalAmount)) * 100)) : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Budget Pôle Social</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" className="form-control" style={{ width: 100 }} value={year} onChange={(e) => setYear(Number(e.target.value))} min="2020" max="2099" />
          <button className="btn btn-outline" onClick={() => load(year)}>Charger</button>
        </div>
      </div>

      {loading ? <p style={{ textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
        <>
          {/* Résumé budget */}
          {budget ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3>Budget {year}</h3>
                <button className="btn btn-outline btn-sm" onClick={() => setEditMode(!editMode)}>{editMode ? 'Annuler' : 'Modifier'}</button>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Budget alloué', val: Number(budget.totalAmount), color: '#1D4ED8' },
                    { label: 'Montant consommé', val: consumed, color: '#DC2626' },
                    { label: 'Restant', val: remaining, color: remaining < 0 ? '#DC2626' : remaining < Number(budget.totalAmount) * 0.1 ? '#D97706' : '#16A34A' },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: 14, background: '#F8FAFC', borderRadius: 8, border: '1px solid var(--amc-border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.val.toFixed(2)} €</div>
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Consommation</span>
                  <span style={{ fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: 12, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? '#DC2626' : pct > 70 ? '#D97706' : '#16A34A', borderRadius: 999, transition: 'width .3s' }} />
                </div>
                {remaining < 0 && <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, color: '#DC2626', fontSize: 13 }}>⚠️ Budget dépassé de {Math.abs(remaining).toFixed(2)} €</div>}
                {!editMode && budget.observations && <p style={{ marginTop: 12, color: '#6B7280', fontSize: 13, fontStyle: 'italic' }}>{budget.observations}</p>}
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 16, padding: 16, textAlign: 'center', color: '#6B7280' }}>
              Aucun budget défini pour {year}
            </div>
          )}

          {/* Formulaire */}
          {editMode && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>{budget ? 'Modifier le budget' : `Définir le budget ${year}`}</h3></div>
              <form onSubmit={handleSave} style={{ padding: 16, display: 'grid', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Montant alloué (€) *</label>
                  <input className="form-control" type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => setForm((p) => ({ ...p, totalAmount: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Observations</label>
                  <textarea className="form-control" rows={2} value={form.observations} onChange={(e) => setForm((p) => ({ ...p, observations: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setEditMode(false)}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
                </div>
              </form>
            </div>
          )}

          {/* Liste achats liés */}
          {purchases.length > 0 && (
            <div className="card">
              <div className="card-header"><h3>Achats imputés sur ce budget ({purchases.length})</h3></div>
              <div className="table-container">
                <table>
                  <thead><tr><th>Date</th><th>Fournisseur</th><th>Description</th><th>Montant</th></tr></thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.purchasedAt)}</td>
                        <td>{p.supplier?.name || '—'}</td>
                        <td>{p.description || '—'}</td>
                        <td style={{ fontWeight: 700 }}>{Number(p.totalAmount).toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
