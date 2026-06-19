import { useEffect, useState } from "react";
import api from "../../api/axios";
import { FiDownload } from "react-icons/fi";

const formatPaymentMethod = (payment) => {
  if (payment.provider === "STRIPE" || payment.paymentMethod === "CB" || payment.paymentMethod === "STRIPE") {
    return "Carte bancaire (Stripe)";
  }
  if (payment.paymentMethod === "SEPA" || payment.provider === "GOCARDLESS") {
    return "Prélèvement SEPA";
  }
  if (payment.paymentMethod === "CHEQUE") {
    return "Chèque";
  }
  if (payment.paymentMethod === "ESPECES") {
    return "Espèces";
  }
  if (payment.paymentMethod === "VIREMENT") {
    return "Virement";
  }
  if (payment.paymentMethod === "PAYPAL" || payment.provider === "PAYPAL") {
    return "PayPal";
  }
  return payment.paymentMethod || payment.provider || "-";
};

export default function FamilyPayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/payments/history/family")
      .then(({ data }) => {
        const uniquePayments = [...new Map((data.payments || []).map((payment) => [payment.id, payment])).values()];
        setPayments(uniquePayments);
        setLoading(false);
      })
      .catch((err) => {
        console.error("FamilyPayments error:", err);
        const serverMessage = err.response?.data?.error;
        if (err.response?.status === 403 && err.response?.data?.code === "ACCOUNT_PENDING") {
          setError("Votre compte est en attente de validation. L\''historique des paiements sera disponible une fois votre compte validé.");
        } else {
          setError(serverMessage || "Impossible de charger l\''historique des paiements.");
        }
        setLoading(false);
      });
  }, []);

  const handleDownloadInvoice = async (paymentId) => {
    try {
      setDownloading(paymentId);
      const response = await api.get(`/payments/${paymentId}/invoice/download`, {
        responseType: "blob",
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `recu-${paymentId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erreur téléchargement reçu:", error);
      const errorMessage = error.response?.data?.error || "Erreur lors du téléchargement du reçu";
      alert(errorMessage);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadSepaMandate = async (paymentId) => {
    try {
      setDownloading(paymentId);
      const response = await api.get(`/payments/${paymentId}/sepa-mandate/download`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `mandat-sepa-${paymentId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erreur téléchargement mandat SEPA:", error);
      const errorMessage = error.response?.data?.error || "Erreur lors du téléchargement du mandat SEPA";
      alert(errorMessage);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <h2 style={{ color: "var(--amc-primary)" }}>Mes paiements</h2>
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
                <th>Reçu de paiement</th>
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
                  <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString("fr-FR") : "-"}</td>
                  <td>{Number(p.totalAmount).toFixed(2)} €</td>
                  <td>{Number(p.paidAmount).toFixed(2)} €</td>
                  <td>
                    {(() => {
                      const statusMap = {
                        COMPLETED: { label: 'Payé', cls: 'success' },
                        PARTIAL:   { label: 'Partiel', cls: 'warning' },
                        PENDING:   { label: 'En attente', cls: 'info' },
                        CANCELLED: { label: 'Annulé', cls: 'danger' },
                        FAILED:    { label: 'Échoué', cls: 'danger' },
                      };
                      const s = statusMap[p.status] || { label: p.status || '—', cls: 'info' };
                      return <span className={`badge badge-${s.cls}`}>{s.label}</span>;
                    })()}
                  </td>
                  <td>{formatPaymentMethod(p)}</td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleDownloadInvoice(p.id)}
                      disabled={downloading === p.id}
                      title="Télécharger le reçu de paiement"
                      style={{ marginRight: 8 }}
                    >
                      <FiDownload size={16} /> {downloading === p.id ? "Téléchargement..." : "Reçu"}
                    </button>
                    {p.paymentMethod === "SEPA" && p.provider === "STRIPE" && (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleDownloadSepaMandate(p.id)}
                        disabled={downloading === p.id}
                        title="Télécharger le mandat SEPA"
                      >
                        <FiDownload size={16} /> Mandat
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
