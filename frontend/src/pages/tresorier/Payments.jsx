import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function TresorierPayments() {
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState({ paymentId: '', amount: '', method: 'CHEQUE', description: '', transactionRef: '' });

  const load = async () => {
    try {
      const { data } = await api.get('/payments/transactions');
      setTransactions(data.transactions || []);
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
