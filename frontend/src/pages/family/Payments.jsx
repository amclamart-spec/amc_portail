import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { FiDownload } from 'react-icons/fi';

const formatPaymentMethod = (payment) => {
  if (payment.provider === 'STRIPE' || payment.paymentMethod === 'CB' || payment.paymentMethod === 'STRIPE') {
    return 'Carte bancaire (Stripe)';
  }
  if (payment.paymentMethod === 'SEPA' || payment.provider === 'GOCARDLESS') {
    return 'Prélèvement SEPA';
  }
  if (payment.paymentMethod === 'CHEQUE') {
    return 'Chèque';
  }
  if (payment.paymentMethod === 'ESPECES') {
    return 'Espèces';
  }
  if (payment.paymentMethod === 'VIREMENT') {
    return 'Virement';
  }
  if (payment.paymentMethod === 'PAYPAL' || payment.provider === 'PAYPAL') {
    return 'PayPal';
  }
  return payment.paymentMethod || payment.provider || '-';
};

export default function FamilyPayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/payments/history/family')
      .then(({ data }) => {
        setPayments(data.payments || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('FamilyPayments error:', err);
        const serverMessage = err.response?.data?.error;
        if (err.response?.status === 403 && err.response?.data?.code === 'ACCOUNT_PENDING') {
          setError('Votre compte est en attente de validation. L’historique des paiements sera disponible une fois votre compte validé.');
        } else {
          setError(serverMessage || 'Impossible de charger l’historique des paiements.');
        }
        setLoading(false);
      });
  }, []);

  const handleDownloadInvoice = async (paymentId) => {
    try {
      setDownloading(paymentId);
      const response = await api.get(`/payments/${paymentId}/invoice/download`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `facture-${paymentId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur téléchargement facture:', error);
      const errorMessage = error.response?.data?.error || 'Erreur lors du téléchargement de la facture';
      alert(errorMessage);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>Mes paiements</h2>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Date</th>
                <th>Total</th>
                <th>Payé</th>
                <th>Statut</th>
                <th>Méthode</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7">Chargement des paiements...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan="7">Aucun paiement.</td></tr>
              ) : payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.id.substring(0, 8).toUpperCase()}</td>
                  <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : '-'}</td>
                  <td>{Number(p.totalAmount).toFixed(2)} €</td>
                  <td>{Number(p.paidAmount).toFixed(2)} €</td>
                  <td>
                    <span className={`badge badge-${p.status === 'COMPLETED' ? 'success' : 'info'}`}>
                      {p.status === 'COMPLETED' ? 'Payé' : p.status}
                    </span>
                  </td>
                  <td>{formatPaymentMethod(p)}</td>
                  <td>
                    {p.status === 'COMPLETED' && (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleDownloadInvoice(p.id)}
                        disabled={downloading === p.id}
                        title="Télécharger la facture"
                      >
                        <FiDownload size={16} /> {downloading === p.id ? 'Téléchargement...' : 'Facture'}
                      </button>
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
