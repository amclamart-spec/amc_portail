import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiUpload, FiTrash2, FiFile, FiPlus, FiEye } from 'react-icons/fi';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : (import.meta.env.DEV ? 'http://localhost:4000' : '');

const fileHref = (fileUrl) => (fileUrl?.startsWith('http') ? fileUrl : `${BACKEND_ORIGIN}${fileUrl}`);

const INCOME_PROOF_TYPES = [
  { value: 'FICHE_PAIE', label: 'Fiche de paie' },
  { value: 'ATTESTATION_CAF', label: 'Attestation de la CAF' },
  { value: 'RSA', label: 'RSA' },
  { value: 'MDPH', label: 'MDPH' },
  { value: 'PENSION_ALIMENTAIRE', label: 'Pension alimentaire' },
  { value: 'ALLOCATIONS_CHOMAGE', label: 'Allocations chômage' },
  { value: 'AUTRE', label: 'Autre' },
];

const FAMILY_COMPOSITION_TYPES = [
  { value: 'LIVRET_FAMILLE', label: 'Livret de famille' },
  { value: 'ATTESTATION_CAF_ENFANTS', label: "Attestation CAF (enfants à charge)" },
];

const SIMPLE_SECTIONS = [
  { type: 'IDENTITY_CARD', label: "Carte d'identité du bénéficiaire", hostedOnly: false },
  { type: 'PROOF_OF_ADDRESS', label: 'Justificatif de domicile du bénéficiaire', hostedOnly: false },
  { type: 'HOST_IDENTITY_CARD', label: "Carte d'identité de l'hébergeur", hostedOnly: true },
  { type: 'HOST_PROOF_OF_ADDRESS', label: "Justificatif de domicile de l'hébergeur", hostedOnly: true },
  { type: 'MISSING_DOCUMENT_ATTESTATION', label: "Attestation de la référente sociale (en cas de document manquant)", hostedOnly: false },
];

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

function DocumentList({ documents, onDelete }) {
  if (!documents.length) return <p style={{ color: '#94A3B8', fontSize: 13, margin: '4px 0' }}>Aucun document déposé</p>;
  return (
    <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
      {documents.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid var(--amc-border)', fontSize: 13 }}>
          <FiFile size={14} color="#6B7280" />
          <a href={fileHref(d.fileUrl)} target="_blank" rel="noreferrer" style={{ flex: 1, color: 'var(--amc-primary)', fontWeight: 600 }}>
            {d.label ? `${d.label} — ` : ''}{d.fileName || 'Document'}
          </a>
          <span style={{ color: '#94A3B8' }}>{fmtDate(d.createdAt)}</span>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => onDelete(d.id)} title="Supprimer"><FiTrash2 size={12} /></button>
        </div>
      ))}
    </div>
  );
}

