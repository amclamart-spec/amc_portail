import { useEffect, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiXCircle } from 'react-icons/fi';

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

const paymentMethodLabels = {
  PRELEVEMENT_BANCAIRE: 'Prélèvement',
  VIREMENT: 'Virement',
  SEPA: 'Prélèvement SEPA',
  CB: 'Carte bancaire',
  ESPECES: 'Espèces',
  CHEQUE: 'Chèque',
  STRIPE: 'Carte bancaire (Stripe)',
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
const formatPaymentMethodLabel = (payment = {}, transaction = {}) => {
  const method = transaction.method || payment.method || payment.paymentMethod;
  const bankDebitIban = payment.metadata?.bankDebitIban || transaction.metadata?.bankDebitIban;
  if (method === 'PRELEVEMENT_BANCAIRE') return 'Prélèvement';
  if (method === 'VIREMENT' && bankDebitIban) return 'Prélèvement';
  return paymentMethodLabels[method] || method || '-';
};

const formatRefundStatus = (status) => refundStatusLabels[status] || status || '-';

const normalizeBankValue = (value) => {
  if (!value) return '';
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
};

const formatBankIbanForDisplay = (value) => {
  const cleaned = normalizeBankValue(value);
  return cleaned.replace(/(.{4})/g, '$1 ').trim();
};

const formatBankSwiftForDisplay = (value) => normalizeBankValue(value);

const resolveUploadUrl = (url) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${prefix}${url.startsWith('/') ? '' : '/'}${url}`;
};

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
  const [editMode, setEditMode] = useState(false);
  const [localPayment, setLocalPayment] = useState(null);
  const [localPayerName, setLocalPayerName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPaidAmount, setEditPaidAmount] = useState('');
  const [editPayerName, setEditPayerName] = useState('');
  const [editNumberOfInstallments, setEditNumberOfInstallments] = useState('');
  const [editFirstPaymentDate, setEditFirstPaymentDate] = useState('');
  const [editBankDebitDay, setEditBankDebitDay] = useState('');
  const [editBankDebitIban, setEditBankDebitIban] = useState('');
  const [editBankDebitSwift, setEditBankDebitSwift] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const paymentId = transaction?.paymentId;
  const payment = localPayment || transaction?.payment || transaction || {};
  const bankDebitMetadata = payment.metadata || transaction?.metadata || {};
  const bankDebitIbanRaw = bankDebitMetadata.bankDebitIban || payment.bankDebitIban || transaction?.bankDebitIban;
  const bankDebitSwiftRaw = bankDebitMetadata.bankDebitSwift || payment.bankDebitSwift || transaction?.bankDebitSwift;
  const bankDebitIban = formatBankIbanForDisplay(bankDebitIbanRaw);
  const bankDebitSwift = formatBankSwiftForDisplay(bankDebitSwiftRaw);
  const bankDebitDay = bankDebitMetadata.bankDebitDay || payment.scheduleDay || payment.bankDebitDay || transaction?.scheduleDay || transaction?.bankDebitDay;
  const bankDebitInstallmentsCount = payment.numberOfInstallments || payment.installmentsCount || bankDebitMetadata.bankDebitInstallmentsCount || transaction?.numberOfInstallments || transaction?.installmentsCount;

  useEffect(() => {
    if (!isOpen) {
      setRefunds([]);
      setLocalPayment(null);
      setLocalPayerName('');
      setRefundAccessCode('');
      setRefundCodeValidated(false);
      setRefundCodeValidating(false);
      setAmount('');
      setStatus('PENDING');
      setReason('');
      setError('');
      setEditMode(false);
      setEditAmount('');
      setEditPaidAmount('');
      setEditPayerName('');
      setEditNumberOfInstallments('');
      setEditFirstPaymentDate('');
      setEditBankDebitDay('');
      setEditBankDebitIban('');
      setEditBankDebitSwift('');
      return;
    }

    setLocalPayment(transaction?.payment || transaction || null);
    setLocalPayerName(transaction?.payerName || '');

    if (paymentId) {
      loadRefunds();
    }
  }, [isOpen, paymentId, transaction]);

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

  const startEditing = () => {
    const currentAmount = payment.totalAmount ?? transaction?.amount;
    setEditAmount(currentAmount !== undefined && currentAmount !== null ? String(Number(currentAmount)) : '');
    const currentPaidAmount = payment.paidAmount;
    setEditPaidAmount(currentPaidAmount !== undefined && currentPaidAmount !== null ? String(Number(currentPaidAmount)) : '');
    setEditPayerName(localPayerName || transaction?.payerName || '');
    setEditNumberOfInstallments(String(bankDebitInstallmentsCount || ''));
    setEditFirstPaymentDate(bankDebitMetadata.firstPaymentDate ? bankDebitMetadata.firstPaymentDate.split('T')[0] : '');
    setEditBankDebitDay(String(bankDebitDay || ''));
    setEditBankDebitIban(normalizeBankValue(bankDebitIbanRaw) || '');
    setEditBankDebitSwift(normalizeBankValue(bankDebitSwiftRaw) || '');
    setEditMode(true);
  };

  const cancelEditing = () => {
    setEditMode(false);
    setEditAmount('');
    setEditPaidAmount('');
    setEditPayerName('');
    setEditNumberOfInstallments('');
    setEditFirstPaymentDate('');
    setEditBankDebitDay('');
    setEditBankDebitIban('');
    setEditBankDebitSwift('');
  };

  const saveChanges = async () => {
    if (!paymentId) {
      toast.error('Identifiant paiement manquant');
      return;
    }

    const paymentMethod = transaction?.method || payment.paymentMethod || 'CHEQUE';
    const isVirement = paymentMethod === 'VIREMENT' || paymentMethod === 'PRELEVEMENT_BANCAIRE';
    const isCheque = paymentMethod === 'CHEQUE';
    const canEditSchedule = isVirement || isCheque;
    const updates = {};

    if (editPayerName.trim() !== (localPayerName || transaction?.payerName || '')) {
      updates.payerName = editPayerName.trim();
    }

    if (editAmount !== '') {
      const nextAmount = Number(editAmount);
      if (Number.isNaN(nextAmount) || nextAmount <= 0) {
        toast.error('Le montant doit être supérieur à 0');
        return;
      }
      updates.totalAmount = nextAmount;
    }

    if (editPaidAmount !== '') {
      const nextPaidAmount = Number(editPaidAmount);
      if (Number.isNaN(nextPaidAmount) || nextPaidAmount < 0) {
        toast.error('Le montant payé doit être positif ou nul');
        return;
      }
      updates.paidAmount = nextPaidAmount;
    }

    if (canEditSchedule && editNumberOfInstallments) {
      const installments = Number(editNumberOfInstallments);
      if (Number.isNaN(installments) || installments < 1 || installments > 12) {
        toast.error('Le nombre d\'échéances doit être entre 1 et 12');
        return;
      }
      updates.numberOfInstallments = installments;
    }

    if (canEditSchedule && editFirstPaymentDate) {
      updates.firstPaymentDate = editFirstPaymentDate;
    }

    if (canEditSchedule && editBankDebitDay) {
      const day = Number(editBankDebitDay);
      if (Number.isNaN(day) || ![10, 20, 30].includes(day)) {
        toast.error('Le jour de prélèvement doit être 10, 20 ou 30');
        return;
      }
      updates.bankDebitDay = day;
    }

    if (isVirement) {
      if (editBankDebitIban) {
        const ibanNorm = normalizeBankValue(editBankDebitIban);
        if (!ibanNorm || ibanNorm.length < 15) {
          toast.error('L\'IBAN doit avoir au moins 15 caractères');
          return;
        }
        updates.bankDebitIban = ibanNorm;
      }

      if (editBankDebitSwift) {
        const swiftNorm = normalizeBankValue(editBankDebitSwift);
        if (!swiftNorm || swiftNorm.length < 8) {
          toast.error('Le SWIFT/BIC doit avoir au moins 8 caractères');
          return;
        }
        updates.bankDebitSwift = swiftNorm;
      }
    }

    if (Object.keys(updates).length === 0) {
      toast.error('Aucune modification à enregistrer');
      return;
    }

    setEditSubmitting(true);
    try {
      const { data } = await api.patch(`/payments/${paymentId}`, updates);
      setLocalPayment(data?.payment || localPayment);
      if (updates.payerName !== undefined) setLocalPayerName(updates.payerName);
      toast.success('Paiement modifié avec succès');
      setEditMode(false);
      if (typeof onRefundCreated === 'function') {
        onRefundCreated();
      }
    } catch (err) {
      console.error('Erreur mise à jour paiement', err);
      toast.error(err?.response?.data?.error || 'Impossible de modifier le paiement');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDownloadRib = async (ribUrl, filename) => {
    try {
      const downloadUrl = resolveUploadUrl(ribUrl);
      if (!downloadUrl) throw new Error('URL RIB invalide');
      const response = await fetch(downloadUrl, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename || 'rib.pdf';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(objectUrl);
      toast.success('Téléchargement du RIB en cours...');
    } catch (err) {
      console.error('Erreur téléchargement RIB', err);
      toast.error('Impossible de télécharger le RIB');
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(() => {
              const txStatus = String(transaction?.status || payment.status);
              return txStatus !== 'SUCCEEDED' && txStatus !== 'CANCELLED';
            })() && (
              <>
                <button
                  type="button"
                  title="Valider le paiement"
                  className="btn btn-ghost"
                  onClick={async () => {
                    if (!window.confirm('Confirmer la validation de ce paiement ?')) return;
                    try {
                      await api.patch(`/payments/transactions/${transaction.id}`, { status: 'SUCCEEDED' });
                      toast.success('Paiement validé');
                      if (typeof onRefundCreated === 'function') onRefundCreated();
                      onClose();
                    } catch (err) {
                      console.error('Erreur validation paiement', err);
                      toast.error(err?.response?.data?.error || 'Impossible de valider le paiement');
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, width: 40, height: 40 }}
                >
                  <FiCheckCircle size={18} color="#16a34a" />
                </button>
                <button
                  type="button"
                  title="Annuler le paiement"
                  className="btn btn-ghost"
                  onClick={async () => {
                    if (!window.confirm('Confirmer l\'annulation de ce paiement ?')) return;
                    try {
                      await api.patch(`/payments/transactions/${transaction.id}`, { status: 'CANCELLED' });
                      toast.success('Paiement annulé');
                      if (typeof onRefundCreated === 'function') onRefundCreated();
                      onClose();
                    } catch (err) {
                      console.error('Erreur annulation paiement', err);
                      toast.error(err?.response?.data?.error || 'Impossible d\'annuler le paiement');
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, width: 40, height: 40 }}
                >
                  <FiXCircle size={18} color="#dc2626" />
                </button>
              </>
            )}
            <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={sectionTitleStyle}>Informations du paiement</div>
            {!editMode && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={startEditing}
              >
                Éditer
              </button>
            )}
          </div>

          {!editMode ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                <div>
                  <div style={{ color: '#64748b', marginBottom: 8 }}>Famille</div>
                  <div style={{ fontWeight: 600 }}>{payment.family?.familyName || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', marginBottom: 8 }}>Payeur</div>
                  <div style={{ fontWeight: 600 }}>{localPayerName || transaction?.payerName || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', marginBottom: 8 }}>Méthode</div>
                  <div style={{ fontWeight: 600 }}>{formatPaymentMethodLabel(payment, transaction)}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', marginBottom: 8 }}>Nombre d&apos;échéances</div>
                  <div style={{ fontWeight: 600 }}>{bankDebitInstallmentsCount || '-'}</div>
                </div>
                {bankDebitDay !== undefined && bankDebitDay !== null && (
                  <div>
                    <div style={{ color: '#64748b', marginBottom: 8 }}>Jour du prélèvement</div>
                    <div style={{ fontWeight: 600 }}>{bankDebitDay}</div>
                  </div>
                )}
                {bankDebitMetadata.firstPaymentDate && (
                  <div>
                    <div style={{ color: '#64748b', marginBottom: 8 }}>Date début prélèvement</div>
                    <div style={{ fontWeight: 600 }}>{new Date(bankDebitMetadata.firstPaymentDate).toLocaleDateString('fr-FR')}</div>
                  </div>
                )}
                <div>
                  <div style={{ color: '#64748b', marginBottom: 8 }}>Date</div>
                  <div style={{ fontWeight: 600 }}>{payment.createdAt ? new Date(payment.createdAt).toLocaleString('fr-FR') : '-'}</div>
                </div>
              </div>
              {(bankDebitIban || bankDebitSwift || bankDebitMetadata.bankDebitRibUrl) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 12 }}>
                  <div>
                    <div style={{ color: '#64748b', marginBottom: 8 }}>IBAN</div>
                    <div style={{ fontWeight: 600 }}>{bankDebitIban || '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', marginBottom: 8 }}>BIC / SWIFT</div>
                    <div style={{ fontWeight: 600 }}>{bankDebitSwift || '-'}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: '#64748b', marginBottom: 8 }}>RIB</div>
                    {bankDebitMetadata.bankDebitRibUrl ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadRib(bankDebitMetadata.bankDebitRibUrl, bankDebitMetadata.bankDebitRibFilename)}
                        style={{ 
                          fontWeight: 600,
                          backgroundColor: 'transparent',
                          border: 'none',
                          padding: 0,
                          color: '#1d4ed8',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        {bankDebitMetadata.bankDebitRibFilename || 'Télécharger le RIB'}
                      </button>
                    ) : (
                      <div style={{ fontWeight: 600 }}>-</div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom payeur</label>
                <input
                  type="text"
                  className="form-control"
                  value={editPayerName}
                  onChange={(e) => setEditPayerName(e.target.value)}
                  placeholder="Nom et prénom du payeur"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Montant total</label>
                  <input
                    type="number"
                    className="form-control"
                    step="0.01"
                    min="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Montant payé</label>
                  <input
                    type="number"
                    className="form-control"
                    step="0.01"
                    min="0"
                    value={editPaidAmount}
                    onChange={(e) => setEditPaidAmount(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nombre d&apos;échéances</label>
                  <input
                    type="number"
                    className="form-control"
                    min="1"
                    max="12"
                    value={editNumberOfInstallments}
                    onChange={(e) => setEditNumberOfInstallments(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Jour de prélèvement</label>
                  <select
                    className="form-control"
                    value={editBankDebitDay}
                    onChange={(e) => setEditBankDebitDay(e.target.value)}
                  >
                    <option value="">--</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="30">30</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Date première échéance</label>
                <input
                  type="date"
                  className="form-control"
                  value={editFirstPaymentDate}
                  onChange={(e) => setEditFirstPaymentDate(e.target.value)}
                />
              </div>

              {(transaction?.method === 'VIREMENT' || transaction?.method === 'PRELEVEMENT_BANCAIRE' || payment.paymentMethod === 'VIREMENT') && (
                <>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>IBAN</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ex: FR1420041010050500013M02606"
                      value={editBankDebitIban}
                      onChange={(e) => setEditBankDebitIban(normalizeBankValue(e.target.value))}
                      style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>SWIFT / BIC</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ex: BNPAFRPP"
                      value={editBankDebitSwift}
                      onChange={(e) => setEditBankDebitSwift(normalizeBankValue(e.target.value))}
                      style={{ fontFamily: 'monospace', letterSpacing: '0.05em', textTransform: 'uppercase' }}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={cancelEditing}
                  disabled={editSubmitting}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={saveChanges}
                  disabled={editSubmitting}
                >
                  {editSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}
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
