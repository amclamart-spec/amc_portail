import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { FiPlus, FiCheck, FiX, FiEye } from 'react-icons/fi';

const STATUS_LABEL = { DRAFT: 'Brouillon', SUBMITTED: 'En attente', ACCEPTED: 'Accepté', REFUSED: 'Refusé', SUSPENDED: 'Suspendu', EXPIRED: 'Expiré' };
const STATUS_BADGE = { DRAFT: 'badge-gray', SUBMITTED: 'badge-warning', ACCEPTED: 'badge-success', REFUSED: 'badge-danger', SUSPENDED: 'badge-warning', EXPIRED: 'badge-danger' };

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

export default function SocialCases() {
  const { user } = useAuth();
  const canManage = user?.role === 'RESPONSABLE_POLE_SOCIAL' || user?.role === 'SUPER_ADMIN';

  const [cases, setCases] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailCase, setDetailCase] = useState(null);
  const [decisionModal, setDecisionModal] = useState(null);
  const [decisionStatus, setDecisionStatus] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [selectedBenef, setSelectedBenef] = useState('');
  const [newObs, setNewObs] = useState('');

  const load = async (p = page, s = filterStatus) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (s) params.status = s;
      const { data } = await api.get('/social/cases', { params });
      setCases(data.cases || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { toast.error('Impossible de charger les dossiers'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1, filterStatus); }, []);

  useEffect(() => {
    api.get('/social/beneficiaries', { params: { limit: 200 } })
      .then(({ data }) => setBeneficiaries(data.beneficiaries || []));
  }, []);

  const openDetail = async (id) => {
    const { data } = await api.get(`/social/cases/${id}`);
    setDetailCase(data.case);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!selectedBenef) { toast.error('Sélectionnez un bénéficiaire'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/social/cases', { beneficiaryId: selectedBenef, observations: newObs });
      toast.success('Dossier créé');
      setCreateModal(false);
      setSelectedBenef('');
      setNewObs('');
      if (data.case.autoDecision) toast(`Décision automatique : ${STATUS_LABEL[data.case.autoDecision]}`, { icon: '🤖' });
      load(page, filterStatus);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleSubmit = async (id) => {
    try {
      const { data } = await api.post(`/social/cases/${id}/submit`);
      toast.success(`Dossier soumis — Décision auto : ${STATUS_LABEL[data.autoDecision]}`);
      load(page, filterStatus);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleDecision = async (e) => {
    e.preventDefault();
    if (!decisionStatus) { toast.error('Choisissez une décision'); return; }
    setSaving(true);
    try {
      await api.patch(`/social/cases/${decisionModal.id}/status`, { status: decisionStatus, reason: decisionReason });
      toast.success('Décision enregistrée');
      setDecisionModal(null);
      load(page, filterStatus);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Dossiers d'aide ({total})</h2>
        <button className="btn btn-primary" onClick={() => setCreateModal(true)}><FiPlus size={14} /> Nouveau dossier</button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="form-control" style={{ width: 200 }} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); load(1, e.target.value); }}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn btn-outline" onClick={() => { setFilterStatus(''); setPage(1); load(1, ''); }}>Réinitialiser</button>
        </div>
      </div>

      <div className="card">
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Bénéficiaire</th><th>Statut</th><th>Décision auto</th><th>Créé</th><th>Traité</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {cases.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun dossier</td></tr>
                ) : cases.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.beneficiary?.lastName} {c.beneficiary?.firstName}</td>
                    <td><span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                    <td>{c.autoDecision ? <span className={`badge ${STATUS_BADGE[c.autoDecision]}`}>{STATUS_LABEL[c.autoDecision]}</span> : '—'}</td>
                    <td>{fmtDate(c.createdAt)}</td>
                    <td>{fmtDate(c.processedAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => openDetail(c.id)} title="Détail"><FiEye size={14} /></button>
                        {c.status === 'DRAFT' && (
                          <button className="btn btn-sm btn-primary" onClick={() => handleSubmit(c.id)} title="Soumettre">Soumettre</button>
                        )}
                        {canManage && c.status === 'SUBMITTED' && (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => { setDecisionModal(c); setDecisionStatus('ACCEPTED'); setDecisionReason(''); }} title="Accepter"><FiCheck size={14} /></button>
                            <button className="btn btn-sm btn-danger"  onClick={() => { setDecisionModal(c); setDecisionStatus('REFUSED');  setDecisionReason(''); }} title="Refuser"><FiX size={14} /></button>
                          </>
                        )}
                        {canManage && !['DRAFT'].includes(c.status) && (
                          <button className="btn btn-sm btn-outline" onClick={() => { setDecisionModal(c); setDecisionStatus(c.status); setDecisionReason(''); }}>Modifier</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1, filterStatus); }}>Précédent</button>
            <span style={{ padding: '4px 12px', color: '#6B7280' }}>Page {page} / {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); load(page + 1, filterStatus); }}>Suivant</button>
          </div>
        )}
      </div>

      {/* Modal détail */}
      {detailCase && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 680 }}>
            <div className="card-header">
              <h3>Dossier — {detailCase.beneficiary?.lastName} {detailCase.beneficiary?.firstName}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setDetailCase(null)}>Fermer</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><strong>Statut :</strong> <span className={`badge ${STATUS_BADGE[detailCase.status]}`}>{STATUS_LABEL[detailCase.status]}</span></div>
                <div><strong>Décision auto :</strong> {detailCase.autoDecision ? <span className={`badge ${STATUS_BADGE[detailCase.autoDecision]}`}>{STATUS_LABEL[detailCase.autoDecision]}</span> : '—'}</div>
                <div><strong>Revenu mensuel :</strong> {detailCase.beneficiary?.monthlyIncome != null ? `${Number(detailCase.beneficiary.monthlyIncome).toFixed(0)} €` : '—'}</div>
                <div><strong>Composition :</strong> {detailCase.beneficiary?.adultsCount} adulte(s) / {detailCase.beneficiary?.childrenCount} enfant(s)</div>
              </div>
              {detailCase.autoScore?.results && (
                <div style={{ marginBottom: 16 }}>
                  <strong>Analyse critères :</strong>
                  <div style={{ marginTop: 8 }}>
                    {detailCase.autoScore.results.map((r) => (
                      <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--amc-border)', fontSize: 13 }}>
                        <span style={{ color: r.passed ? '#16A34A' : '#DC2626', fontWeight: 700 }}>{r.passed ? '✓' : '✗'}</span>
                        <span>{r.label}</span>
                        {r.value !== undefined && <span style={{ marginLeft: 'auto', color: '#6B7280' }}>{r.value} (seuil: {r.threshold})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <strong>Historique des décisions :</strong>
                {detailCase.decisions?.length === 0 ? <p style={{ color: '#6B7280', fontSize: 13 }}>Aucune décision</p> : (
                  <div style={{ marginTop: 8 }}>
                    {detailCase.decisions.map((d) => (
                      <div key={d.id} style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid var(--amc-border)', marginBottom: 6, fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className={`badge ${STATUS_BADGE[d.decision]}`}>{STATUS_LABEL[d.decision]}</span>
                          <span style={{ color: '#6B7280' }}>{new Date(d.createdAt).toLocaleString('fr-FR')} — {d.user?.firstName} {d.user?.lastName}</span>
                        </div>
                        {d.reason && <div style={{ marginTop: 4, color: '#374151', fontStyle: 'italic' }}>« {d.reason} »</div>}
                        {d.isAuto && <div style={{ marginTop: 2, color: '#6B7280', fontSize: 11 }}>🤖 Décision automatique</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal création */}
      {createModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 480 }}>
            <div className="card-header">
              <h3>Nouveau dossier</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setCreateModal(false)}>Fermer</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Bénéficiaire *</label>
                <select className="form-control" value={selectedBenef} onChange={(e) => setSelectedBenef(e.target.value)} required>
                  <option value="">— Sélectionner —</option>
                  {beneficiaries.map((b) => <option key={b.id} value={b.id}>{b.lastName} {b.firstName}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Observations</label>
                <textarea className="form-control" rows={3} value={newObs} onChange={(e) => setNewObs(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setCreateModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Création…' : 'Créer le dossier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal décision */}
      {decisionModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 440 }}>
            <div className="card-header">
              <h3>Décision — {decisionModal.beneficiary?.lastName} {decisionModal.beneficiary?.firstName}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setDecisionModal(null)}>Fermer</button>
            </div>
            <form onSubmit={handleDecision} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Décision *</label>
                <select className="form-control" value={decisionStatus} onChange={(e) => setDecisionStatus(e.target.value)} required>
                  <option value="">— Choisir —</option>
                  {['ACCEPTED', 'REFUSED', 'SUSPENDED', 'EXPIRED'].map((v) => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Motif / commentaire</label>
                <textarea className="form-control" rows={3} value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setDecisionModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Valider la décision'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
