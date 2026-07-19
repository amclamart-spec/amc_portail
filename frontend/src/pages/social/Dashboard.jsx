import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

function StatCard({ icon, label, value, color = 'primary' }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div className="stat-info">
        <h4>{value ?? '—'}</h4>
        <p>{label}</p>
      </div>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

export default function SocialDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const canSeeBudget = user?.role === 'RESPONSABLE_POLE_SOCIAL' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    api.get('/social/dashboard')
      .then(({ data: d }) => setData(d))
      .catch(() => toast.error('Impossible de charger le tableau de bord'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Chargement…</p>;

  const cases = data?.cases || {};
  const lowStock = data?.lowStock || [];
  const recentDist = data?.recentDistributions || [];
  const recentColl = data?.recentCollections || [];
  const budget = data?.budget;

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 20 }}>Tableau de bord — Pôle Social</h2>

      {/* Stat cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <StatCard icon="⏳" label="Dossiers en attente" value={cases.pending ?? 0} color="warning" />
        <StatCard icon="✅" label="Dossiers acceptés" value={cases.accepted ?? 0} color="success" />
        <StatCard icon="❌" label="Dossiers refusés" value={cases.refused ?? 0} color="danger" />
        <StatCard icon="👥" label="Bénéficiaires" value={data?.activeBeneficiaries ?? 0} color="primary" />
      </div>

      {/* Budget — RESPONSABLE uniquement */}
      {canSeeBudget && budget && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px' }}>Budget {budget.year}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Budget alloué', value: budget.total, color: '#1D4ED8' },
              { label: 'Consommé', value: budget.consumed, color: '#DC2626' },
              { label: 'Restant', value: budget.remaining, color: budget.remaining < budget.total * 0.2 ? '#DC2626' : '#16A34A' },
            ].map((item) => (
              <div key={item.label} style={{ padding: 14, background: '#F8FAFC', borderRadius: 8, border: '1px solid var(--amc-border)', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value.toFixed(2)} €</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{item.label}</div>
              </div>
            ))}
          </div>
          {budget.remaining < budget.total * 0.1 && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, color: '#DC2626', fontSize: 13 }}>
              ⚠️ Alerte budget : moins de 10 % du budget restant
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* Alertes stock faible */}
        {lowStock.length > 0 && (
          <div className="card">
            <div className="card-header"><h3>⚠️ Stock faible</h3></div>
            <div style={{ padding: 12 }}>
              {lowStock.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--amc-border)', fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: '#DC2626', fontWeight: 700 }}>{Number(p.stockQty).toFixed(0)} {p.unit}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dernières distributions */}
        <div className="card">
          <div className="card-header"><h3>📦 Dernières distributions</h3></div>
          <div style={{ padding: 12 }}>
            {recentDist.length === 0 ? <p style={{ color: '#6B7280', fontSize: 13 }}>Aucune distribution</p> : recentDist.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--amc-border)', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{d.beneficiary?.firstName} {d.beneficiary?.lastName}</span>
                <span style={{ color: '#6B7280' }}>{fmtDate(d.distributedAt)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Dernières collectes */}
        <div className="card">
          <div className="card-header"><h3>🧺 Dernières collectes</h3></div>
          <div style={{ padding: 12 }}>
            {recentColl.length === 0 ? <p style={{ color: '#6B7280', fontSize: 13 }}>Aucune collecte</p> : recentColl.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--amc-border)', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{c.label}</span>
                <span style={{ color: '#6B7280' }}>{fmtDate(c.collectedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stock par catégorie */}
      {data?.productsByCategory?.length > 0 && (
        <div className="card">
          <div className="card-header"><h3>📊 Stock par catégorie</h3></div>
          <div style={{ padding: 12 }}>
            {data.productsByCategory.map((cat) => (
              <div key={cat.id} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--amc-primary)' }}>{cat.name}</div>
                <div className="table-container" style={{ margin: 0 }}>
                  <table>
                    <thead><tr><th>Produit</th><th>Stock</th><th>Unité</th><th>Alerte</th></tr></thead>
                    <tbody>
                      {cat.products.map((p) => (
                        <tr key={p.name}>
                          <td>{p.name}</td>
                          <td style={{ fontWeight: 700, color: Number(p.stockQty) <= Number(p.alertThreshold) ? '#DC2626' : '#16A34A' }}>{Number(p.stockQty).toFixed(0)}</td>
                          <td>{p.unit}</td>
                          <td style={{ color: '#6B7280' }}>{Number(p.alertThreshold).toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