export default function SocialBeneficiaryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [beneficiary, setBeneficiary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingKey, setUploadingKey] = useState('');

  const [incomeProofForm, setIncomeProofForm] = useState({ subType: 'FICHE_PAIE', file: null });
  const [taxNoticeForm, setTaxNoticeForm] = useState({ label: '', file: null });
  const [familyCompositionForm, setFamilyCompositionForm] = useState({ subType: 'LIVRET_FAMILLE', file: null });

  const [distributions, setDistributions] = useState([]);
  const [distTotal, setDistTotal] = useState(0);
  const [distPage, setDistPage] = useState(1);
  const [distTotalPages, setDistTotalPages] = useState(1);
  const [distLoading, setDistLoading] = useState(false);
  const [detailModal, setDetailModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/social/beneficiaries/${id}`);
      setBeneficiary(data.beneficiary);
    } catch { toast.error('Impossible de charger le bénéficiaire'); }
    finally { setLoading(false); }
  };

  const loadDistributions = async (p = 1) => {
    setDistLoading(true);
    try {
      const { data } = await api.get('/social/distributions', { params: { beneficiaryId: id, page: p, limit: 10 } });
      setDistributions(data.distributions || []);
      setDistTotal(data.total || 0);
      setDistTotalPages(data.totalPages || 1);
      setDistPage(p);
    } catch { toast.error("Impossible de charger l'historique des distributions"); }
    finally { setDistLoading(false); }
  };

  useEffect(() => { load(); loadDistributions(1); }, [id]);

  const docsByType = (type) => (beneficiary?.documents || []).filter((d) => d.type === type);

  const uploadDocument = async (type, file, extra = {}) => {
    if (!file) { toast.error('Sélectionnez un fichier'); return false; }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    if (extra.subType) formData.append('subType', extra.subType);
    if (extra.label) formData.append('label', extra.label);

    setUploadingKey(type + (extra.label || extra.subType || ''));
    try {
      await api.post(`/social/beneficiaries/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document ajouté');
      await load();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de l'envoi du document");
      return false;
    } finally {
      setUploadingKey('');
    }
  };

  const deleteDocument = async (documentId) => {
    try {
      await api.delete(`/social/beneficiaries/${id}/documents/${documentId}`);
      toast.success('Document supprimé');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleSimpleUpload = (type) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) uploadDocument(type, file);
  };

  const handleIncomeProofAdd = async () => {
    const ok = await uploadDocument('INCOME_PROOF', incomeProofForm.file, { subType: incomeProofForm.subType });
    if (ok) setIncomeProofForm({ subType: 'FICHE_PAIE', file: null });
  };

  const handleTaxNoticeAdd = async () => {
    if (!taxNoticeForm.label.trim()) { toast.error('Indiquez le nom du membre majeur'); return; }
    const ok = await uploadDocument('TAX_NOTICE', taxNoticeForm.file, { label: taxNoticeForm.label.trim() });
    if (ok) setTaxNoticeForm({ label: '', file: null });
  };

  const handleFamilyCompositionAdd = async () => {
    const ok = await uploadDocument('FAMILY_COMPOSITION_PROOF', familyCompositionForm.file, { subType: familyCompositionForm.subType });
    if (ok) setFamilyCompositionForm({ subType: 'LIVRET_FAMILLE', file: null });
  };

  if (loading || !beneficiary) {
    return <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p>;
  }

  const incomeProofTypeLabel = (v) => INCOME_PROOF_TYPES.find((t) => t.value === v)?.label || v;
  const familyCompositionTypeLabel = (v) => FAMILY_COMPOSITION_TYPES.find((t) => t.value === v)?.label || v;

  return (
    <div>
      <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/social/beneficiaries')}>
        <FiArrowLeft size={14} /> Retour à la liste
      </button>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: '0 0 8px' }}>{beneficiary.lastName} {beneficiary.firstName}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 13 }}>
          <div><strong>Téléphone :</strong> {beneficiary.phone || '—'}</div>
          <div><strong>Ville :</strong> {beneficiary.city || '—'}</div>
          <div><strong>Composition :</strong> {beneficiary.adultsCount} adulte(s) / {beneficiary.childrenCount} enfant(s)</div>
          <div><strong>Revenu mensuel :</strong> {beneficiary.monthlyIncome != null ? `${Number(beneficiary.monthlyIncome).toFixed(0)} €` : '—'}</div>
          <div style={{ gridColumn: '1 / -1' }}>
            <strong>Hébergement :</strong>{' '}
            {beneficiary.isHosted ? `Hébergé${beneficiary.hostFullName ? ` par ${beneficiary.hostFullName}` : ''}` : 'Non hébergé (logement propre)'}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Historique des distributions ({distTotal})</h3></div>
        {distLoading ? <p style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Produits</th><th>Statut</th><th>Opérateur</th><th>Motif d'annulation</th><th>Actions</th></tr></thead>
              <tbody>
                {distributions.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucune distribution enregistrée pour ce bénéficiaire</td></tr>
                ) : distributions.map((d) => (
                  <tr key={d.id}>
                    <td>{fmtDate(d.distributedAt)}</td>
                    <td style={{ fontSize: 12 }}>{d.lines?.map((l) => `${l.product?.name} (${Number(l.quantity).toFixed(0)} ${l.unit})`).join(', ')}</td>
                    <td><span className={`badge ${d.status === 'VALIDATED' ? 'badge-success' : 'badge-danger'}`}>{d.status === 'VALIDATED' ? 'Validée' : 'Annulée'}</span></td>
                    <td>{d.user?.firstName} {d.user?.lastName}</td>
                    <td>{d.status === 'CANCELLED' ? (d.cancelReason || '—') : '—'}</td>
                    <td><button className="btn btn-sm btn-outline" onClick={() => setDetailModal(d)}><FiEye size={12} /> Détail</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {distTotalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
            <button className="btn btn-outline btn-sm" disabled={distPage <= 1} onClick={() => loadDistributions(distPage - 1)}>Précédent</button>
            <span style={{ padding: '4px 12px', color: '#6B7280' }}>{distPage} / {distTotalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={distPage >= distTotalPages} onClick={() => loadDistributions(distPage + 1)}>Suivant</button>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Pièces justificatives</h3>
        <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }}>
          En cas d'absence de certains documents, joindre une attestation de la référente sociale justifiant le manquant.
        </p>

        {SIMPLE_SECTIONS.filter((s) => !s.hostedOnly || beneficiary.isHosted).map((section) => (
          <div key={section.type} style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>{section.label}</h4>
            <DocumentList documents={docsByType(section.type)} onDelete={deleteDocument} />
            <label className="btn btn-sm btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <FiUpload size={12} /> {uploadingKey === section.type ? 'Envoi…' : 'Ajouter un document'}
              <input type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: 'none' }} onChange={handleSimpleUpload(section.type)} disabled={uploadingKey === section.type} />
            </label>
          </div>
        ))}

        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 14, marginBottom: 8 }}>Justificatifs de ressources</h4>
          <DocumentList
            documents={docsByType('INCOME_PROOF').map((d) => ({ ...d, label: incomeProofTypeLabel(d.subType) }))}
            onDelete={deleteDocument}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ maxWidth: 220 }} value={incomeProofForm.subType} onChange={(e) => setIncomeProofForm((p) => ({ ...p, subType: e.target.value }))}>
              {INCOME_PROOF_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setIncomeProofForm((p) => ({ ...p, file: e.target.files?.[0] || null }))} />
            <button type="button" className="btn btn-sm btn-primary" onClick={handleIncomeProofAdd} disabled={uploadingKey === 'INCOME_PROOF' + incomeProofForm.subType}>
              <FiPlus size={12} /> Ajouter
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 14, marginBottom: 8 }}>Avis d'imposition ou de non-imposition (par membre majeur du foyer)</h4>
          <DocumentList documents={docsByType('TAX_NOTICE')} onDelete={deleteDocument} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-control" style={{ maxWidth: 240 }} placeholder="Nom du membre majeur" value={taxNoticeForm.label} onChange={(e) => setTaxNoticeForm((p) => ({ ...p, label: e.target.value }))} />
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setTaxNoticeForm((p) => ({ ...p, file: e.target.files?.[0] || null }))} />
            <button type="button" className="btn btn-sm btn-primary" onClick={handleTaxNoticeAdd} disabled={uploadingKey === 'TAX_NOTICE' + taxNoticeForm.label}>
              <FiPlus size={12} /> Ajouter
            </button>
          </div>
        </div>

        <div>
          <h4 style={{ fontSize: 14, marginBottom: 8 }}>Preuve de la composition familiale</h4>
          <DocumentList
            documents={docsByType('FAMILY_COMPOSITION_PROOF').map((d) => ({ ...d, label: familyCompositionTypeLabel(d.subType) }))}
            onDelete={deleteDocument}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ maxWidth: 260 }} value={familyCompositionForm.subType} onChange={(e) => setFamilyCompositionForm((p) => ({ ...p, subType: e.target.value }))}>
              {FAMILY_COMPOSITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFamilyCompositionForm((p) => ({ ...p, file: e.target.files?.[0] || null }))} />
            <button type="button" className="btn btn-sm btn-primary" onClick={handleFamilyCompositionAdd} disabled={uploadingKey === 'FAMILY_COMPOSITION_PROOF' + familyCompositionForm.subType}>
              <FiPlus size={12} /> Ajouter
            </button>
          </div>
        </div>
      </div>

      {detailModal && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="card modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header"><h3>Détail de la distribution</h3><button className="btn btn-outline btn-sm" onClick={() => setDetailModal(null)}>Fermer</button></div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 16 }}>
                <div><strong>Date :</strong> {fmtDate(detailModal.distributedAt)}</div>
                <div><strong>Statut :</strong> <span className={`badge ${detailModal.status === 'VALIDATED' ? 'badge-success' : 'badge-danger'}`}>{detailModal.status === 'VALIDATED' ? 'Validée' : 'Annulée'}</span></div>
                <div><strong>Opérateur :</strong> {detailModal.user?.firstName} {detailModal.user?.lastName}</div>
                <div><strong>Créée le :</strong> {fmtDate(detailModal.createdAt)}</div>
                {detailModal.status === 'CANCELLED' && (
                  <>
                    <div><strong>Annulée le :</strong> {fmtDate(detailModal.cancelledAt)}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Motif d'annulation :</strong> {detailModal.cancelReason || '—'}</div>
                  </>
                )}
              </div>

              <h4 style={{ fontSize: 14, marginBottom: 8 }}>Produits distribués</h4>
              <div className="table-container" style={{ marginBottom: 16 }}>
                <table>
                  <thead><tr><th>Produit</th><th>Quantité</th><th>Unité</th></tr></thead>
                  <tbody>
                    {(detailModal.lines || []).map((l) => (
                      <tr key={l.id}>
                        <td>{l.product?.name || '—'}</td>
                        <td>{Number(l.quantity).toFixed(2)}</td>
                        <td>{l.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <strong style={{ fontSize: 13 }}>Observations :</strong>
                <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>{detailModal.observations || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
