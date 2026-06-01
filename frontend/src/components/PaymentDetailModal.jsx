import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const paymentStatusLabels = {
  SUCCEEDED: 'Payé',
  COMPLETED: 'Complété',
  PAID: 'Payé',
  CANCELLED: 'Annulé',
  REFUNDED: 'Remboursé',
  PENDING: 'En attente',
  INITIATED: 'Non validé',
  PARTIAL: 'Partiel',
  OVERDUE: 'En retard',
  CONFIRMED: 'Confirmé',
  ACTIVE: 'Actif',
  UPCOMING: 'À venir',
  FAILED: 'Échoué',
  PROCESSING: 'En traitement',
};

const refundStatusLabels = {
  PENDING: 'Initié',
  PROCESSED: 'Validé',
  REJECTED: 'Refusé',
};

const refundStatusOptions = [
  { value: 'PENDING', label: 'Initié' },
  { value: 'PROCESSED', label: 'Validé' },
  { value: 'REJECTED', label: 'Refusé' },
];

const formatPaymentStatus = (status) => paymentStatusLabels[status] || status || '-';
const formatRefundStatus = (status) => refundStatusLabels[status] || status || '-';

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
};

const modalStyle = {
  maxWidth: 900,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  borderRadius: 16,
  backgroundColor: '#fff',
  padding: 24,
  boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
};

const sectionStyle = {
  marginBottom: 20,
};

const sectionTitleStyle = {
  marginBottom: 12,
  fontSize: 18,
  fontWeight: 700,
};

