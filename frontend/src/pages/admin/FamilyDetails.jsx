import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiDownload } from 'react-icons/fi';
import api from '../../api/axios';

const EMPTY_PARENT = { civility: 'M', firstName: '', lastName: '', email: '', phone: '', link: 'PERE', isLegalGuardian: false };

const paymentStatusLabels = {
  COMPLETED: 'Payé',
  SUCCEEDED: 'validé',
  CANCELLED: 'annulé',
  PENDING: 'en attente',
  FAILED: 'échoué',
  PROCESSING: 'en traitement',
};

const formatPaymentStatus = (status) => paymentStatusLabels[status] || status || '—';
const EMPTY_STUDENT = { firstName: '', lastName: '', dateOfBirth: '', gender: 'GARCON', allergies: '', currentTreatments: '', emergencyContactName: '', emergencyContactPhone: '', photoUrl: '' };

export default function AdminFamilyDetails() {
  const { id } = useParams();
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [parentForm, setParentForm] = useState(EMPTY_PARENT);
  const [studentForm, setStudentForm] = useState(EMPTY_STUDENT);
  const [editParentId, setEditParentId] = useState(null);
  const [editStudentId, setEditStudentId] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
    : (import.meta.env.DEV ? 'http://localhost:4000' : '');

  const getPhotoSource = (photoUrl) => {
    if (!photoUrl) return null;
    return photoUrl.startsWith('http') ? photoUrl : `${BACKEND_ORIGIN}${photoUrl}`;
  };

  const totalPaid = useMemo(
    () => (family?.payments || []).reduce((sum, p) => sum + Number(p.paidAmount || 0), 0),
    [family],
  );
  const totalDue = useMemo(
    () => (family?.payments || []).reduce((sum, p) => sum + Number(p.totalAmount || 0), 0),
    [family],
  );

  async function loadFamily() {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/families/${id}`);
      setFamily(data.family);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Impossible de charger la fiche famille');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFamily();
  }, [id]);

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
      toast.error(errorMessage);
    } finally {
      setDownloading(null);
    }
  };

  async function submitParent(event) {
    event.preventDefault();
    try {
      if (editParentId) {
        await api.put(`/admin/families/${id}/parents/${editParentId}`, parentForm);
        toast.success('Parent mis à jour');
      } else {
        await api.post(`/admin/families/${id}/parents`, parentForm);
        toast.success('Parent ajouté');
      }
      setParentForm(EMPTY_PARENT);
      setEditParentId(null);
      loadFamily();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur parent');
    }
  }

  async function deleteParent(parentId) {
    if (!window.confirm('Supprimer ce parent ?')) return;
    try {
      await api.delete(`/admin/families/${id}/parents/${parentId}`);
      toast.success('Parent supprimé');
      loadFamily();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur suppression parent');
    }
  }

  async function submitStudent(event) {
    event.preventDefault();
    try {
      if (editStudentId) {
        await api.put(`/admin/families/${id}/students/${editStudentId}`, studentForm);
        toast.success('Élève mis à jour');
      } else {
        await api.post(`/admin/families/${id}/students`, studentForm);
        toast.success('Élève ajouté');
      }
      setStudentForm(EMPTY_STUDENT);
      setEditStudentId(null);
      loadFamily();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur élève');
    }
  }

  async function deleteStudent(studentId) {
    if (!window.confirm('Supprimer cet élève ?')) return;
    try {
      await api.delete(`/admin/families/${id}/students/${studentId}`);
      toast.success('Élève supprimé');
      loadFamily();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur suppression élève');
    }
  }

  if (loading) return <p>Chargement...</p>;
  if (!family) return <p>Famille introuvable.</p>;

  return (
    <div>
      <div className="flex-between mb-2">
        <h2 style={{ color: 'var(--amc-primary)' }}>Fiche famille — {family.familyName}</h2>
        <Link className="btn btn-outline btn-sm" to="/admin/families">Retour liste</Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-info"><h4>{family.parents?.length || 0}</h4><p>Parents</p></div></div>
        <div className="stat-card"><div className="stat-info"><h4>{family.students?.length || 0}</h4><p>Élèves</p></div></div>
        <div className="stat-card"><div className="stat-info"><h4>{totalDue.toFixed(2)}€</h4><p>Total paiements</p></div></div>
        <div className="stat-card"><div className="stat-info"><h4>{Math.max(totalDue - totalPaid, 0).toFixed(2)}€</h4><p>Impayés</p></div></div>
      </div>

      <div className="card mb-2">
        <div className="card-header"><h3>Informations famille</h3></div>
        <p><strong>Responsable :</strong> {family.user?.firstName} {family.user?.lastName} — {family.user?.email}</p>
        <p><strong>Adresse :</strong> {family.addressLine1}, {family.postalCode} {family.city}</p>
        <p><strong>Téléphone principal :</strong> {family.phonePrimary}</p>
      </div>

      <div className="card mb-2">
        <div className="card-header"><h3>Gestion des parents</h3></div>
        <form onSubmit={submitParent} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          <input className="form-control" placeholder="Prénom" value={parentForm.firstName} onChange={(e) => setParentForm((p) => ({ ...p, firstName: e.target.value }))} required />
          <input className="form-control" placeholder="Nom" value={parentForm.lastName} onChange={(e) => setParentForm((p) => ({ ...p, lastName: e.target.value }))} required />
          <input className="form-control" placeholder="Email" value={parentForm.email || ''} onChange={(e) => setParentForm((p) => ({ ...p, email: e.target.value }))} />
          <input className="form-control" placeholder="Téléphone" value={parentForm.phone} onChange={(e) => setParentForm((p) => ({ ...p, phone: e.target.value }))} required />
          <select className="form-control" value={parentForm.civility} onChange={(e) => setParentForm((p) => ({ ...p, civility: e.target.value }))}><option value="M">M</option><option value="MME">Mme</option></select>
          <select className="form-control" value={parentForm.link} onChange={(e) => setParentForm((p) => ({ ...p, link: e.target.value }))}><option value="PERE">Père</option><option value="MERE">Mère</option><option value="TUTEUR_LEGAL">Tuteur légal</option></select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={parentForm.isLegalGuardian} onChange={(e) => setParentForm((p) => ({ ...p, isLegalGuardian: e.target.checked }))} /> Responsable légal</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary btn-sm" type="submit">{editParentId ? 'Mettre à jour' : 'Ajouter'}</button>
            {editParentId && <button className="btn btn-outline btn-sm" type="button" onClick={() => { setEditParentId(null); setParentForm(EMPTY_PARENT); }}>Annuler</button>}
          </div>
        </form>

        <div className="table-container">
          <table>
            <thead><tr><th>Nom</th><th>Lien</th><th>Contact</th><th>Actions</th></tr></thead>
            <tbody>
              {(family.parents || []).map((parent) => (
                <tr key={parent.id}>
                  <td>{parent.firstName} {parent.lastName}</td>
                  <td>{parent.link}</td>
                  <td>{parent.email || '—'} / {parent.phone}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => { setEditParentId(parent.id); setParentForm({ ...parent }); }}>Éditer</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => deleteParent(parent.id)}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-2">
        <div className="card-header"><h3>Gestion des élèves</h3></div>
        {editStudentId && studentForm.photoUrl && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 16px 12px 16px' }}>
            <img
              src={getPhotoSource(studentForm.photoUrl)}
              alt={`${studentForm.firstName} ${studentForm.lastName}`}
              style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 14, border: '1px solid #E2E8F0' }}
            />
          </div>
        )}
        <form onSubmit={submitStudent} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          <input className="form-control" placeholder="Prénom" value={studentForm.firstName} onChange={(e) => setStudentForm((s) => ({ ...s, firstName: e.target.value }))} required />
          <input className="form-control" placeholder="Nom" value={studentForm.lastName} onChange={(e) => setStudentForm((s) => ({ ...s, lastName: e.target.value }))} required />
          <input type="date" className="form-control" value={studentForm.dateOfBirth} onChange={(e) => setStudentForm((s) => ({ ...s, dateOfBirth: e.target.value }))} required />
          <select className="form-control" value={studentForm.gender} onChange={(e) => setStudentForm((s) => ({ ...s, gender: e.target.value }))}><option value="GARCON">Garçon</option><option value="FILLE">Fille</option></select>
          <input className="form-control" placeholder="Allergies" value={studentForm.allergies || ''} onChange={(e) => setStudentForm((s) => ({ ...s, allergies: e.target.value }))} />
          <input className="form-control" placeholder="Traitements" value={studentForm.currentTreatments || ''} onChange={(e) => setStudentForm((s) => ({ ...s, currentTreatments: e.target.value }))} />
          <input className="form-control" placeholder="Contact urgence" value={studentForm.emergencyContactName || ''} onChange={(e) => setStudentForm((s) => ({ ...s, emergencyContactName: e.target.value }))} />
          <input className="form-control" placeholder="Tél urgence" value={studentForm.emergencyContactPhone || ''} onChange={(e) => setStudentForm((s) => ({ ...s, emergencyContactPhone: e.target.value }))} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary btn-sm" type="submit">{editStudentId ? 'Mettre à jour' : 'Ajouter'}</button>
            {editStudentId && <button className="btn btn-outline btn-sm" type="button" onClick={() => { setEditStudentId(null); setStudentForm(EMPTY_STUDENT); }}>Annuler</button>}
          </div>
        </form>

        <div className="table-container">
          <table>
            <thead><tr><th>Nom</th><th>Date de naissance</th><th>Inscriptions</th><th>Actions</th></tr></thead>
            <tbody>
              {(family.students || []).map((student) => (
                <tr key={student.id}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {student.photoUrl && (
                      <img
                        src={getPhotoSource(student.photoUrl)}
                        alt={`${student.firstName} ${student.lastName}`}
                        style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 10, border: '1px solid #E2E8F0' }}
                      />
                    )}
                    {student.firstName} {student.lastName}
                  </td>
                  <td>{new Date(student.dateOfBirth).toLocaleDateString('fr-FR')}</td>
                  <td>{student.enrollments?.length || 0}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => { setEditStudentId(student.id); setStudentForm({
                      firstName: student.firstName,
                      lastName: student.lastName,
                      dateOfBirth: new Date(student.dateOfBirth).toISOString().slice(0, 10),
                      gender: student.gender,
                      allergies: student.allergies || '',
                      currentTreatments: student.currentTreatments || '',
                      emergencyContactName: student.emergencyContactName || '',
                      emergencyContactPhone: student.emergencyContactPhone || '',
                      photoUrl: student.photoUrl || '',
                    }); }}>Éditer</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => deleteStudent(student.id)}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Paiements</h3></div>
        <div className="table-container">
          <table>
            <thead><tr><th>Référence</th><th>Total</th><th>Payé</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {(family.payments || []).length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', color: '#6B7280' }}>Aucun paiement</td></tr>
              ) : (
                family.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.id.slice(0, 8).toUpperCase()}</td>
                    <td>{Number(payment.totalAmount || 0).toFixed(2)}€</td>
                    <td>{Number(payment.paidAmount || 0).toFixed(2)}€</td>
                    <td><span className={`badge badge-${payment.status === 'COMPLETED' ? 'success' : 'info'}`}>{formatPaymentStatus(payment.status)}</span></td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleDownloadInvoice(payment.id)}
                        disabled={downloading === payment.id}
                        title="Télécharger le reçu"
                      >
                        <FiDownload size={14} /> {downloading === payment.id ? '...' : 'Reçu'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
