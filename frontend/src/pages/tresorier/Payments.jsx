import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiDownload } from 'react-icons/fi';

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

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Gestion des paiements</h2>

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
                    {t.payment?.metadata?.receiptUrl ? (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={async () => {
                          try {
                            const response = await api.get(`/payments/${t.paymentId}/invoice/download`, { responseType: 'blob' });
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
                    ) : (
                      <span>Non dispo</span>
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
