import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiDownload } from 'react-icons/fi';

const transactionStatusOptions = [
  { value: '', label: 'Tous' },
  { value: 'INITIATED', label: 'Initié' },
  { value: 'SUCCEEDED', label: 'Payé' },
  { value: 'FAILED', label: 'Échoué' },
  { value: 'CANCELLED', label: 'Annulé' },
];

export default function AdminPayments() {
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ familyName: '', payerName: '', status: '', startDate: '', endDate: '', minAmount: '', maxAmount: '' });

  const buildQueryParams = (values) => {
    return Object.entries(values).reduce((params, [key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        params[key] = value;
      }
      return params;
    }, {});
  };

  const load = async (queryFilters = {}) => {
    try {
      const txRes = await api.get('/payments/transactions', { params: buildQueryParams(queryFilters) });
      setTransactions(txRes.data.transactions || []);
    } catch (e) {
      console.error('Impossible de charger les transactions', e);
      toast.error('Impossible de charger les transactions');
    }
  };

  const handleTransactionAction = async (tx, action) => {
    try {
      await api.patch(`/payments/transactions/${tx.id}`, { status: action });
      toast.success(action === 'validé' ? 'Paiement validé' : 'Paiement annulé');
      await load(filters);
    } catch (err) {
      console.error('Erreur mise à jour transaction', err);
      toast.error('Impossible de mettre à jour le paiement');
    }
  };

  useEffect(() => { load(); }, []);

  const applyFilters = () => load(filters);
  const resetFilters = () => {
    const reset = { familyName: '', payerName: '', status: '', startDate: '', endDate: '', minAmount: '', maxAmount: '' };
    setFilters(reset);
    load(reset);
  };

  const exportPayments = async () => {
    try {
      const response = await api.get('/payments/transactions/export', {
        params: buildQueryParams(filters),
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'paiements.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export téléchargé');
    } catch (err) {
      console.error('Erreur export', err);
      toast.error('Erreur export Excel');
    }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Paiements (Administration)</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Recherche</h3>
        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <input
              className="form-control"
              placeholder="Famille (nom)"
              value={filters.familyName}
              onChange={(e) => setFilters((prev) => ({ ...prev, familyName: e.target.value }))}
            />
            <input
              className="form-control"
              placeholder="Payeur"
              value={filters.payerName}
              onChange={(e) => setFilters((prev) => ({ ...prev, payerName: e.target.value }))}
            />
            <select
              className="form-control"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              {transactionStatusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" type="button" onClick={applyFilters}>Filtrer</button>
              <button className="btn btn-outline" type="button" onClick={resetFilters}>Réinitialiser</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <input className="form-control" type="date" value={filters.startDate} onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))} />
            <input className="form-control" type="date" value={filters.endDate} onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="button" onClick={exportPayments}>Exporter Excel</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Historique transactions</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Paiement</th>
                <th>Famille</th>
                <th>Payeur</th>
                <th>Méthode</th>
                <th>Montant</th>
                <th>Statut</th>
                  <th>Reçu</th>
                  <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.createdAt).toLocaleString('fr-FR')}</td>
                  <td>{t.paymentId}</td>
                  <td>{t.familyName || (t.payment?.family?.familyName) || '-'}</td>
                  <td>{t.payerName || '-'}</td>
                  <td>{t.method}</td>
                  <td>{Number(t.amount).toFixed(2)} €</td>
                  <td>{txStatusLabel(t.status)}</td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={async () => {
                        try {
                          const response = await api.get(`/finance/payments/${t.paymentId}/receipt/download`, { responseType: 'blob' });
                          const url = window.URL.createObjectURL(new Blob([response.data]));
                          const link = document.createElement('a');
                          link.href = url;
                          link.setAttribute('download', `recu-${t.paymentId.substring(0, 8)}.pdf`);
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error('Erreur téléchargement reçu', error);
                          toast.error('Impossible de télécharger le reçu de paiement');
                        }
                      }}
                    >
                      <FiDownload size={16} /> Reçu
                    </button>
                  </td>
                  <td>
                    {String(t.status) === 'INITIATED' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => handleTransactionAction(t, 'validé')}>Valider</button>
                        <button className="btn btn-outline btn-sm" onClick={() => handleTransactionAction(t, 'annulé')}>Annuler</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function txStatusLabel(status) {
  if (!status) return '—';
  switch (String(status)) {
    case 'INITIATED': return 'Initié';
    case 'SUCCEEDED': return 'Payé';
    case 'FAILED': return 'Échoué';
    case 'CANCELLED': return 'Annulé';
    default: return status;
  }
}
