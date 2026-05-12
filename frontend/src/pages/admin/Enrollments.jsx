import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

export default function AdminEnrollments() {
  const [enrollments, setEnrollments] = useState([]);
  const [statusUpdates, setStatusUpdates] = useState({});
  const [classes, setClasses] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [editingEnrollment, setEditingEnrollment] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/admin/enrollments'),
      api.get('/admin/classes'),
      api.get('/admin/school-years'),
    ])
      .then(([enrollmentsRes, classesRes, yearsRes]) => {
        setEnrollments(enrollmentsRes.data.enrollments || []);
        setClasses(classesRes.data.classes || []);
        setSchoolYears(yearsRes.data.schoolYears || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const statusBadge = (status) => {
    const map = {
      PENDING: { cls: 'badge-warning', label: 'En attente' },
      CONFIRMED: { cls: 'badge-success', label: 'Confirmée' },
      CANCELLED: { cls: 'badge-danger', label: 'Annulée' },
      ARCHIVED: { cls: 'badge-gray', label: 'Archivée' },
    };
    const s = map[status] || { cls: 'badge-gray', label: status };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
    : (import.meta.env.DEV ? 'http://localhost:4000' : '');

  const getPhotoSource = (photoUrl) => {
    if (!photoUrl) return null;
    return photoUrl.startsWith('http') ? photoUrl : `${BACKEND_ORIGIN}${photoUrl}`;
  };

  const handleStatusChange = (enrollmentId, value) => {
    setStatusUpdates((prev) => ({ ...prev, [enrollmentId]: value }));
  };

  const saveStatus = async (enrollment) => {
    const newStatus = statusUpdates[enrollment.id] || enrollment.status;
    if (newStatus === enrollment.status) return;

    if (newStatus === 'CANCELLED' && enrollment.status !== 'CANCELLED') {
      const confirmed = window.confirm('Êtes-vous sûr de vouloir annuler cette inscription ? Cette action est réversible mais affectera le nombre d’élèves inscrits dans la classe.');
      if (!confirmed) return;
    }

    try {
      const { data } = await api.put(`/admin/enrollments/${enrollment.id}`, { status: newStatus });
      setEnrollments((prev) => prev.map((e) => (e.id === enrollment.id ? data.enrollment : e)));
      setStatusUpdates((prev) => {
        const next = { ...prev };
        delete next[enrollment.id];
        return next;
      });
      toast.success('Statut d’inscription mis à jour');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  const getActiveHealthForm = (enrollment) => {
    const forms = enrollment.student?.healthForms || [];
    return forms.find((form) => form.schoolYearId === enrollment.schoolYearId) || forms[0] || null;
  };

  const getActiveConsent = (enrollment) => {
    const consents = enrollment.student?.enrollmentConsents || [];
    return consents.find((c) => c.schoolYearId === enrollment.schoolYearId && c.consentType === 'SANITARY_FORM') || consents.find((c) => c.consentType === 'SANITARY_FORM') || null;
  };

  const openEditModal = (enrollment) => {
    const healthForm = getActiveHealthForm(enrollment) || {};
    const consent = getActiveConsent(enrollment) || {};
    setEditingEnrollment(enrollment);
    setEditForm({
      status: enrollment.status,
      classId: enrollment.classId,
      schoolYearId: enrollment.schoolYearId,
      comment: enrollment.comment || '',
      student: {
        firstName: enrollment.student?.firstName || '',
        lastName: enrollment.student?.lastName || '',
        dateOfBirth: enrollment.student?.dateOfBirth ? enrollment.student.dateOfBirth.slice(0, 10) : '',
        gender: enrollment.student?.gender || 'GARCON',
        allergies: enrollment.student?.allergies || '',
        currentTreatments: enrollment.student?.currentTreatments || '',
        photoUrl: enrollment.student?.photoUrl || '',
      },
      family: {
        familyName: enrollment.student?.family?.familyName || '',
        addressLine1: enrollment.student?.family?.addressLine1 || '',
        addressLine2: enrollment.student?.family?.addressLine2 || '',
        postalCode: enrollment.student?.family?.postalCode || '',
        city: enrollment.student?.family?.city || '',
        country: enrollment.student?.family?.country || 'France',
        phonePrimary: enrollment.student?.family?.phonePrimary || '',
        phoneSecondary: enrollment.student?.family?.phoneSecondary || '',
      },
      healthForm: {
        hasChronicDisease: Boolean(healthForm.hasChronicDisease),
        chronicDiseaseDetails: healthForm.chronicDiseaseDetails || '',
        hasMedicalTreatment: Boolean(healthForm.hasMedicalTreatment),
        medicalTreatmentDetails: healthForm.medicalTreatmentDetails || '',
        hasAllergy: Boolean(healthForm.hasAllergy),
        allergyDetails: healthForm.allergyDetails || '',
        hasDisability: Boolean(healthForm.hasDisability),
        disabilityDetails: healthForm.disabilityDetails || '',
        otherUsefulHealthInfo: healthForm.otherUsefulHealthInfo || '',
        canLeaveAloneAfterClass:
          healthForm.canLeaveAloneAfterClass === undefined || healthForm.canLeaveAloneAfterClass === null
            ? null
            : healthForm.canLeaveAloneAfterClass,
        legalRepresentativeFullName: consent.acceptedByFullName || '',
        citySigned: consent.citySigned || '',
        signedAt: consent.signedAt ? consent.signedAt.slice(0, 10) : '',
        confidentialityAccepted: Boolean(healthForm.confidentialityAccepted),
        noMedicationPolicyAccepted: Boolean(healthForm.noMedicationPolicyAccepted),
        emergencyContacts: healthForm.emergencyContacts?.length > 0
          ? healthForm.emergencyContacts
          : [{ firstName: '', lastName: '', relationship: '', phone: '' }],
        pickupAuthorizedPersons: healthForm.pickupAuthorizedPersons?.length > 0
          ? healthForm.pickupAuthorizedPersons
          : [{ fullName: '', relationship: '', phone: '' }],
      },
    });
    setModalOpen(true);
  };

  const updateEditForm = (section, field, value) => {
    if (!section) {
      setEditForm((prev) => ({
        ...prev,
        [field]: value,
      }));
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const updateHealthFormArray = (arrayField, index, field, value) => {
    setEditForm((prev) => {
      const nextArray = [...prev.healthForm[arrayField]];
      nextArray[index] = { ...nextArray[index], [field]: value };
      return {
        ...prev,
        healthForm: {
          ...prev.healthForm,
          [arrayField]: nextArray,
        },
      };
    });
  };

  const addHealthFormRow = (arrayField, emptyRow) => {
    setEditForm((prev) => ({
      ...prev,
      healthForm: {
        ...prev.healthForm,
        [arrayField]: [...prev.healthForm[arrayField], emptyRow],
      },
    }));
  };

  const removeHealthFormRow = (arrayField, index) => {
    setEditForm((prev) => ({
      ...prev,
      healthForm: {
        ...prev.healthForm,
        [arrayField]: prev.healthForm[arrayField].filter((_, idx) => idx !== index),
      },
    }));
  };

  const buildHealthFormPayload = (form) => {
    if (!form) return null;

    const emergencyContacts = Array.isArray(form.emergencyContacts)
      ? form.emergencyContacts.filter(
          (contact) => contact.firstName?.trim() || contact.lastName?.trim() || contact.relationship?.trim() || contact.phone?.trim(),
        )
      : [];

    const pickupAuthorizedPersons = Array.isArray(form.pickupAuthorizedPersons)
      ? form.pickupAuthorizedPersons.filter(
          (person) => person.fullName?.trim() || person.relationship?.trim() || person.phone?.trim(),
        )
      : [];

    const payload = {
      hasChronicDisease: Boolean(form.hasChronicDisease),
      chronicDiseaseDetails: form.chronicDiseaseDetails?.trim() || null,
      hasMedicalTreatment: Boolean(form.hasMedicalTreatment),
      medicalTreatmentDetails: form.medicalTreatmentDetails?.trim() || null,
      hasAllergy: Boolean(form.hasAllergy),
      allergyDetails: form.allergyDetails?.trim() || null,
      hasDisability: Boolean(form.hasDisability),
      disabilityDetails: form.disabilityDetails?.trim() || null,
      otherUsefulHealthInfo: form.otherUsefulHealthInfo?.trim() || null,
      canLeaveAloneAfterClass: form.canLeaveAloneAfterClass === undefined || form.canLeaveAloneAfterClass === null
        ? null
        : form.canLeaveAloneAfterClass,
      legalRepresentativeFullName: form.legalRepresentativeFullName?.trim() || null,
      citySigned: form.citySigned?.trim() || null,
      signedAt: form.signedAt?.trim() || null,
      confidentialityAccepted: Boolean(form.confidentialityAccepted),
      noMedicationPolicyAccepted: Boolean(form.noMedicationPolicyAccepted),
      emergencyContacts,
      pickupAuthorizedPersons,
    };

    const hasValue = Object.entries(payload).some(([key, value]) => {
      if (key === 'emergencyContacts' || key === 'pickupAuthorizedPersons') {
        return value.length > 0;
      }
      if (value === null) return false;
      if (typeof value === 'boolean') return value === true;
      if (typeof value === 'string') return value.trim() !== '';
      return true;
    });

    return hasValue ? payload : null;
  };

  const saveEnrollment = async () => {
    if (!editingEnrollment || !editForm) return;
    try {
      const studentPayload = {
        firstName: editForm.student.firstName,
        lastName: editForm.student.lastName,
        gender: editForm.student.gender,
        allergies: editForm.student.allergies,
        currentTreatments: editForm.student.currentTreatments,
      };
      if (editForm.student.dateOfBirth) studentPayload.dateOfBirth = editForm.student.dateOfBirth;

      const payload = {
        status: editForm.status,
        classId: editForm.classId,
        schoolYearId: editForm.schoolYearId,
        comment: editForm.comment,
        student: studentPayload,
        family: editForm.family,
      };

      const healthFormPayload = buildHealthFormPayload(editForm.healthForm);
      if (healthFormPayload) {
        payload.healthForm = healthFormPayload;
      }

      const { data } = await api.put(`/admin/enrollments/${editingEnrollment.id}`, payload);
      setEnrollments((prev) => prev.map((e) => (e.id === editingEnrollment.id ? data.enrollment : e)));
      toast.success('Inscription mise à jour');
      setModalOpen(false);
      setEditingEnrollment(null);
      setEditForm(null);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEnrollment(null);
    setEditForm(null);
  };

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 1000,
  };

  const modalStyle = {
    width: 'min(900px, 100%)',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>Gestion des inscriptions</h2>

      <div className="card">
        {loading ? <p>Chargement...</p> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Réf. inscription</th>
                  <th>Élève</th>
                  <th>Pôle</th>
                  <th>Niveau</th>
                  <th>Créneau</th>
                  <th>Année</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: '#6B7280' }}>Aucune inscription</td></tr>
                ) : enrollments.map((e) => {
                  const selectedStatus = statusUpdates[e.id] || e.status;
                  return (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 700 }}>{e.registrationCode || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{e.student.lastName} {e.student.firstName}</td>
                      <td>{e.class?.level?.pole?.name}</td>
                      <td>{e.class?.level?.name}</td>
                      <td>{e.class?.dayOfWeek} {e.class?.startTime}-{e.class?.endTime}</td>
                      <td>{e.schoolYear?.label}</td>
                      <td>{statusBadge(selectedStatus)}</td>
                      <td style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={selectedStatus} onChange={(event) => handleStatusChange(e.id, event.target.value)}>
                          <option value="PENDING">En attente</option>
                          <option value="CONFIRMED">Confirmée</option>
                          <option value="CANCELLED">Annulée</option>
                          <option value="ARCHIVED">Archivée</option>
                        </select>
                        <button
                          className="btn btn-sm btn-primary"
                          type="button"
                          disabled={selectedStatus === e.status}
                          onClick={() => saveStatus(e)}
                        >
                          Enregistrer
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          onClick={() => openEditModal(e)}
                        >
                          Modifier
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && editForm && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <div className="card-header" style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <h3>Modifier l’inscription</h3>
                <p style={{ margin: '6px 0 0', color: '#6B7280' }}>Mettre à jour les informations d’inscription, famille, élève et fiche sanitaire.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {editForm.student?.photoUrl && (
                  <img
                    src={getPhotoSource(editForm.student.photoUrl)}
                    alt={`${editForm.student.firstName} ${editForm.student.lastName}`}
                    style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12, border: '1px solid #E2E8F0' }}
                  />
                )}
                <button type="button" className="btn btn-outline btn-sm" onClick={closeModal}>Fermer</button>
              </div>
            </div>

            <div className="form-section">
              <h4>Infos d’inscription</h4>
              <div className="form-grid-3">
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Statut</label>
                  <select className="form-control" value={editForm.status} onChange={(event) => updateEditForm(null, 'status', event.target.value)}>
                    <option value="PENDING">En attente</option>
                    <option value="CONFIRMED">Confirmée</option>
                    <option value="CANCELLED">Annulée</option>
                    <option value="ARCHIVED">Archivée</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Classe</label>
                  <select className="form-control" value={editForm.classId} onChange={(event) => updateEditForm(null, 'classId', event.target.value)}>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>{`${cls.level?.pole?.name || ''} • ${cls.level?.name || ''} • ${cls.dayOfWeek || ''}`}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Année scolaire</label>
                  <select className="form-control" value={editForm.schoolYearId} onChange={(event) => updateEditForm(null, 'schoolYearId', event.target.value)}>
                    {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label>Commentaire interne</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={editForm.comment}
                    onChange={(event) => updateEditForm(null, 'comment', event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Informations famille</h4>
              <div className="form-grid-2">
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nom de la famille</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.family.familyName}
                    onChange={(event) => updateEditForm('family', 'familyName', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Téléphone principal</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.family.phonePrimary}
                    onChange={(event) => updateEditForm('family', 'phonePrimary', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Adresse</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.family.addressLine1}
                    onChange={(event) => updateEditForm('family', 'addressLine1', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Complément adresse</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.family.addressLine2}
                    onChange={(event) => updateEditForm('family', 'addressLine2', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Code postal</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.family.postalCode}
                    onChange={(event) => updateEditForm('family', 'postalCode', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Ville</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.family.city}
                    onChange={(event) => updateEditForm('family', 'city', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Pays</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.family.country}
                    onChange={(event) => updateEditForm('family', 'country', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Téléphone secondaire</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.family.phoneSecondary}
                    onChange={(event) => updateEditForm('family', 'phoneSecondary', event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Informations élève</h4>
              <div className="form-grid-2">
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Prénom</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.student.firstName}
                    onChange={(event) => updateEditForm('student', 'firstName', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nom</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.student.lastName}
                    onChange={(event) => updateEditForm('student', 'lastName', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date de naissance</label>
                  <input
                    type="date"
                    className="form-control"
                    value={editForm.student.dateOfBirth}
                    onChange={(event) => updateEditForm('student', 'dateOfBirth', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Genre</label>
                  <select
                    className="form-control"
                    value={editForm.student.gender}
                    onChange={(event) => updateEditForm('student', 'gender', event.target.value)}
                  >
                    <option value="GARCON">Garçon</option>
                    <option value="FILLE">Fille</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Allergies</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.student.allergies}
                    onChange={(event) => updateEditForm('student', 'allergies', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Traitements</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.student.currentTreatments}
                    onChange={(event) => updateEditForm('student', 'currentTreatments', event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Fiche sanitaire</h4>
              <div className="form-grid-2">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="field-group-inline">
                    <input
                      type="checkbox"
                      checked={editForm.healthForm.hasChronicDisease}
                      onChange={(event) => updateEditForm('healthForm', 'hasChronicDisease', event.target.checked)}
                    /> Maladies chroniques
                  </label>
                  {editForm.healthForm.hasChronicDisease && (
                    <textarea
                      className="form-control"
                      value={editForm.healthForm.chronicDiseaseDetails}
                      onChange={(event) => updateEditForm('healthForm', 'chronicDiseaseDetails', event.target.value)}
                      rows={2}
                    />
                  )}
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="field-group-inline">
                    <input
                      type="checkbox"
                      checked={editForm.healthForm.hasMedicalTreatment}
                      onChange={(event) => updateEditForm('healthForm', 'hasMedicalTreatment', event.target.checked)}
                    /> Traitement médical
                  </label>
                  {editForm.healthForm.hasMedicalTreatment && (
                    <textarea
                      className="form-control"
                      value={editForm.healthForm.medicalTreatmentDetails}
                      onChange={(event) => updateEditForm('healthForm', 'medicalTreatmentDetails', event.target.value)}
                      rows={2}
                    />
                  )}
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="field-group-inline">
                    <input
                      type="checkbox"
                      checked={editForm.healthForm.hasAllergy}
                      onChange={(event) => updateEditForm('healthForm', 'hasAllergy', event.target.checked)}
                    /> Allergies
                  </label>
                  {editForm.healthForm.hasAllergy && (
                    <textarea
                      className="form-control"
                      value={editForm.healthForm.allergyDetails}
                      onChange={(event) => updateEditForm('healthForm', 'allergyDetails', event.target.value)}
                      rows={2}
                    />
                  )}
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="field-group-inline">
                    <input
                      type="checkbox"
                      checked={editForm.healthForm.hasDisability}
                      onChange={(event) => updateEditForm('healthForm', 'hasDisability', event.target.checked)}
                    /> Handicap
                  </label>
                  {editForm.healthForm.hasDisability && (
                    <textarea
                      className="form-control"
                      value={editForm.healthForm.disabilityDetails}
                      onChange={(event) => updateEditForm('healthForm', 'disabilityDetails', event.target.value)}
                      rows={2}
                    />
                  )}
                </div>
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label>Autres informations utiles</label>
                  <textarea
                    className="form-control"
                    value={editForm.healthForm.otherUsefulHealthInfo}
                    onChange={(event) => updateEditForm('healthForm', 'otherUsefulHealthInfo', event.target.value)}
                    rows={3}
                  />
                </div>
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label>Sortie seul après le cours</label>
                  <div className="inline-options">
                    <label>
                      <input
                        type="radio"
                        checked={editForm.healthForm.canLeaveAloneAfterClass === true}
                        onChange={() => updateEditForm('healthForm', 'canLeaveAloneAfterClass', true)}
                      /> Oui
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={editForm.healthForm.canLeaveAloneAfterClass === false}
                        onChange={() => updateEditForm('healthForm', 'canLeaveAloneAfterClass', false)}
                      /> Non
                    </label>
                  </div>
                </div>
                {editForm.healthForm.canLeaveAloneAfterClass === false && (
                  <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                    <label>Personnes autorisées à récupérer l’enfant</label>
                    {(editForm.healthForm.pickupAuthorizedPersons || []).map((person, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                        <input
                          className="form-control"
                          placeholder="Nom complet"
                          value={person.fullName || ''}
                          onChange={(event) => updateHealthFormArray('pickupAuthorizedPersons', idx, 'fullName', event.target.value)}
                        />
                        <input
                          className="form-control"
                          placeholder="Lien"
                          value={person.relationship || ''}
                          onChange={(event) => updateHealthFormArray('pickupAuthorizedPersons', idx, 'relationship', event.target.value)}
                        />
                        <input
                          className="form-control"
                          placeholder="Téléphone"
                          value={person.phone || ''}
                          onChange={(event) => updateHealthFormArray('pickupAuthorizedPersons', idx, 'phone', event.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => removeHealthFormRow('pickupAuthorizedPersons', idx)}
                        >
                          Supprimer
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => addHealthFormRow('pickupAuthorizedPersons', { fullName: '', relationship: '', phone: '' })}
                    >
                      Ajouter une personne autorisée
                    </button>
                  </div>
                )}
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label>Contacts d'urgence</label>
                  {(editForm.healthForm.emergencyContacts || []).map((contact, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                      <input
                        className="form-control"
                        placeholder="Prénom"
                        value={contact.firstName || ''}
                        onChange={(event) => updateHealthFormArray('emergencyContacts', idx, 'firstName', event.target.value)}
                      />
                      <input
                        className="form-control"
                        placeholder="Nom"
                        value={contact.lastName || ''}
                        onChange={(event) => updateHealthFormArray('emergencyContacts', idx, 'lastName', event.target.value)}
                      />
                      <input
                        className="form-control"
                        placeholder="Téléphone"
                        value={contact.phone || ''}
                        onChange={(event) => updateHealthFormArray('emergencyContacts', idx, 'phone', event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => removeHealthFormRow('emergencyContacts', idx)}
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => addHealthFormRow('emergencyContacts', { firstName: '', lastName: '', relationship: '', phone: '' })}
                  >
                    Ajouter un contact d'urgence
                  </button>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Nom du représentant</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.healthForm.legalRepresentativeFullName}
                    onChange={(event) => updateEditForm('healthForm', 'legalRepresentativeFullName', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Ville de signature</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.healthForm.citySigned}
                    onChange={(event) => updateEditForm('healthForm', 'citySigned', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date de signature</label>
                  <input
                    type="date"
                    className="form-control"
                    value={editForm.healthForm.signedAt}
                    onChange={(event) => updateEditForm('healthForm', 'signedAt', event.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={editForm.healthForm.confidentialityAccepted}
                      onChange={(event) => updateEditForm('healthForm', 'confidentialityAccepted', event.target.checked)}
                    /> J'accepte la confidentialité
                  </label>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={editForm.healthForm.noMedicationPolicyAccepted}
                      onChange={(event) => updateEditForm('healthForm', 'noMedicationPolicyAccepted', event.target.checked)}
                    /> Politique sans médicament
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-outline" onClick={closeModal}>Annuler</button>
              <button type="button" className="btn btn-primary" onClick={saveEnrollment}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
