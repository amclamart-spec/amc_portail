import { Fragment, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiDownload, FiEye, FiXCircle } from 'react-icons/fi';
import PaymentDetailModal from '../../components/PaymentDetailModal';

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
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [expandedFamilies, setExpandedFamilies] = useState({});

  const buildQueryParams = (values) => {
    return Object.entries(values).reduce((params, [key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        params[key] = value;
      }
      return params;
    }, {});
  };

  const load = async (queryFilters = filters, page = pagination.page, limit = pagination.limit) => {
    try {
      const params = { ...buildQueryParams(queryFilters), page, limit };
      const txRes = await api.get('/payments/transactions', { params });
      const uniqueTransactions = [...new Map((txRes.data.transactions || []).map((tx) => [tx.id, tx])).values()]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTransactions(uniqueTransactions);
      setPagination((prev) => ({
        ...prev,
        total: txRes.data.total || 0,
        totalPages: txRes.data.totalPages || 1,
        page: txRes.data.page || page,
        limit: txRes.data.limit || limit,
      }));
    } catch (e) {
      console.error('Impossible de charger les transactions', e);
      toast.error('Impossible de charger les transactions');
    }
  };

  const formatPaymentMethodLabel = (transaction = {}) => {
    const payment = transaction.payment || {};
    const method = transaction.method || payment.method || payment.paymentMethod;
    const metadata = payment.metadata || transaction.metadata || {};
    const bankDebitIban = metadata.bankDebitIban || payment.bankDebitIban || transaction.bankDebitIban;

    if (method === 'PRELEVEMENT_BANCAIRE') return 'Prélèvement';
    if (method === 'VIREMENT' && bankDebitIban) return 'Prélèvement';
    if (method === 'STRIPE_SEPA' || method === 'GO_CARDLESS_SEPA') return 'Prélèvement SEPA';
    if (method === 'CB' || method === 'STRIPE_CARD') return 'Carte bancaire';
    if (method === 'CHEQUE') return 'Chèque';
    if (method === 'ESPECES') return 'Espèces';
    return method || '-';
  };

  const handleTransactionAction = async (tx, action) => {
    const actionLabel = action === 'SUCCEEDED' ? 'valider' : 'annuler';
    const confirmed = window.confirm(`Confirmer la décision de ${actionLabel} ce paiement ?`);
    if (!confirmed) return;

    try {
      await api.patch(`/payments/transactions/${tx.id}`, { status: action });
      toast.success(action === 'SUCCEEDED' ? 'Paiement validé' : 'Paiement annulé');
      await load(filters, pagination.page, pagination.limit);
    } catch (err) {
      console.error('Erreur mise à jour transaction', err);
      const serverMsg = err?.response?.data?.error;
      toast.error(serverMsg || 'Impossible de mettre à jour le paiement');
    }
  };

  const openDetailModal = (tx) => {
    setSelectedTransaction(tx);
  };

  const closeDetailModal = () => {
    setSelectedTransaction(null);
  };

  useEffect(() => {
    load(filters, pagination.page, pagination.limit);
  }, [pagination.page, pagination.limit]);

  const applyFilters = () => {
    setPagination((prev) => ({ ...prev, page: 1 }));
    load(filters, 1, pagination.limit);
  };

  const resetFilters = () => {
    const reset = { familyName: '', payerName: '', status: '', startDate: '', endDate: '', minAmount: '', maxAmount: '' };
    setFilters(reset);
    setPagination((prev) => ({ ...prev, page: 1 }));
    load(reset, 1, pagination.limit);
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

  const groupedTransactions = useMemo(() => {
    const groups = new Map();
    for (const tx of transactions) {
      const familyId = tx.payment?.familyId || tx.familyId || tx.paymentId || 'unknown';
      const familyName = tx.familyName || tx.payment?.family?.familyName || '-';
      if (!groups.has(familyId)) {
        groups.set(familyId, { familyId, familyName, transactions: [], totalAmount: 0 });
      }
      const g = groups.get(familyId);
      g.transactions.push(tx);
      const txStatus = String(tx.status || '').toUpperCase();
      if (txStatus !== 'CANCELLED' && txStatus !== 'ANNULÉ' && txStatus !== 'ANNULE') {
        g.totalAmount += Number(tx.amount) || 0;
      }
    }
    return [...groups.values()].sort((a, b) => a.familyName.localeCompare(b.familyName, 'fr'));
  }, [transactions]);

  const toggleFamily = (familyId) => {
    setExpandedFamilies((prev) => ({ ...prev, [familyId]: prev[familyId] === false ? true : false }));
  };

  const isFamilyExpanded = (familyId) => expandedFamilies[familyId] !== false;

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Paiements (Administration)</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Recherche</h3>
        <form onSubmit={(e) => { e.preventDefault(); applyFilters(); }} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
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
              <button className="btn btn-secondary" type="submit">Filtrer</button>
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
        </form>
      </div>

      <div className="card">
        <h3>Historique transactions</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
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
              {groupedTransactions.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '24px 0', color: '#6B7280' }}>
                    Aucune transaction trouvée
                  </td>
                </tr>
              ) : (
                groupedTransactions.map((group) => (
                  <Fragment key={group.familyId}>
                    {/* Ligne en-tête famille */}
                    <tr
                      onClick={() => toggleFamily(group.familyId)}
                      style={{ background: '#EFF6FF', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <td colSpan="8" style={{ padding: '9px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, color: '#3B82F6', minWidth: 10 }}>
                            {isFamilyExpanded(group.familyId) ? '▼' : '▶'}
                          </span>
                          <strong style={{ fontSize: 14, color: '#1E3A5F' }}>{group.familyName}</strong>
                          <span style={{ fontSize: 11, fontWeight: 600, background: '#DBEAFE', color: '#1D4ED8', borderRadius: 999, padding: '2px 8px' }}>
                            {group.transactions.length} paiement{group.transactions.length > 1 ? 's' : ''}
                          </span>
                          <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13, color: '#1E3A5F' }}>
                            Total : {group.totalAmount.toFixed(2)} €
                          </span>
                        </div>
                      </td>
                    </tr>
                    {/* Lignes transactions */}
                    {isFamilyExpanded(group.familyId) && group.transactions.map((t) => (
                      <tr key={t.id} style={{ background: '#fff' }}>
                        <td style={{ paddingLeft: 28 }}>{new Date(t.createdAt).toLocaleString('fr-FR')}</td>
                        <td style={{ color: '#6B7280', fontSize: 12 }}>—</td>
                        <td>{t.payerName || '-'}</td>
                        <td>{formatPaymentMethodLabel(t)}</td>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                            {String(t.status) === 'INITIATED' && (
                              <>
                                <button
                                  className="btn btn-success btn-sm"
                                  title="Valider"
                                  onClick={() => handleTransactionAction(t, 'SUCCEEDED')}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', width: 30, height: 30, lineHeight: 0 }}
                                >
                                  <FiCheckCircle size={14} />
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  title="Annuler"
                                  onClick={() => handleTransactionAction(t, 'CANCELLED')}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', width: 30, height: 30, lineHeight: 0 }}
                                >
                                  <FiXCircle size={14} />
                                </button>
                              </>
                            )}
                            <button
                              className="btn btn-outline btn-sm"
                              title="Détail"
                              onClick={() => openDetailModal(t)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', width: 30, height: 30, lineHeight: 0 }}
                            >
                              <FiEye size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: '#6B7280' }}>
              Affichage {transactions.length} / {pagination.total} • Page {pagination.page} / {pagination.totalPages}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
              >
                Précédent
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(prev.page + 1, prev.totalPages) }))}
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
      <PaymentDetailModal
        transaction={selectedTransaction}
        isOpen={Boolean(selectedTransaction)}
        onClose={closeDetailModal}
        onRefundCreated={() => load(filters, pagination.page, pagination.limit)}
      />
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
