import { Fragment, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { FiDownload, FiLock, FiRefreshCw, FiTrash2 } from 'react-icons/fi';

const refundStatusOptions = [
  { value: '', label: 'Tous les statuts' },
  { value: 'PENDING', label: 'Initié' },
  { value: 'PROCESSED', label: 'Validé' },
  { value: 'REJECTED', label: 'Refusé' },
];

const formatDate = (value) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
};

export default function RefundsManager({ title = 'Remboursements', canGenerateCode = false }) {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ familyName: '', status: '', startDate: '', endDate: '', minAmount: '', maxAmount: '' });
  const [expandedFamilies, setExpandedFamilies] = useState({});

  const [accessCode, setAccessCode] = useState('');
  const [codeValidating, setCodeValidating] = useState(false);
  const [codeValidated, setCodeValidated] = useState(false);

  const [generatingCode, setGeneratingCode] = useState(false);
  const [securityCode, setSecurityCode] = useState(null);
  const [codeExpiration, setCodeExpiration] = useState(null);

  const buildQueryParams = (values) => {
    return Object.entries(values).reduce((params, [key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        params[key] = value;
      }
      return params;
    }, {});
  };

  const loadRefunds = async (queryFilters = filters) => {
    setLoading(true);
    try {
      const { data } = await api.get('/payments/refunds', { params: buildQueryParams(queryFilters) });
      setRefunds(data.refunds || []);
    } catch (error) {
      console.error('Impossible de charger les remboursements', error);
      toast.error('Impossible de charger les remboursements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (codeValidated) {
      loadRefunds(filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeValidated]);

  const applyFilters = () => loadRefunds(filters);

  const resetFilters = () => {
    const reset = { familyName: '', status: '', startDate: '', endDate: '', minAmount: '', maxAmount: '' };
    setFilters(reset);
    loadRefunds(reset);
  };

  const validateAccessCode = async () => {
    if (!accessCode.trim()) {
      toast.error('Veuillez saisir le code de sécurité');
      return;
    }
    setCodeValidating(true);
    try {
      await api.post('/payments/refunds/security/validate', { code: accessCode.trim() });
      setCodeValidated(true);
      toast.success('Accès au module remboursements validé');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Code invalide');
      setCodeValidated(false);
    } finally {
      setCodeValidating(false);
    }
  };

  const generateSecurityCode = async () => {
    setGeneratingCode(true);
    try {
      const { data } = await api.post('/payments/refunds/security/generate');
      setSecurityCode(data.code);
      setCodeExpiration(data.expiresAt);
      toast.success('Code de sécurité généré avec succès');
      navigator.clipboard?.writeText(data.code);
      toast.success('Code copié dans le presse-papiers');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de générer le code');
    } finally {
      setGeneratingCode(false);
    }
  };

  const updateRefundStatus = async (refundId, status) => {
    try {
      await api.patch(`/payments/refunds/${refundId}`, { status });
      toast.success('Statut mis à jour');
      loadRefunds(filters);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de mettre à jour le statut');
    }
  };

  const deleteRefund = async (refundId) => {
    if (!window.confirm('Confirmer la suppression de ce remboursement ?')) return;
    try {
      await api.delete(`/payments/refunds/${refundId}`);
      toast.success('Remboursement supprimé');
      loadRefunds(filters);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de supprimer le remboursement');
    }
  };

  const downloadReceipt = async (refund) => {
    const paymentId = refund.paymentId || refund.payment?.id;
    if (!paymentId) {
      toast.error('Paiement associé introuvable');
      return;
    }
    try {
      const response = await api.get(`/finance/payments/${paymentId}/receipt/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `recu-${paymentId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur téléchargement reçu', error);
      toast.error('Impossible de télécharger le reçu');
    }
  };

  const groupedRefunds = useMemo(() => {
    const groups = new Map();
    for (const refund of refunds) {
      const familyId = refund.payment?.familyId || refund.payment?.family?.id || 'unknown';
      const familyName = refund.payment?.family?.familyName || '-';
      if (!groups.has(familyId)) {
        groups.set(familyId, { familyId, familyName, refunds: [], totalAmount: 0 });
      }
      const group = groups.get(familyId);
      group.refunds.push(refund);
      if (refund.status === 'PROCESSED') {
        group.totalAmount += Number(refund.amount) || 0;
      }
    }
    return [...groups.values()].sort((a, b) => a.familyName.localeCompare(b.familyName, 'fr'));
  }, [refunds]);

  const toggleFamily = (familyId) => {
    setExpandedFamilies((prev) => ({ ...prev, [familyId]: prev[familyId] === false ? true : false }));
  };

  const isFamilyExpanded = (familyId) => expandedFamilies[familyId] !== false;

  if (!codeValidated) {
    return (
      <div>
        <h2 style={{ color: 'var(--amc-primary)' }}>{title}</h2>

        {canGenerateCode && (
          <div className="card" style={{ marginBottom: 16, padding: 16, backgroundColor: '#f0f9ff', borderLeft: '4px solid var(--amc-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong>Code de sécurité</strong>
                {securityCode && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 18, fontFamily: 'monospace', letterSpacing: 4, color: 'var(--amc-primary)' }}>
                      {securityCode}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      Expire le {formatDate(codeExpiration)} à {new Date(codeExpiration).toLocaleTimeString('fr-FR')}
                    </div>
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-primary" onClick={generateSecurityCode} disabled={generatingCode}>
                <FiRefreshCw size={14} style={{ marginRight: 6 }} />
                {generatingCode ? 'Génération...' : 'Générer un code'}
              </button>
            </div>
          </div>
        )}

        <div className="card" style={{ maxWidth: 420 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FiLock size={16} /> Accès protégé</h3>
          <p style={{ color: '#6B7280', fontSize: 13 }}>
            L'accès au module Remboursements nécessite un code de sécurité à usage unique, généré depuis l'espace trésorier.
          </p>
          <div className="form-group">
            <label>Code d'accès</label>
            <input
              className="form-control"
              type="text"
              maxLength={6}
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="123456"
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={validateAccessCode} disabled={codeValidating || !accessCode.trim()}>
            {codeValidating ? 'Validation...' : 'Valider le code'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)' }}>{title}</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Recherche</h3>
        <form onSubmit={(e) => { e.preventDefault(); applyFilters(); }} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <input
              className="form-control"
              placeholder="Famille (nom)"
              value={filters.familyName}
              onChange={(e) => setFilters((prev) => ({ ...prev, familyName: e.target.value }))}
            />
            <select
              className="form-control"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              {refundStatusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input className="form-control" type="date" value={filters.startDate} onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))} />
            <input className="form-control" type="date" value={filters.endDate} onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
            <input className="form-control" type="number" min="0" step="0.01" placeholder="Montant min" value={filters.minAmount} onChange={(e) => setFilters((prev) => ({ ...prev, minAmount: e.target.value }))} />
            <input className="form-control" type="number" min="0" step="0.01" placeholder="Montant max" value={filters.maxAmount} onChange={(e) => setFilters((prev) => ({ ...prev, maxAmount: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" type="submit">Filtrer</button>
              <button className="btn btn-outline" type="button" onClick={resetFilters}>Réinitialiser</button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Remboursements par famille</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Famille</th>
                <th>Montant</th>
                <th>Motif</th>
                <th>Statut</th>
                <th>Reçu</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px 0', color: '#6B7280' }}>Chargement...</td>
                </tr>
              ) : groupedRefunds.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px 0', color: '#6B7280' }}>Aucun remboursement trouvé</td>
                </tr>
              ) : (
                groupedRefunds.map((group) => (
                  <Fragment key={group.familyId}>
                    <tr
                      onClick={() => toggleFamily(group.familyId)}
                      style={{ background: '#EFF6FF', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <td colSpan="7" style={{ padding: '9px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, color: '#3B82F6', minWidth: 10 }}>
                            {isFamilyExpanded(group.familyId) ? '▼' : '▶'}
                          </span>
                          <strong style={{ fontSize: 14, color: '#1E3A5F' }}>{group.familyName}</strong>
                          <span style={{ fontSize: 11, fontWeight: 600, background: '#DBEAFE', color: '#1D4ED8', borderRadius: 999, padding: '2px 8px' }}>
                            {group.refunds.length} remboursement{group.refunds.length > 1 ? 's' : ''}
                          </span>
                          <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13, color: '#1E3A5F' }}>
                            Total validé : {group.totalAmount.toFixed(2)} €
                          </span>
                        </div>
                      </td>
                    </tr>
                    {isFamilyExpanded(group.familyId) && group.refunds.map((refund) => (
                      <tr key={refund.id} style={{ background: '#fff' }}>
                        <td style={{ paddingLeft: 28 }}>{formatDate(refund.createdAt)}</td>
                        <td style={{ color: '#6B7280', fontSize: 12 }}>—</td>
                        <td>{Number(refund.amount).toFixed(2)} €</td>
                        <td>{refund.reason || '-'}</td>
                        <td>
                          <select
                            className="form-control"
                            value={refund.status}
                            onChange={(e) => updateRefundStatus(refund.id, e.target.value)}
                          >
                            {refundStatusOptions.filter((opt) => opt.value).map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button className="btn btn-outline btn-sm" onClick={() => downloadReceipt(refund)}>
                            <FiDownload size={14} /> Reçu
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn btn-danger btn-sm"
                            title="Supprimer"
                            onClick={() => deleteRefund(refund.id)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', width: 30, height: 30, lineHeight: 0 }}
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
