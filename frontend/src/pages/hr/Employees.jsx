import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiCheck, FiX, FiEdit2, FiFileText, FiUpload, FiTrash2, FiFile, FiKey, FiCopy, FiUserX, FiUserCheck, FiUser, FiCalendar } from 'react-icons/fi';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : (import.meta.env.DEV ? 'http://localhost:4000' : '');

const fileHref = (url) => (url?.startsWith('http') ? url : `${BACKEND_ORIGIN}${url}`);

function GeneratedPasswordModal({ user, endpoint, onClose }) {
  const [generatedPassword, setGeneratedPassword] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(endpoint);
      setGeneratedPassword(data.password);
      toast.success('Mot de passe généré et sauvegardé');
    } catch { toast.error('Erreur lors de la génération du mot de passe'); }
    finally { setLoading(false); }
  };

  const handleCopy = () => { navigator.clipboard.writeText(generatedPassword); toast.success('Mot de passe copié'); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header"><h3>Mot de passe — {user.firstName} {user.lastName}</h3><button className="btn btn-outline btn-sm" onClick={onClose}>Fermer</button></div>
        <div style={{ padding: 16 }}>
          {!generatedPassword ? (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGenerate} disabled={loading}>
              {loading ? 'Génération…' : 'Générer un nouveau mot de passe'}
            </button>
          ) : (
            <div>
              <p style={{ marginBottom: 8, fontWeight: 600 }}>Nouveau mot de passe :</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <code style={{ flex: 1, padding: '8px 12px', background: '#F3F4F6', borderRadius: 6, fontSize: 15, letterSpacing: 1, border: '1px solid #E5E7EB' }}>{generatedPassword}</code>
                <button className="btn btn-outline btn-sm" onClick={handleCopy} title="Copier"><FiCopy /></button>
              </div>
              <p style={{ color: '#EF4444', fontSize: 13 }}>Notez ce mot de passe — il ne sera plus affiché après fermeture.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const LEAVE_TYPE_LABEL = { CONGES_PAYES: 'Congés payés', MALADIE: 'Arrêt maladie', AUTRE: 'Autre' };
const LEAVE_STATUS_BADGE = {
  PENDING: { label: 'En attente', className: 'badge-warning' },
  APPROVED: { label: 'Validé', className: 'badge-success' },
  REJECTED: { label: 'Refusé', className: 'badge-danger' },
};

const CONTRACT_TYPES = [
  { value: '', label: '—' },
  { value: 'CDI', label: 'CDI' },
  { value: 'CDD', label: 'CDD' },
  { value: 'INTERIM', label: 'Intérim' },
  { value: 'ALTERNANCE', label: 'Alternance' },
  { value: 'STAGE', label: 'Stage' },
  { value: 'AUTRE', label: 'Autre' },
];
const CONTRACT_TYPE_LABEL = Object.fromEntries(CONTRACT_TYPES.map((c) => [c.value, c.label]));

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }
function toDateInput(d) { return d ? new Date(d).toISOString().slice(0, 10) : ''; }

const EMPTY_NEW = { firstName: '', lastName: '', email: '', phone: '' };
const EMPTY_INFO = { position: '', hireDate: '', contractType: '', observations: '' };

export default function HrEmployees() {
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [listLoading, setListLoading] = useState(false);

  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [newEmployee, setNewEmployee] = useState(EMPTY_NEW);
  const [saving, setSaving] = useState(false);

  const [infoModal, setInfoModal] = useState(null); // employee (user + employee)
  const [infoForm, setInfoForm] = useState(EMPTY_INFO);
  const [infoSaving, setInfoSaving] = useState(false);

  const [payslipsModal, setPayslipsModal] = useState(null); // employee
  const [payslips, setPayslips] = useState([]);
  const [payslipsLoading, setPayslipsLoading] = useState(false);
  const [newPeriod, setNewPeriod] = useState('');
  const [newFile, setNewFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [contractModal, setContractModal] = useState(null); // employee
  const [contractFile, setContractFile] = useState(null);
  const [contractUploading, setContractUploading] = useState(false);

  const [leavesModal, setLeavesModal] = useState(null); // employee
  const [employeeLeaves, setEmployeeLeaves] = useState([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const [balanceSaving, setBalanceSaving] = useState(false);

  const [accountModal, setAccountModal] = useState(null); // employee
  const [accountForm, setAccountForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [accountSaving, setAccountSaving] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState(null);

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const { data } = await api.get('/hr/pending');
      setPending(data.employees || []);
    } catch { toast.error('Impossible de charger les demandes en attente'); }
    finally { setPendingLoading(false); }
  };

  const loadEmployees = async (p = page, s = search) => {
    setListLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (s) params.search = s;
      const { data } = await api.get('/hr', { params });
      setEmployees(data.employees || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { toast.error('Impossible de charger les salariés'); }
    finally { setListLoading(false); }
  };

  useEffect(() => { loadPending(); loadEmployees(1, ''); }, []);

  const handleApprove = async (id) => {
    try {
      await api.post(`/hr/${id}/approve`);
      toast.success('Salarié validé — un email lui a été envoyé');
      loadPending();
      loadEmployees(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const openReject = (u) => { setRejectModal(u); setRejectReason(''); };
  const handleReject = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/hr/${rejectModal.id}/reject`, { reason: rejectReason });
      toast.success('Demande refusée');
      setRejectModal(null);
      loadPending();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const handleSearch = () => { setPage(1); loadEmployees(1, search); };
  const handleSearchClear = () => { setSearch(''); setPage(1); loadEmployees(1, ''); };
  const handlePageChange = (p) => { setPage(p); loadEmployees(p, search); };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmployee.firstName || !newEmployee.lastName || !newEmployee.email) {
      toast.error('Prénom, nom et email requis');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/hr', newEmployee);
      toast.success(data.addedToExistingAccount
        ? 'Un compte existait déjà avec cet email — l\'accès Salarié lui a été ajouté'
        : 'Salarié ajouté — un email d\'invitation lui a été envoyé');
      setAddModal(false);
      setNewEmployee(EMPTY_NEW);
      loadEmployees(1, search);
      setPage(1);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const openInfo = (emp) => {
    setInfoModal(emp);
    setInfoForm({
      position: emp.employee?.position || '',
      hireDate: toDateInput(emp.employee?.hireDate),
      contractType: emp.employee?.contractType || '',
      observations: emp.employee?.observations || '',
    });
  };

  const handleSaveInfo = async (e) => {
    e.preventDefault();
    setInfoSaving(true);
    try {
      await api.put(`/hr/${infoModal.employee.id}`, {
        position: infoForm.position || null,
        hireDate: infoForm.hireDate || null,
        contractType: infoForm.contractType || null,
        observations: infoForm.observations || null,
      });
      toast.success('Informations mises à jour');
      setInfoModal(null);
      loadEmployees(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setInfoSaving(false); }
  };

  const openPayslips = async (emp) => {
    setPayslipsModal(emp);
    setNewPeriod('');
    setNewFile(null);
    setPayslipsLoading(true);
    try {
      const { data } = await api.get(`/hr/${emp.employee.id}/payslips`);
      setPayslips(data.payslips || []);
    } catch { toast.error('Impossible de charger les fiches de paie'); }
    finally { setPayslipsLoading(false); }
  };

  const handleUploadPayslip = async () => {
    if (!/^\d{4}-\d{2}$/.test(newPeriod)) { toast.error('Période invalide (format AAAA-MM)'); return; }
    if (!newFile) { toast.error('Sélectionnez un fichier'); return; }
    const formData = new FormData();
    formData.append('file', newFile);
    formData.append('period', newPeriod);
    setUploading(true);
    try {
      await api.post(`/hr/${payslipsModal.employee.id}/payslips`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Fiche de paie déposée');
      setNewPeriod('');
      setNewFile(null);
      const { data } = await api.get(`/hr/${payslipsModal.employee.id}/payslips`);
      setPayslips(data.payslips || []);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setUploading(false); }
  };

  const handleDeletePayslip = async (payslipId) => {
    try {
      await api.delete(`/hr/payslips/${payslipId}`);
      toast.success('Fiche de paie supprimée');
      setPayslips((prev) => prev.filter((p) => p.id !== payslipId));
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const openContract = (emp) => { setContractModal(emp); setContractFile(null); };
  const handleUploadContract = async () => {
    if (!contractFile) { toast.error('Sélectionnez un fichier'); return; }
    const formData = new FormData();
    formData.append('file', contractFile);
    setContractUploading(true);
    try {
      const { data } = await api.post(`/hr/${contractModal.employee.id}/contract`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Contrat déposé');
      setContractFile(null);
      setContractModal((prev) => ({ ...prev, employee: data.employee }));
      loadEmployees(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setContractUploading(false); }
  };

  const openLeaves = async (emp) => {
    setLeavesModal(emp);
    setBalanceInput(emp.employee?.leaveBalanceDays ?? '');
    setLeavesLoading(true);
    try {
      const { data } = await api.get(`/hr/${emp.employee.id}/leaves`);
      setEmployeeLeaves(data.leaves || []);
    } catch { toast.error('Impossible de charger les congés'); }
    finally { setLeavesLoading(false); }
  };

  const handleSaveBalance = async () => {
    const value = Number(balanceInput);
    if (balanceInput === '' || Number.isNaN(value)) { toast.error('Solde invalide'); return; }
    setBalanceSaving(true);
    try {
      const { data } = await api.put(`/hr/${leavesModal.employee.id}/leave-balance`, { leaveBalanceDays: value });
      toast.success('Solde mis à jour');
      setLeavesModal((prev) => ({ ...prev, employee: data.employee }));
      loadEmployees(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setBalanceSaving(false); }
  };

  const handleDecideLeave = async (leaveId, status) => {
    try {
      await api.put(`/hr/leaves/${leaveId}/decide`, { status });
      toast.success(status === 'APPROVED' ? 'Congé validé' : 'Demande refusée');
      const { data } = await api.get(`/hr/${leavesModal.employee.id}/leaves`);
      setEmployeeLeaves(data.leaves || []);
      loadEmployees(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  const openAccount = (emp) => { setAccountModal(emp); setAccountForm({ firstName: emp.firstName, lastName: emp.lastName, email: emp.email, phone: emp.phone || '' }); };
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setAccountSaving(true);
    try {
      await api.put(`/hr/${accountModal.id}/account`, accountForm);
      toast.success('Salarié modifié');
      setAccountModal(null);
      loadEmployees(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setAccountSaving(false); }
  };

  const handleToggleActive = async (emp) => {
    const nextActive = !(emp.isActive !== false);
    if (!nextActive && !confirm(`Désactiver le compte de ${emp.firstName} ${emp.lastName} ? La connexion sera bloquée, les données seront conservées.`)) return;
    try {
      await api.put(`/hr/${emp.id}/active`, { isActive: nextActive });
      toast.success(nextActive ? 'Compte réactivé' : 'Compte désactivé');
      loadEmployees(page, search);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Salariés</h2>
        <button className="btn btn-primary" onClick={() => setAddModal(true)}><FiPlus size={14} /> Ajouter un salarié</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Demandes en attente de validation ({pending.length})</h3></div>
        {pendingLoading ? <p style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Date de demande</th><th>Actions</th></tr></thead>
              <tbody>
                {pending.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucune demande en attente</td></tr>
                ) : pending.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.lastName} {u.firstName}</td>
                    <td>{u.email}</td>
                    <td>{u.phone || '—'}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => handleApprove(u.id)}><FiCheck size={12} /> Valider</button>
                        <button className="btn btn-sm btn-danger" onClick={() => openReject(u)}><FiX size={12} /> Refuser</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header"><h3>Salariés actifs ({total})</h3></div>
        <div style={{ padding: 12, borderBottom: '1px solid var(--amc-border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-control"
              placeholder="Rechercher (nom, prénom, email)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={handleSearch}>Chercher</button>
            <button className="btn btn-outline" onClick={handleSearchClear}>Effacer</button>
          </div>
        </div>
        {listLoading ? <p style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Nom</th><th>Email</th><th>Poste</th><th>Contrat</th><th>Embauche</th><th>Compte</th><th>Actions</th></tr></thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucun salarié trouvé</td></tr>
                ) : employees.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: 600 }}>{emp.lastName} {emp.firstName}</td>
                    <td>{emp.email}</td>
                    <td>{emp.employee?.position || '—'}</td>
                    <td>{CONTRACT_TYPE_LABEL[emp.employee?.contractType || ''] || '—'}</td>
                    <td>{fmtDate(emp.employee?.hireDate)}</td>
                    <td><span className={`badge ${emp.isActive === false ? 'badge-danger' : 'badge-success'}`}>{emp.isActive === false ? 'Désactivé' : 'Actif'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-outline" onClick={() => openAccount(emp)}><FiUser size={12} /> Compte</button>
                        <button className="btn btn-sm btn-outline" onClick={() => openInfo(emp)}><FiEdit2 size={12} /> Infos</button>
                        <button className="btn btn-sm btn-outline" onClick={() => openPayslips(emp)}><FiFileText size={12} /> Fiches de paie</button>
                        <button className="btn btn-sm btn-outline" onClick={() => openContract(emp)}><FiFile size={12} /> Contrat</button>
                        <button className="btn btn-sm btn-outline" onClick={() => openLeaves(emp)}><FiCalendar size={12} /> Congés</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setPasswordModalUser(emp)}><FiKey size={12} /> MDP</button>
                        <button className="btn btn-sm btn-outline" onClick={() => handleToggleActive(emp)}>
                          {emp.isActive === false ? <><FiUserCheck size={12} /> Réactiver</> : <><FiUserX size={12} /> Désactiver</>}
                        </button>
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
            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>Précédent</button>
            <span style={{ padding: '4px 12px', color: '#6B7280' }}>Page {page} / {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>Suivant</button>
          </div>
        )}
      </div>

      {/* Modal refus */}
      {rejectModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Refuser la demande de {rejectModal.firstName} {rejectModal.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setRejectModal(null)}>Fermer</button></div>
            <form onSubmit={handleReject} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Motif (optionnel, envoyé par email)</label>
                <textarea className="form-control" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setRejectModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-danger">Confirmer le refus</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ajout salarié */}
      {addModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Ajouter un salarié</h3><button className="btn btn-outline btn-sm" onClick={() => setAddModal(false)}>Fermer</button></div>
            <form onSubmit={handleAddEmployee} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
                Si l'email est nouveau, un compte est créé et un email d'invitation est envoyé pour définir le mot de passe.
                Si un compte existe déjà avec cet email, l'accès Salarié lui est simplement ajouté.
              </p>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prénom *</label>
                <input className="form-control" value={newEmployee.firstName} onChange={(e) => setNewEmployee((p) => ({ ...p, firstName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input className="form-control" value={newEmployee.lastName} onChange={(e) => setNewEmployee((p) => ({ ...p, lastName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Email *</label>
                <input className="form-control" type="email" value={newEmployee.email} onChange={(e) => setNewEmployee((p) => ({ ...p, email: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Téléphone</label>
                <input className="form-control" value={newEmployee.phone} onChange={(e) => setNewEmployee((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setAddModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal infos salarié */}
      {infoModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 440 }}>
            <div className="card-header"><h3>Informations — {infoModal.firstName} {infoModal.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setInfoModal(null)}>Fermer</button></div>
            <form onSubmit={handleSaveInfo} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Poste</label>
                <input className="form-control" value={infoForm.position} onChange={(e) => setInfoForm((p) => ({ ...p, position: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Date d'embauche</label>
                <input className="form-control" type="date" value={infoForm.hireDate} onChange={(e) => setInfoForm((p) => ({ ...p, hireDate: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Type de contrat</label>
                <select className="form-control" value={infoForm.contractType} onChange={(e) => setInfoForm((p) => ({ ...p, contractType: e.target.value }))}>
                  {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Observations</label>
                <textarea className="form-control" rows={3} value={infoForm.observations} onChange={(e) => setInfoForm((p) => ({ ...p, observations: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setInfoModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={infoSaving}>{infoSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal fiches de paie */}
      {payslipsModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 560 }}>
            <div className="card-header"><h3>Fiches de paie — {payslipsModal.firstName} {payslipsModal.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setPayslipsModal(null)}>Fermer</button></div>
            <div style={{ padding: 16 }}>
              {payslipsLoading ? <p style={{ textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
                <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
                  {payslips.length === 0 ? (
                    <p style={{ color: '#94A3B8', fontSize: 13 }}>Aucune fiche de paie déposée</p>
                  ) : payslips.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid var(--amc-border)', fontSize: 13 }}>
                      <FiFile size={14} color="#6B7280" />
                      <span style={{ fontWeight: 600 }}>{p.period}</span>
                      <a href={fileHref(p.fileUrl)} target="_blank" rel="noreferrer" style={{ flex: 1, color: 'var(--amc-primary)' }}>{p.fileName || 'Document'}</a>
                      <button className="btn btn-sm btn-outline" onClick={() => handleDeletePayslip(p.id)}><FiTrash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--amc-border)' }}>
                <input className="form-control" style={{ maxWidth: 140 }} placeholder="AAAA-MM" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} />
                <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setNewFile(e.target.files?.[0] || null)} />
                <button type="button" className="btn btn-sm btn-primary" onClick={handleUploadPayslip} disabled={uploading}>
                  <FiUpload size={12} /> {uploading ? '…' : 'Déposer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal contrat de travail */}
      {contractModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 460 }}>
            <div className="card-header"><h3>Contrat — {contractModal.firstName} {contractModal.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setContractModal(null)}>Fermer</button></div>
            <div style={{ padding: 16 }}>
              {contractModal.employee?.contractFileUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid var(--amc-border)', fontSize: 13, marginBottom: 16 }}>
                  <FiFile size={14} color="#6B7280" />
                  <a href={fileHref(contractModal.employee.contractFileUrl)} target="_blank" rel="noreferrer" style={{ flex: 1, color: 'var(--amc-primary)' }}>{contractModal.employee.contractFileName || 'Document'}</a>
                </div>
              ) : (
                <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>Aucun contrat déposé</p>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--amc-border)' }}>
                <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setContractFile(e.target.files?.[0] || null)} />
                <button type="button" className="btn btn-sm btn-primary" onClick={handleUploadContract} disabled={contractUploading}>
                  <FiUpload size={12} /> {contractUploading ? '…' : (contractModal.employee?.contractFileUrl ? 'Remplacer' : 'Déposer')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal congés */}
      {leavesModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 640 }}>
            <div className="card-header"><h3>Congés — {leavesModal.firstName} {leavesModal.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setLeavesModal(null)}>Fermer</button></div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--amc-border)' }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Solde de congés payés (jours)</label>
                <input className="form-control" type="number" step="0.5" style={{ maxWidth: 100 }} value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} />
                <button className="btn btn-sm btn-primary" onClick={handleSaveBalance} disabled={balanceSaving}>{balanceSaving ? '…' : 'Enregistrer'}</button>
              </div>
              {leavesLoading ? <p style={{ textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
                <div className="table-container">
                  <table>
                    <thead><tr><th>Type</th><th>Période</th><th>Jours</th><th>Statut</th><th>Actions</th></tr></thead>
                    <tbody>
                      {employeeLeaves.length === 0 ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: 16, color: '#94A3B8' }}>Aucune demande de congé</td></tr>
                      ) : employeeLeaves.map((l) => (
                        <tr key={l.id}>
                          <td>{LEAVE_TYPE_LABEL[l.type] || l.type}</td>
                          <td>{fmtDate(l.startDate)} → {fmtDate(l.endDate)}</td>
                          <td>{l.daysCount}</td>
                          <td><span className={`badge ${LEAVE_STATUS_BADGE[l.status]?.className || 'badge-gray'}`}>{LEAVE_STATUS_BADGE[l.status]?.label || l.status}</span></td>
                          <td>
                            {l.status === 'PENDING' && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-sm btn-primary" onClick={() => handleDecideLeave(l.id, 'APPROVED')}><FiCheck size={12} /></button>
                                <button className="btn btn-sm btn-danger" onClick={() => handleDecideLeave(l.id, 'REJECTED')}><FiX size={12} /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal compte salarié */}
      {accountModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 420 }}>
            <div className="card-header"><h3>Compte — {accountModal.firstName} {accountModal.lastName}</h3><button className="btn btn-outline btn-sm" onClick={() => setAccountModal(null)}>Fermer</button></div>
            <form onSubmit={handleSaveAccount} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prénom *</label>
                <input className="form-control" value={accountForm.firstName} onChange={(e) => setAccountForm((p) => ({ ...p, firstName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input className="form-control" value={accountForm.lastName} onChange={(e) => setAccountForm((p) => ({ ...p, lastName: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Email *</label>
                <input className="form-control" type="email" value={accountForm.email} onChange={(e) => setAccountForm((p) => ({ ...p, email: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Téléphone</label>
                <input className="form-control" value={accountForm.phone} onChange={(e) => setAccountForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setAccountModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={accountSaving}>{accountSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordModalUser && (
        <GeneratedPasswordModal user={passwordModalUser} endpoint={`/hr/${passwordModalUser.id}/generate-password`} onClose={() => setPasswordModalUser(null)} />
      )}
    </div>
  );
}
