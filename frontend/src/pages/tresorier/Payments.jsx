import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const statusOptions = [
  { value: 'UPCOMING', label: 'À venir' },
  { value: 'PAID', label: 'Payé' },
  { value: 'FAILED', label: 'Impayé' },
  { value: 'CANCELLED', label: 'Annulé' },
];

export default function TresorierPayments() {
  const [transactions, setTransactions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ paymentId: '', amount: '', method: 'CHEQUE', description: '', transactionRef: '' });

  const load = async () => {
    try {
      const [txRes, plansRes] = await Promise.all([
        api.get('/payments/transactions'),
        api.get('/payments/cheques/plans'),
      ]);
      setTransactions(txRes.data.transactions || []);
      setPlans(plansRes.data.plans || []);
    } catch {
      toast.error('Impossible de charger les transactions');
    }
  };

  useEffect(() => { load(); }, []);

  const submitOffline = async (e) => {
    e.preventDefault();
    try {
      await api.post('/payments/offline', {
        ...form,
        amount: Number(form.amount),
      });
      toast.success('Paiement hors ligne enregistré');
      setForm({ paymentId: '', amount: '', method: 'CHEQUE', description: '', transactionRef: '' });
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
        <form onSubmit={submitOffline} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <input className="form-control" placeholder="ID paiement" value={form.paymentId} onChange={(e) => setForm((p) => ({ ...p, paymentId: e.target.value }))} required />
          <input className="form-control" placeholder="Montant" type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
          <select className="form-control" value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}>
            <option value="CHEQUE">Chèque</option>
            <option value="ESPECES">Espèces</option>
            <option value="VIREMENT">Virement</option>
          </select>
          <input className="form-control" placeholder="Référence transaction" value={form.transactionRef} onChange={(e) => setForm((p) => ({ ...p, transactionRef: e.target.value }))} />
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
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Paiement</th>
                <th>Méthode</th>
                <th>Montant</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.createdAt).toLocaleString('fr-FR')}</td>
                  <td>{t.paymentId}</td>
                  <td>{t.method}</td>
                  <td>{Number(t.amount).toFixed(2)} €</td>
                  <td>{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
