import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const statusOptions = [
  { value: 'PENDING', label: 'Initié' },
  { value: 'PROCESSED', label: 'Validé' },
  { value: 'REJECTED', label: 'Refusé' },
];

export default function TresorierRefunds() {
  const [refunds, setRefunds] = useState([]);
  const [families, setFamilies] = useState([]);
  const [payments, setPayments] = useState([]);
  const [familyQuery, setFamilyQuery] = useState('');
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [selectedPaymentId, setSelectedPaymentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: '', reason: '' });
  const [editingRefund, setEditingRefund] = useState(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [securityCode, setSecurityCode] = useState(null);
  const [codeExpiration, setCodeExpiration] = useState(null);

  const loadRefunds = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/payments/refunds');
      setRefunds(data.refunds || []);
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger les remboursements');
    } finally {
      setLoading(false);
    }
  };

  const loadFamilies = async (search = '') => {
    try {
      const { data } = await api.get('/admin/families', {
        params: {
          limit: 200,
          search: search || undefined,
        },
      });
      setFamilies(data.families || []);
    } catch (error) {
      console.error('Impossible de charger les familles', error);
      toast.error('Impossible de charger les familles');
    }
  };

  const loadPayments = async (familyId) => {
    try {
      const { data } = await api.get('/payments/transactions', {
        params: { familyId },
      });
      const uniquePayments = [];
      const seen = new Set();

      (data.transactions || []).forEach((tx) => {
        const payment = tx.payment;
        if (payment && !seen.has(payment.id)) {
          seen.add(payment.id);
          uniquePayments.push(payment);
        }
      });

      setPayments(uniquePayments);
      if (uniquePayments.length > 0) {
        setSelectedPaymentId(uniquePayments[0].id);
      }
    } catch (error) {
      console.error('Impossible de charger les paiements', error);
      toast.error('Impossible de charger les paiements');
    }
  };

  useEffect(() => {
    loadRefunds();
    loadFamilies();
  }, []);

  useEffect(() => {
    if (selectedFamilyId) {
      loadPayments(selectedFamilyId);
    } else {
      setPayments([]);
      setSelectedPaymentId('');
    }
  }, [selectedFamilyId]);

  const resetForm = () => {
    setEditingRefund(null);
    setForm({ amount: '', reason: '' });
    setFamilyQuery('');
    setSelectedFamilyId('');
    setPayments([]);
    setSelectedPaymentId('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedPaymentId || !form.amount) {
      toast.error('Veuillez sélectionner un paiement et renseigner le montant');
      return;
    }

    setSaving(true);
    try {
      if (editingRefund) {
        await api.patch(`/payments/refunds/${editingRefund.id}`, {
          amount: Number(form.amount),
          reason: form.reason,
          status: editingRefund.status,
        });
        toast.success('Remboursement modifié');
      } else {
        await api.post('/payments/refunds', {
          paymentId: selectedPaymentId,
          amount: Number(form.amount),
          reason: form.reason,
        });
        toast.success('Remboursement ajouté');
      }
      resetForm();
      await loadRefunds();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible d’enregistrer le remboursement');
    } finally {
      setSaving(false);
    }
  };

  const editRefund = (refund) => {
    setEditingRefund(refund);
    setForm({ amount: Number(refund.amount).toFixed(2), reason: refund.reason });
    setFamilyQuery(refund.payment?.family?.familyName || '');
    setSelectedFamilyId(refund.payment?.familyId || '');
    setSelectedPaymentId(refund.paymentId);
  };

  const updateRefundStatus = async (refundId, status) => {
    try {
      await api.patch(`/payments/refunds/${refundId}`, { status });
      toast.success('Statut mis à jour');
      loadRefunds();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de mettre à jour le statut');
    }
  };

  const deleteRefund = async (refundId) => {
    if (!window.confirm('Confirmer la suppression de ce remboursement ?')) return;
    try {
      await api.delete(`/payments/refunds/${refundId}`);
      toast.success('Remboursement supprimé');
      if (editingRefund?.id === refundId) resetForm();
      loadRefunds();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de supprimer le remboursement');
    }
  };

  const generateSecurityCode = async () => {
    setGeneratingCode(true);
    try {
      const { data } = await api.post('/payments/refunds/security/generate');
      setSecurityCode(data.code);
      setCodeExpiration(data.expiresAt);
      toast.success('Code de sécurité généré avec succès');
      // Copy to clipboard
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
      <h2 style={{ color: 'var(--amc-primary)' }}>Remboursements</h2>

      <div className="card" style={{ marginBottom: 16, padding: '16px', backgroundColor: '#f0f9ff', borderLeft: '4px solid var(--amc-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Code de sécurité</strong>
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
        <h3>{editingRefund ? 'Modifier un remboursement' : 'Ajouter un remboursement'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Famille</label>
              <input
                className="form-control"
                type="text"
                list="family-list"
                value={familyQuery}
                onChange={(event) => {
                  const query = event.target.value;
                  setFamilyQuery(query);
                  const match = families.find(
                    (family) => `${family.familyName} (${family.user?.email || family.city || ''})` === query
                  );
                  setSelectedFamilyId(match ? match.id : '');
                }}
                placeholder="Rechercher une famille"
              />
              <datalist id="family-list">
                {families.map((family) => (
                  <option
                    key={family.id}
                    value={`${family.familyName} (${family.user?.email || family.city || ''})`}
                  />
                ))}
              </datalist>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Paiement</label>
              <select
                className="form-control"
                value={selectedPaymentId}
                onChange={(event) => setSelectedPaymentId(event.target.value)}
                disabled={Boolean(editingRefund)}
                required={!editingRefund}
              >
                <option value="">Sélectionner un paiement</option>
                {payments.map((payment) => (
                  <option key={payment.id} value={payment.id}>
                    {`${payment.id.substring(0, 8)} - ${payment.paymentMethod || payment.method || 'Paiement'} - ${Number(payment.totalAmount || payment.amount || 0).toFixed(2)} €`}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Montant</label>
              <input
                className="form-control"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Statut</label>
              <select
                className="form-control"
                value={editingRefund ? editingRefund.status : 'PENDING'}
                onChange={(event) => {
                  if (!editingRefund) return;
                  setEditingRefund((prev) => ({ ...prev, status: event.target.value }));
                }}
                disabled={!editingRefund}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Commentaire</label>
            <textarea
              className="form-control"
              rows={2}
              value={form.reason}
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'En cours...' : editingRefund ? 'Mettre à jour' : 'Ajouter'}
            </button>
            {editingRefund && (
              <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={saving}>
                Annuler
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Liste des remboursements</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : refunds.length === 0 ? (
          <p>Aucun remboursement disponible.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date remboursement</th>
                  <th>Montant</th>
                  <th>Moyen</th>
                  <th>Commentaire</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td>{formatDate(refund.createdAt)}</td>
                    <td>{Number(refund.amount).toFixed(2)} €</td>
                    <td>{refund.payment?.method || '—'}</td>
                    <td>{refund.reason || '—'}</td>
                    <td>
                      <select
                        className="form-control"
                        value={refund.status}
                        onChange={(event) => updateRefundStatus(refund.id, event.target.value)}
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="btn btn-link" onClick={() => editRefund(refund)}>
                        Modifier
                      </button>
                      <button type="button" className="btn btn-link text-danger" onClick={() => deleteRefund(refund.id)}>
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
    </div>
  );
}
