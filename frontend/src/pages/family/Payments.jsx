import { useEffect, useState } from 'react';
import api from '../../api/axios';

export default function FamilyPayments() {
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    api.get('/payments/history/family').then(({ data }) => setPayments(data.payments || [])).catch(console.error);
  }, []);

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Mes paiements</h2>
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Référence</th><th>Total</th><th>Payé</th><th>Statut</th><th>Méthode</th></tr>
            </thead>
            <tbody>
              {payments.length === 0 ? <tr><td colSpan="5">Aucun paiement.</td></tr> : payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{Number(p.totalAmount).toFixed(2)} €</td>
                  <td>{Number(p.paidAmount).toFixed(2)} €</td>
                  <td>{p.status}</td>
                  <td>{p.paymentMethod || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
