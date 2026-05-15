import { useEffect, useState } from 'react';
import api from '../../api/axios';

function Card({ title, value }) {
  return (
    <div className="stat-card">
      <div className="stat-info">
        <h4>{value}</h4>
        <p>{title}</p>
      </div>
    </div>
  );
}

export default function TresorierDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/finance/dashboard').then(({ data: d }) => setData(d)).catch(console.error);
  }, []);

  const k = data?.kpi || {};
  const incomeCategories = Object.entries(data?.charts?.incomeByCategory || {});
  const expenseCategories = Object.entries(data?.charts?.expenseByCategory || {});

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 20 }}>Dashboard Financier</h2>

      <div className="stats-grid">
        <Card title="Budget total" value={`${(k.budgetTotal || 0).toFixed?.(2) || 0} €`} />
        <Card title="Recettes encaissées" value={`${(k.paidTotal || 0).toFixed?.(2) || 0} €`} />
        <Card title="Taux de recouvrement" value={`${(k.collectionRate || 0).toFixed?.(2) || 0} %`} />
        <Card title="Solde de trésorerie" value={`${(k.cashBalance || 0).toFixed?.(2) || 0} €`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h3>Recettes par catégorie</h3>
          {incomeCategories.length === 0 ? <p>Aucune donnée</p> : incomeCategories.map(([name, value]) => (
            <div key={name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{name}</span><strong>{value.toFixed(2)} €</strong></div>
              <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4 }}>
                <div style={{ height: 8, width: `${Math.min(100, value)}%`, background: '#22C55E', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Dépenses par catégorie</h3>
          {expenseCategories.length === 0 ? <p>Aucune donnée</p> : expenseCategories.map(([name, value]) => (
            <div key={name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{name}</span><strong>{value.toFixed(2)} €</strong></div>
              <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4 }}>
                <div style={{ height: 8, width: `${Math.min(100, value)}%`, background: '#EF4444', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
