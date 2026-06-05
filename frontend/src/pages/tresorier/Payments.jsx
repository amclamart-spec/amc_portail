import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiDownload, FiEye, FiPlus, FiXCircle } from 'react-icons/fi';
import PaymentDetailModal from '../../components/PaymentDetailModal';

const statusOptions = [
  { value: 'UPCOMING', label: 'À venir' },
  { value: 'PAID', label: 'Payé' },
  { value: 'FAILED', label: 'Impayé' },
  { value: 'CANCELLED', label: 'Annulé' },
];

const transactionStatusOptions = [
  { value: '', label: 'Tous' },
  { value: 'INITIATED', label: 'Initié' },
  { value: 'SUCCEEDED', label: 'Payé' },
  { value: 'FAILED', label: 'Échoué' },
  { value: 'CANCELLED', label: 'Annulé' },
];

const TRANSACTIONS_PER_PAGE = 20;

export default function TresorierPayments({ scope = 'all' }) {
  const [transactions, setTransactions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [form, setForm] = useState({
    amount: '',
    method: 'CHEQUE',
    description: '',
    payerName: '',
    chequeCount: '1',
    chequeFirstDepositDate: '',
    chequeDepositDay: '10',
    bankDebitIban: '',
    bankDebitSwift: '',
    bankDebitDay: '10',
    firstPaymentDate: '',
    numberOfInstallments: '1',
  });
  const [filters, setFilters] = useState({ payerName: '', status: '', startDate: '', endDate: '', minAmount: '', maxAmount: '' });
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [selectedChequePlan, setSelectedChequePlan] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [securityCode, setSecurityCode] = useState(null);
  const [codeExpiration, setCodeExpiration] = useState(null);

  const buildQueryParams = (values) => {
    return Object.entries(values).reduce((params, [key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        params[key] = value;
      }
      return params;
    }, {});
  };

  const applyClientFilters = (txList, activeFilters = {}) => {
    const payerNeedle = String(activeFilters.payerName || '').trim().toLowerCase();
    const statusNeedle = String(activeFilters.status || '').trim();
    const minAmount = activeFilters.minAmount !== '' && activeFilters.minAmount !== undefined && activeFilters.minAmount !== null
      ? Number(activeFilters.minAmount)
      : null;
    const maxAmount = activeFilters.maxAmount !== '' && activeFilters.maxAmount !== undefined && activeFilters.maxAmount !== null
      ? Number(activeFilters.maxAmount)
      : null;
    const startDate = activeFilters.startDate ? new Date(`${activeFilters.startDate}T00:00:00`) : null;
    const endDate = activeFilters.endDate ? new Date(`${activeFilters.endDate}T23:59:59`) : null;

    return txList.filter((tx) => {
      if (payerNeedle) {
        const payer = String(tx.payerName || tx.payment?.family?.familyName || '').toLowerCase();
        if (!payer.includes(payerNeedle)) return false;
      }
      if (statusNeedle && String(tx.status) !== statusNeedle) return false;

      const createdAt = tx.createdAt ? new Date(tx.createdAt) : null;
      if (startDate && createdAt && createdAt < startDate) return false;
      if (endDate && createdAt && createdAt > endDate) return false;

      const amount = Number(tx.amount || 0);
      if (Number.isFinite(minAmount) && amount < minAmount) return false;
      if (Number.isFinite(maxAmount) && amount > maxAmount) return false;

      return true;
    });
  };

  const load = async (queryFilters = filters) => {
    try {
      const [txRes, plansRes] = await Promise.all([
        api.get('/payments/transactions', { params: buildQueryParams(queryFilters) }),
        api.get('/payments/cheques/plans'),
      ]);
      const txList = txRes.data.transactions || [];
      const filteredTxList = applyClientFilters(txList, queryFilters);
      const scopedTransactions = scope === 'plans'
        ? filteredTxList.filter((tx) => String(tx.method || tx.payment?.paymentMethod || '').toUpperCase() === 'CHEQUE')
        : scope === 'debits'
          ? filteredTxList.filter((tx) => ['VIREMENT', 'PRELEVEMENT_BANCAIRE', 'SEPA'].includes(String(tx.method || tx.payment?.paymentMethod || '').toUpperCase()))
          : filteredTxList;

      setTransactions(scopedTransactions);
      setPlans(plansRes.data.plans || []);
    } catch {
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

  const resetOfflineForm = () => {
    setForm({
      amount: '',
      method: 'CHEQUE',
      description: '',
      payerName: '',
      chequeCount: '1',
      chequeFirstDepositDate: '',
      chequeDepositDay: '10',
      bankDebitIban: '',
      bankDebitSwift: '',
      bankDebitDay: '10',
      firstPaymentDate: '',
      numberOfInstallments: '1',
    });
  };

  const openOfflineModal = () => {
    resetOfflineForm();
    setShowOfflineModal(true);
  };

  const closeOfflineModal = () => {
    setShowOfflineModal(false);
  };

  const handleTransactionAction = async (tx, action) => {
    const isCancelAction = action === 'CANCELLED';
    const confirmationMessage = isCancelAction
      ? `Confirmer l'annulation de ce paiement (statut actuel : ${txStatusLabel(tx.status)}) ?`
      : 'Confirmer la validation de ce paiement ?';
    const confirmed = window.confirm(confirmationMessage);
    if (!confirmed) return;

    try {
      await api.patch(`/payments/transactions/${tx.id}`, { status: action });
      toast.success(action === 'SUCCEEDED' ? 'Paiement validé' : 'Paiement annulé');
      await load(filters);
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

  const openChequePlanModal = (plan) => {
    setSelectedChequePlan(plan);
  };

  const closeChequePlanModal = () => {
    setSelectedChequePlan(null);
  };

  useEffect(() => { load(); setCurrentPage(1); }, [scope]);

  const applyFilters = () => {
    setCurrentPage(1);
    load(filters);
  };
  const resetFilters = () => {
    const reset = { payerName: '', status: '', startDate: '', endDate: '', minAmount: '', maxAmount: '' };
    setFilters(reset);
    setCurrentPage(1);
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
    } catch {
      toast.error('Erreur export Excel');
    }
  };

  const normalizeText = (v) => String(v || '').trim().toLowerCase();

  const resolveAutoPaymentId = () => {
    const payer = normalizeText(form.payerName);
    const sorted = [...transactions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const withRemaining = sorted.find((t) => {
      const tPayer = normalizeText(t.payerName);
      const samePayer = payer ? tPayer.includes(payer) || payer.includes(tPayer) : true;
      const total = Number(t.payment?.totalAmount || 0);
      const paid = Number(t.payment?.paidAmount || 0);
      return samePayer && t.paymentId && paid < total;
    });

    if (withRemaining?.paymentId) return withRemaining.paymentId;
    return sorted.find((t) => t.paymentId)?.paymentId || null;
  };

  const submitOffline = async (e) => {
    e.preventDefault();
    const computedPaymentId = resolveAutoPaymentId();
    if (!computedPaymentId) {
      toast.error('Aucun paiement à rattacher automatiquement.');
      return;
    }

    const payload = {
      paymentId: computedPaymentId,
      amount: Number(form.amount),
      method: form.method,
      description: form.description,
      payerName: form.payerName,
    };

    if (form.method === 'CHEQUE') {
      payload.chequeCount = Number(form.chequeCount);
      payload.chequeFirstDepositDate = form.chequeFirstDepositDate || undefined;
      payload.chequeDepositDay = Number(form.chequeDepositDay);
    }

    if (form.method === 'VIREMENT') {
      payload.bankDebitIban = form.bankDebitIban;
      payload.bankDebitSwift = form.bankDebitSwift;
      payload.bankDebitDay = Number(form.bankDebitDay);
      payload.firstPaymentDate = form.firstPaymentDate || undefined;
      payload.numberOfInstallments = Number(form.numberOfInstallments);
    }

    try {
      await api.post('/payments/offline', payload);
      toast.success('Paiement hors ligne enregistré');
      closeOfflineModal();
      resetOfflineForm();
      load(filters);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur enregistrement paiement');
    }
  };

  const updateInstallmentStatus = async (installmentId, status) => {
    try {
      await api.patch(`/payments/cheques/installments/${installmentId}`, { status });
      const { data } = await api.get('/payments/cheques/plans');
      const refreshedPlans = data.plans || [];
      setPlans(refreshedPlans);
      if (selectedChequePlan?.id) {
        const refreshedPlan = refreshedPlans.find((p) => p.id === selectedChequePlan.id);
        setSelectedChequePlan(refreshedPlan || null);
      }
      await load(filters);
      toast.success('Échéance mise à jour');
    } catch {
      toast.error('Erreur de mise à jour');
    }
  };

  const generateSecurityCode = async () => {
    setGeneratingCode(true);
    try {
      const { data } = await api.post('/payments/refunds/security/generate');
      setSecurityCode(data.code);
      setCodeExpiration(data.expiresAt);
      toast.success('Code de sécurité généré avec succès');
      navigator.clipboard.writeText(data.code);
      toast.success('Code copié dans le presse-papiers');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de générer le code');
    } finally {
      setGeneratingCode(false);
    }
  };

  const formatDate = (value) => {
    try {
      return new Date(value).toLocaleDateString('fr-FR');
    } catch {
      return '—';
    }
  };

  const totalPages = Math.max(1, Math.ceil(transactions.length / TRANSACTIONS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTransactions = transactions.slice(
    (safeCurrentPage - 1) * TRANSACTIONS_PER_PAGE,
    safeCurrentPage * TRANSACTIONS_PER_PAGE,
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>
        {scope === 'plans' ? 'Gestion des échéanciers' : scope === 'debits' ? 'Gestion des prélèvements' : 'Gestion des paiements'}
      </h2>

      {scope !== 'plans' && (
        <div className="card" style={{ marginBottom: 16, padding: '16px', backgroundColor: '#f0f9ff', borderLeft: '4px solid var(--amc-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Code de sécurité remboursement</strong>
              {securityCode && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '18px', fontFamily: 'monospace', letterSpacing: '4px', color: 'var(--amc-primary)' }}>
                    {securityCode}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                    Expire le {formatDate(codeExpiration)} à {new Date(codeExpiration).toLocaleTimeString('fr-FR')}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={generateSecurityCode}
              disabled={generatingCode}
              style={{ marginLeft: 16 }}
            >
              {generatingCode ? 'Génération...' : 'Générer un code'}
            </button>
          </div>
        </div>
      )}

      {scope === 'all' && (
        <div style={{ marginBottom: 16 }}>
          <button type="button" className="btn btn-primary" onClick={openOfflineModal}>
            <FiPlus size={16} /> Ajouter un paiement
          </button>
        </div>
      )}


      <div className="card" style={{ marginTop: scope === 'plans' ? 0 : undefined }}>
        <h3>{scope === 'plans' ? 'Paiements chèque' : 'Historique transactions'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); applyFilters(); }} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
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
            <input
              className="form-control"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
            />
            <input
              className="form-control"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
            <input
              className="form-control"
              placeholder="Montant min"
              type="number"
              step="0.01"
              value={filters.minAmount}
              onChange={(e) => setFilters((prev) => ({ ...prev, minAmount: e.target.value }))}
            />
            <input
              className="form-control"
              placeholder="Montant max"
              type="number"
              step="0.01"
              value={filters.maxAmount}
              onChange={(e) => setFilters((prev) => ({ ...prev, maxAmount: e.target.value }))}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" type="submit">Filtrer</button>
              <button className="btn btn-outline" type="button" onClick={resetFilters}>Réinitialiser</button>
            </div>
          </div>
          <button className="btn btn-primary" type="button" onClick={exportPayments} style={{ width: 'fit-content' }}>
            Exporter Excel
          </button>
        </form>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payeur</th>
                <th>Méthode</th>
                <th>Montant</th>
                <th>Statut</th>
                <th>Reçu</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.createdAt).toLocaleString('fr-FR')}</td>
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
                          toast.error('Impossible de télécharger le reçu de paiement');
                        }
                      }}
                    >
                      <FiDownload size={16} /> Reçu
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                      {scope !== 'plans' && String(t.status) !== 'CANCELLED' && (
                        <button
                          className="btn btn-danger btn-sm"
                          title="Annuler"
                          onClick={() => handleTransactionAction(t, 'CANCELLED')}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', width: 30, height: 30, lineHeight: 0 }}
                        >
                          <FiXCircle size={14} />
                        </button>
                      )}
                      <button
                        className="btn btn-outline btn-sm"
                        title="Détail"
                        onClick={() => openDetailModal(t)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', width: 30, height: 30, lineHeight: 0 }}
                      >
                        <FiEye size={14} />
                      </button>
                      {scope === 'plans' && (
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          onClick={() => {
                            const matchingPlan = plans.find((plan) => plan.paymentId === t.paymentId);
                            if (!matchingPlan) {
                              toast.error('Aucun échéancier trouvé pour ce paiement');
                              return;
                            }
                            openChequePlanModal(matchingPlan);
                          }}
                        >
                          Échéances
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            {transactions.length === 0
              ? '0 résultat'
              : `${(safeCurrentPage - 1) * TRANSACTIONS_PER_PAGE + 1}-${Math.min(safeCurrentPage * TRANSACTIONS_PER_PAGE, transactions.length)} sur ${transactions.length}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Précédent
            </button>
            <span style={{ fontSize: 13 }}>
              Page {safeCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Suivant
            </button>
          </div>
        </div>
      </div>
      {showOfflineModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: 'min(820px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Ajouter un paiement hors ligne</h3>
              <button type="button" className="btn btn-outline" onClick={closeOfflineModal}>Fermer</button>
            </div>
            <form onSubmit={submitOffline} style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label>Montant</label>
                  <input className="form-control" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label>Méthode</label>
                  <select className="form-control" value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}>
                    <option value="CHEQUE">Chèque</option>
                    <option value="ESPECES">Espèces</option>
                    <option value="VIREMENT">Prélèvement</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label>Nom du payeur</label>
                  <input className="form-control" value={form.payerName} onChange={(e) => setForm((p) => ({ ...p, payerName: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label>Description</label>
                  <input className="form-control" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                </div>
              </div>

              {form.method === 'VIREMENT' && (
                <div style={{ display: 'grid', gap: 12, border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}>
                  <strong>Détails prélèvement</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label>IBAN</label>
                      <input className="form-control" value={form.bankDebitIban} onChange={(e) => setForm((p) => ({ ...p, bankDebitIban: e.target.value }))} required />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label>BIC / SWIFT</label>
                      <input className="form-control" value={form.bankDebitSwift} onChange={(e) => setForm((p) => ({ ...p, bankDebitSwift: e.target.value }))} required />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label>Jour de prélèvement</label>
                      <select className="form-control" value={form.bankDebitDay} onChange={(e) => setForm((p) => ({ ...p, bankDebitDay: e.target.value }))}>
                        <option value="10">Jour 10</option>
                        <option value="20">Jour 20</option>
                        <option value="30">Jour 30</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label>Nombre d'échéances</label>
                      <input className="form-control" type="number" min="1" max="12" value={form.numberOfInstallments} onChange={(e) => setForm((p) => ({ ...p, numberOfInstallments: e.target.value }))} />
                    </div>
                    <div style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
                      <label>Date du premier prélèvement</label>
                      <input className="form-control" type="date" value={form.firstPaymentDate} onChange={(e) => setForm((p) => ({ ...p, firstPaymentDate: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {form.method === 'CHEQUE' && (
                <div style={{ display: 'grid', gap: 12, border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}>
                  <strong>Détails chèque</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label>Nombre de chèques</label>
                      <input className="form-control" type="number" min="1" max="12" value={form.chequeCount} onChange={(e) => setForm((p) => ({ ...p, chequeCount: e.target.value }))} required />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label>Jour dépôt</label>
                      <select className="form-control" value={form.chequeDepositDay} onChange={(e) => setForm((p) => ({ ...p, chequeDepositDay: e.target.value }))}>
                        <option value="10">Jour 10</option>
                        <option value="20">Jour 20</option>
                        <option value="30">Jour 30</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
                      <label>Date premier dépôt</label>
                      <input className="form-control" type="date" value={form.chequeFirstDepositDate} onChange={(e) => setForm((p) => ({ ...p, chequeFirstDepositDate: e.target.value }))} required />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-outline" type="button" onClick={closeOfflineModal}>Annuler</button>
                <button className="btn btn-primary" type="submit">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedChequePlan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: 'min(920px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Échéances paiement #{selectedChequePlan.paymentId?.slice(0, 8) || '-'}</h3>
              <button type="button" className="btn btn-outline" onClick={closeChequePlanModal}>Fermer</button>
            </div>
            <div style={{ marginBottom: 12, color: '#64748B' }}>
              Famille: <strong>{selectedChequePlan.family?.familyName || 'Famille'}</strong> · Montant total: <strong>{Number(selectedChequePlan.totalAmount || 0).toFixed(2)} €</strong>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Montant</th>
                    <th>Échéance</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedChequePlan.payment?.installments || []).map((inst) => (
                    <tr key={inst.id}>
                      <td>{inst.installmentNumber}</td>
                      <td>{Number(inst.amount).toFixed(2)} €</td>
                      <td>{new Date(inst.dueDate).toLocaleDateString('fr-FR')}</td>
                      <td>
                        <select className="form-control" value={inst.status} onChange={(e) => updateInstallmentStatus(inst.id, e.target.value)}>
                          {statusOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <PaymentDetailModal
        transaction={selectedTransaction}
        isOpen={Boolean(selectedTransaction)}
        onClose={closeDetailModal}
        onRefundCreated={() => load(filters)}
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
