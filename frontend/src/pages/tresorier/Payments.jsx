import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiDownload, FiEye, FiXCircle } from 'react-icons/fi';
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

export default function TresorierPayments() {
  const [transactions, setTransactions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ amount: '', method: 'CHEQUE', description: '', payerName: '' });
  const [filters, setFilters] = useState({ payerName: '', status: '', startDate: '', endDate: '', minAmount: '', maxAmount: '' });
  const [selectedTransaction, setSelectedTransaction] = useState(null);
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

  const load = async (queryFilters = {}) => {
    try {
      const [txRes, plansRes] = await Promise.all([
        api.get('/payments/transactions', { params: buildQueryParams(queryFilters) }),
        api.get('/payments/cheques/plans'),
      ]);
      setTransactions(txRes.data.transactions || []);
      setPlans(plansRes.data.plans || []);
    } catch {
      toast.error('Impossible de charger les transactions');
    }
  };

  const handleTransactionAction = async (tx, action) => {
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

  useEffect(() => { load(); }, []);

  const applyFilters = () => load(filters);
  const resetFilters = () => {
    const reset = { payerName: '', status: '', startDate: '', endDate: '', minAmount: '', maxAmount: '' };
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
    } catch {
      toast.error('Erreur export Excel');
    }
  };

  const submitOffline = async (e) => {
    e.preventDefault();
    try {
      await api.post('/payments/offline', {
        amount: Number(form.amount),
        method: form.method,
        description: form.description,
        payerName: form.payerName,
      });

      toast.success('Paiement hors ligne enregistré');
      setForm({ amount: '', method: 'CHEQUE', description: '', payerName: '' });
      load();
    } catch {
      toast.error('Erreur enregistrement paiement');
    }
  };

  const updateInstallmentStatus = async (installmentId, status) => {
    try {
      await api.patch(`/payments/cheques/installments/${installmentId}`, { status });
      toast.success('Échéance mise à jour');
      load();
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

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des paiements</h2>

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

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Paiement hors ligne</h3>
        <form onSubmit={submitOffline} style={{ display: 'grid', gridTemplateColumns: '220px 220px 1fr', gap: 12, alignItems: 'end' }}>
          <input className="form-control" placeholder="Montant" type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required style={{ maxWidth: 220 }} />
          <select className="form-control" value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))} style={{ maxWidth: 220 }}>
            <option value="CHEQUE">Chèque</option>
            <option value="ESPECES">Espèces</option>
            <option value="VIREMENT">Virement</option>
          </select>
          <input className="form-control" placeholder="Nom du payeur" value={form.payerName} onChange={(e) => setForm((p) => ({ ...p, payerName: e.target.value }))} />
          <input className="form-control" placeholder="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} style={{ gridColumn: '1 / -1' }} />
          <button className="btn btn-primary" type="submit" style={{ width: 'fit-content' }}>Enregistrer</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Échéanciers chèques</h3>
        {plans.length === 0 ? <p>Aucun échéancier chèque pour le moment.</p> : (
          <div style={{ display: 'grid', gap: 12 }}>
            {plans.map((plan) => (
              <div key={plan.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>{plan.family?.familyName || 'Famille'}</strong>
                  <span className="badge badge-info">{Number(plan.totalAmount).toFixed(2)} €</span>
                </div>
                <div style={{ fontSize: 13, color: '#64748B', marginBottom: 10 }}>Plan #{plan.id.slice(0, 8)} — {plan.status}</div>

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
                      {plan.payment?.installments?.map((inst) => (
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
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Historique transactions</h3>
        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
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
              <button className="btn btn-secondary" type="button" onClick={applyFilters}>Filtrer</button>
              <button className="btn btn-outline" type="button" onClick={resetFilters}>Réinitialiser</button>
            </div>
          </div>
          <button className="btn btn-primary" type="button" onClick={exportPayments} style={{ width: 'fit-content' }}>
            Exporter Excel
          </button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Paiement</th>
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
            </tbody>
          </table>
        </div>
      </div>
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
