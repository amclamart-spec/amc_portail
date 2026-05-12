import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { FiDownload } from 'react-icons/fi';

export default function FamilyPayments() {
  const [payments, setPayments] = useState([]);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    api.get('/payments/history/family').then(({ data }) => setPayments(data.payments || [])).catch(console.error);
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
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Référence</th><th>Total</th><th>Payé</th><th>Statut</th><th>Méthode</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {payments.length === 0 ? <tr><td colSpan="6">Aucun paiement.</td></tr> : payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.id.substring(0, 8).toUpperCase()}</td>
                  <td>{Number(p.totalAmount).toFixed(2)} €</td>
                  <td>{Number(p.paidAmount).toFixed(2)} €</td>
                  <td>
                    <span className={`badge badge-${p.status === 'COMPLETED' ? 'success' : 'info'}`}>
                      {p.status === 'COMPLETED' ? 'Payé' : p.status}
                    </span>
                  </td>
                  <td>{p.paymentMethod || '-'}</td>
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
