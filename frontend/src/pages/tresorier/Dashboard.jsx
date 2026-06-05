import { useEffect, useState } from 'react';
import { FiActivity, FiCheckCircle, FiClipboard, FiCreditCard, FiDollarSign, FiGrid, FiLayers, FiPieChart, FiRefreshCw, FiTrendingUp } from 'react-icons/fi';
import api from '../../api/axios';

function Card({ title, value, icon: Icon, accent = '#0EA5E9' }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${accent}`, background: `linear-gradient(180deg, ${accent}12 0%, #FFFFFF 50%)` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div className="stat-info">
          <h4 style={{ color: '#0F172A' }}>{value}</h4>
          <p style={{ color: '#334155' }}>{title}</p>
        </div>
        {Icon && (
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}22`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function TresorierDashboard() {
  const [data, setData] = useState(null);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/finance/dashboard'),
      api.get('/payments/transactions'),
    ])
      .then(([financeRes, txRes]) => {
        setData(financeRes.data);
        setTransactions(txRes.data?.transactions || []);
      })
      .catch(console.error);
  }, []);

  const getPaymentMethodKey = (transaction = {}) => {
    const payment = transaction.payment || {};
    return String(transaction.method || payment.method || payment.paymentMethod || '').toUpperCase();
  };

  const txAmount = (transaction = {}) => Number(transaction.amount || 0);

  const txIsPaid = (transaction = {}) => String(transaction.status || '').toUpperCase() === 'SUCCEEDED';

  const isDebitMethod = (methodKey = '') => ['VIREMENT', 'PRELEVEMENT_BANCAIRE', 'SEPA', 'STRIPE_SEPA', 'GO_CARDLESS_SEPA'].includes(methodKey);

  const parseBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'oui'].includes(normalized)) return true;
    if (['false', '0', 'no', 'non'].includes(normalized)) return false;
    return null;
  };

  const txDebitProcessed = (transaction = {}) => {
    const paymentMetadata = transaction.payment?.metadata || {};
    const transactionMetadata = transaction.metadata || {};
    const explicitFlag =
      paymentMetadata.prelevement_traite
      ?? paymentMetadata.prelevementTraite
      ?? paymentMetadata.prelevement_traitee
      ?? paymentMetadata.prelevementTraitee
      ?? transactionMetadata.prelevement_traite
      ?? transactionMetadata.prelevementTraite
      ?? transactionMetadata.prelevement_traitee
      ?? transactionMetadata.prelevementTraitee;
    const parsed = parseBoolean(explicitFlag);
    if (parsed !== null) return parsed;
    return txIsPaid(transaction);
  };

  const paymentKpi = transactions.reduce((acc, tx) => {
    const methodKey = getPaymentMethodKey(tx);
    const amount = txAmount(tx);
    const paid = txIsPaid(tx);
    const debitMethod = isDebitMethod(methodKey);

    acc.totalRevenueAmount += amount;
    if (paid) acc.totalCollectedAmount += amount;

    if (methodKey === 'CHEQUE') {
      acc.chequeCount += 1;
      acc.chequeAmount += amount;
    }

    if (methodKey === 'ESPECES') {
      acc.cashCount += 1;
      acc.cashAmount += amount;
    }

    if (debitMethod) {
      acc.debitCount += 1;
      acc.debitAmount += amount;
      if (txDebitProcessed(tx)) acc.debitProcessedCount += 1;
    }

    return acc;
  }, {
    totalRevenueAmount: 0,
    totalCollectedAmount: 0,
    chequeCount: 0,
    chequeAmount: 0,
    cashCount: 0,
    cashAmount: 0,
    debitCount: 0,
    debitAmount: 0,
    debitProcessedCount: 0,
  });

  const k = data?.kpi || {};
  const incomeCategories = Object.entries(data?.charts?.incomeByCategory || {});
  const expenseCategories = Object.entries(data?.charts?.expenseByCategory || {});

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 20 }}>Dashboard Financier</h2>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <Card title="Total recette" value={`${paymentKpi.totalRevenueAmount.toFixed(2)} €`} icon={FiDollarSign} accent="#0EA5E9" />
        <Card title="Total recette encaissée (payés)" value={`${paymentKpi.totalCollectedAmount.toFixed(2)} €`} icon={FiCheckCircle} accent="#10B981" />
        <Card title="Paiement Chèque (nb / montant)" value={`${paymentKpi.chequeCount} / ${paymentKpi.chequeAmount.toFixed(2)} €`} icon={FiClipboard} accent="#8B5CF6" />
        <Card title="Paiement Espèces (nb / montant)" value={`${paymentKpi.cashCount} / ${paymentKpi.cashAmount.toFixed(2)} €`} icon={FiGrid} accent="#F59E0B" />
        <Card title="Paiement Prélèvement (nb / montant)" value={`${paymentKpi.debitCount} / ${paymentKpi.debitAmount.toFixed(2)} €`} icon={FiRefreshCw} accent="#3B82F6" />
        <Card title="Prélèvements traités" value={paymentKpi.debitProcessedCount} icon={FiActivity} accent="#14B8A6" />
      </div>

      <div className="stats-grid">
        <Card title="Budget total" value={`${(k.budgetTotal || 0).toFixed?.(2) || 0} €`} icon={FiLayers} accent="#6366F1" />
        <Card title="Recettes encaissées" value={`${(k.paidTotal || 0).toFixed?.(2) || 0} €`} icon={FiCreditCard} accent="#22C55E" />
        <Card title="Taux de recouvrement" value={`${(k.collectionRate || 0).toFixed?.(2) || 0} %`} icon={FiTrendingUp} accent="#EF4444" />
        <Card title="Solde de trésorerie" value={`${(k.cashBalance || 0).toFixed?.(2) || 0} €`} icon={FiPieChart} accent="#0EA5E9" />
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