export default function PaymentDetailModal({ transaction, isOpen, onClose, onRefundCreated }) {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [refundAccessCode, setRefundAccessCode] = useState('');
  const [refundCodeValidated, setRefundCodeValidated] = useState(false);
  const [refundCodeValidating, setRefundCodeValidating] = useState(false);

  const paymentId = transaction?.paymentId;
  const payment = transaction?.payment || {};

  useEffect(() => {
    if (!isOpen) {
      setRefunds([]);
      setRefundAccessCode('');
      setRefundCodeValidated(false);
      setRefundCodeValidating(false);
      setAmount('');
      setStatus('PENDING');
      setReason('');
      setError('');
      return;
    }

    if (paymentId) {
      loadRefunds();
    }
  }, [isOpen, paymentId]);

  async function loadRefunds() {
    setLoading(true);
    try {
      const res = await api.get('/payments/refunds', { params: { paymentId } });
      setRefunds(res.data.refunds || []);
    } catch (err) {
      console.error('Erreur chargement remboursements', err);
      toast.error('Impossible de charger les remboursements');
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!refundCodeValidated) {
      setError("Le code d’accès doit être validé pour ajouter un remboursement");
      return;
    }
    setError('');
    const value = Number(amount);
    if (!paymentId || !amount || Number.isNaN(value) || value <= 0) {
      setError('Montant invalide');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/payments/refunds', {
        paymentId,
        amount: value,
        reason: reason.trim(),
        status,
      });
      toast.success('Remboursement ajouté');
      setAmount('');
      setStatus('PENDING');
      setReason('');
      await loadRefunds();
      if (typeof onRefundCreated === 'function') {
        onRefundCreated();
      }
    } catch (err) {
      console.error('Erreur création remboursement', err);
      toast.error('Impossible d’ajouter le remboursement');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRefund = async (refundId) => {
    if (!refundCodeValidated) {
      toast.error("Le code d’accès doit être validé pour supprimer un remboursement");
      return;
    }
    if (!window.confirm('Confirmer la suppression de ce remboursement ?')) return;
    try {
      await api.delete(`/payments/refunds/${refundId}`);
      toast.success('Remboursement supprimé');
      await loadRefunds();
      if (typeof onRefundCreated === 'function') {
        onRefundCreated();
      }
    } catch (err) {
      console.error('Erreur suppression remboursement', err);
      toast.error('Impossible de supprimer le remboursement');
    }
  };

  const validateRefundCode = async () => {
    if (!refundAccessCode.trim()) {
      toast.error('Veuillez saisir le code de sécurité');
      return;
    }

    setRefundCodeValidating(true);
    try {
      await api.post('/payments/refunds/security/validate', {
        code: refundAccessCode.trim(),
      });
      setRefundCodeValidated(true);
      toast.success('Code de sécurité validé');
    } catch (err) {
      setRefundCodeValidated(false);
      console.error('Erreur validation code remboursement', err);
      toast.error(err?.response?.data?.error || 'Code invalide ou expiré');
    } finally {
      setRefundCodeValidating(false);
    }
  };

  if (!isOpen || !transaction) {
    return null;
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle} className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#1d4ed8' }}>Détail du paiement</h2>
            <div style={{ color: '#64748b', marginTop: 4 }}>Paiement #{paymentId}</div>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
        </div>

        <div style={{ ...sectionStyle, padding: 20, borderRadius: 14, backgroundColor: '#f8fafc' }}>
          <div style={sectionTitleStyle}>Résumé du paiement</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 18 }}>
            <div style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)' }}>
              <div style={{ color: '#64748b', marginBottom: 8 }}>Montant total</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{payment.totalAmount ? `${Number(payment.totalAmount).toFixed(2)} €` : '-'}</div>
            </div>
            <div style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)' }}>
              <div style={{ color: '#64748b', marginBottom: 8 }}>Montant payé</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{payment.paidAmount ? `${Number(payment.paidAmount).toFixed(2)} €` : '0.00 €'}</div>
            </div>
            <div style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)' }}>
              <div style={{ color: '#64748b', marginBottom: 8 }}>Statut</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{formatPaymentStatus(payment.status)}</div>
            </div>
          </div>
        </div>

        <div style={{ ...sectionStyle, padding: 20, borderRadius: 14, backgroundColor: '#fff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)' }}>
          <div style={sectionTitleStyle}>Informations du paiement</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <div style={{ color: '#64748b', marginBottom: 8 }}>Famille</div>
              <div style={{ fontWeight: 600 }}>{payment.family?.familyName || '-'}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', marginBottom: 8 }}>Méthode</div>
              <div style={{ fontWeight: 600 }}>{payment.paymentMethod || '-'}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', marginBottom: 8 }}>Nombre d&apos;échéances</div>
              <div style={{ fontWeight: 600 }}>{payment.numberOfInstallments || '-'}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', marginBottom: 8 }}>Date</div>
              <div style={{ fontWeight: 600 }}>{payment.createdAt ? new Date(payment.createdAt).toLocaleString('fr-FR') : '-'}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 16, border: '1px solid #E5E7EB', borderRadius: 12, background: '#F8FAFC' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Accès remboursement</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-control"
                value={refundAccessCode}
                onChange={(e) => {
                  setRefundAccessCode(e.target.value);
                  if (refundCodeValidated) {
                    setRefundCodeValidated(false);
                  }
                }}
                placeholder="Saisir le code d'accès généré par l'espace trésorier"
                disabled={refundCodeValidated}
                style={{ flex: 1, minWidth: 200 }}
              />
              {!refundCodeValidated ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={validateRefundCode}
                  disabled={refundCodeValidating || !refundAccessCode.trim()}
                >
                  {refundCodeValidating ? 'Validation...' : 'Valider'}
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', color: '#16a34a', fontWeight: 700 }}>
                  ✓ Code validé
                </div>
              )}
            </div>
            <div style={{ color: '#475569', fontSize: 14 }}>
              {refundCodeValidated
                ? 'Code valide. Le bloc de remboursement est accessible.'
                : "Le bloc remboursement n’est disponible qu’après validation du code d’accès."}
            </div>
          </div>
        </div>

        {refundCodeValidated && (
          <>
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Remboursements</div>
              {loading ? (
                <p>Chargement des remboursements...</p>
              ) : refunds.length === 0 ? (
                <p>Aucun remboursement enregistré pour ce paiement.</p>
              ) : (
                <div className="table-container" style={{ maxHeight: 240, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Montant</th>
                        <th>Statut</th>
                        <th>Motif</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.map((refund) => (
                        <tr key={refund.id}>
                          <td>{refund.createdAt ? new Date(refund.createdAt).toLocaleString('fr-FR') : '-'}</td>
                          <td>{Number(refund.amount).toFixed(2)} €</td>
                          <td>{formatRefundStatus(refund.status)}</td>
                          <td>{refund.reason || '-'}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-link text-danger"
                              onClick={() => deleteRefund(refund.id)}
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Ajouter un remboursement</div>
              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
                  <label style={{ fontWeight: 600 }}>Montant</label>
                  <input
                    className="form-control"
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Montant du remboursement"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
                  <label style={{ fontWeight: 600 }}>Statut</label>
                  <select
                    className="form-control"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {refundStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
                  <label style={{ fontWeight: 600 }}>Motif</label>
                  <textarea
                    className="form-control"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Description du remboursement"
                    rows={3}
                  />
                </div>
                {error && <div style={{ color: '#b91c1c', fontWeight: 600 }}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>Fermer</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Ajouter le remboursement'}</button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
