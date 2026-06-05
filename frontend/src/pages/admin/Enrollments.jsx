import { Fragment, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { FiDownload, FiEdit2, FiTrash2, FiFileText, FiCreditCard, FiCheckCircle, FiXCircle } from 'react-icons/fi';

export default function AdminEnrollments() {
  const [enrollments, setEnrollments] = useState([]);
  const [statusUpdates, setStatusUpdates] = useState({});
  const [classes, setClasses] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [editingEnrollment, setEditingEnrollment] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentEnrollment, setPaymentEnrollment] = useState(null);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recordStudent, setRecordStudent] = useState(null);
  const [recordData, setRecordData] = useState({ absences: [], notes: [] });
  const [recordTab, setRecordTab] = useState('absences');
  const [recordLoading, setRecordLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrollmentPayments, setEnrollmentPayments] = useState([]);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [showPaymentDetail, setShowPaymentDetail] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ 
    payerName: '', 
    date: new Date().toISOString().slice(0, 10), 
    method: 'CHEQUE', 
    status: 'validé', 
    comment: '', 
    amount: '',
    bankDebitIban: '',
    bankDebitSwift: '',
    numberOfInstallments: 1,
    firstPaymentDate: new Date().toISOString().slice(0, 10),
    scheduleDay: 10,
    ribDocument: null,
  });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [refundAccessCode, setRefundAccessCode] = useState('');
  const [refundCodeValidated, setRefundCodeValidated] = useState(false);
  const [refundCodeValidating, setRefundCodeValidating] = useState(false);
  const [refundForm, setRefundForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: '', method: 'CHEQUE', comment: '' });
  const [refunds, setRefunds] = useState([]);
  const [provisionalOnly, setProvisionalOnly] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedPole, setSelectedPole] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [expandedFamilies, setExpandedFamilies] = useState({});
  const [registrationsBlocked, setRegistrationsBlocked] = useState(false);
  const [registrationBlockLoading, setRegistrationBlockLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [provisionalOnly, studentSearch, selectedPole, selectedClassId, selectedStatusFilter]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (provisionalOnly) params.set('provisional', 'true');
    if (studentSearch.trim()) params.set('studentName', studentSearch.trim());
    if (selectedPole) params.set('poleId', selectedPole);
    if (selectedClassId) params.set('classId', selectedClassId);
    if (selectedStatusFilter === 'WAITLIST') {
      params.set('waitlist', 'true');
    } else if (selectedStatusFilter) {
      params.set('status', selectedStatusFilter);
    }
    params.set('page', pagination.page);
    params.set('limit', pagination.limit);
    const enrollmentsCall = api.get(`/admin/enrollments?${params.toString()}`);
    Promise.all([
      enrollmentsCall,
      api.get('/admin/classes'),
      api.get('/admin/school-years'),
    ])
      .then(([enrollmentsRes, classesRes, yearsRes]) => {
        setEnrollments(enrollmentsRes.data.enrollments || []);
        setPagination((prev) => {
          const nextPage = enrollmentsRes.data.page || prev.page;
          const nextLimit = enrollmentsRes.data.limit || prev.limit;
          const nextTotal = enrollmentsRes.data.total || 0;
          const nextTotalPages = enrollmentsRes.data.totalPages || Math.max(Math.ceil(nextTotal / nextLimit), 1);
          if (
            prev.page === nextPage &&
            prev.limit === nextLimit &&
            prev.total === nextTotal &&
            prev.totalPages === nextTotalPages
          ) {
            return prev;
          }
          return {
            ...prev,
            page: nextPage,
            limit: nextLimit,
            total: nextTotal,
            totalPages: nextTotalPages,
          };
        });
        setClasses(classesRes.data.classes || []);
        setSchoolYears(yearsRes.data.schoolYears || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [provisionalOnly, studentSearch, selectedPole, selectedClassId, selectedStatusFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    let isMounted = true;
    const loadStatus = async () => {
      setRegistrationBlockLoading(true);
      try {
        const { data } = await api.get('/admin/enrollments/registration-block');
        if (isMounted) {
          setRegistrationsBlocked(Boolean(data.blocked));
        }
      } catch (error) {
        console.error('Impossible de charger le blocage des inscriptions', error);
      } finally {
        if (isMounted) {
          setRegistrationBlockLoading(false);
        }
      }
    };
    loadStatus();
    return () => { isMounted = false; };
  }, []);

  const statusBadge = (status, isWaitlist = false) => {
    if (status === 'PENDING' && isWaitlist) {
      return <span className="badge badge-danger">Liste d'attente</span>;
    }
    const map = {
      PENDING: { cls: 'badge-warning', label: 'En attente' },
      CONFIRMED: { cls: 'badge-success', label: 'Confirmée' },
      CANCELLED: { cls: 'badge-danger', label: 'Annulée' },
      ARCHIVED: { cls: 'badge-gray', label: 'Archivée' },
    };
    const s = map[status] || { cls: 'badge-gray', label: status };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  const isEnrollmentWaitlist = (enrollment) => {
    const hasWaitlistComment = String(enrollment.comment || '').toLowerCase().includes('liste d\'attente');
    return enrollment.status === 'PENDING' && (enrollment.class?.status === 'FULL' || hasWaitlistComment);
  };

  const decodeText = (value) => {
    if (value === undefined || value === null || value === '') return '—';
    const original = String(value);
    let decoded = original;

    try {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = original;
      decoded = textarea.value;
    } catch (err) {
      decoded = original;
    }

    if (decoded.includes('Ã') || decoded.includes('Â')) {
      try {
        decoded = decodeURIComponent(escape(decoded));
      } catch (err) {
        // keep decoded as-is if conversion fails
      }
    }

    try {
      return String(decoded).normalize('NFC');
    } catch (err) {
      return String(decoded);
    }
  };

  const formatPaymentMethodLabel = (payment = {}) => {
    const method = payment.method || payment.paymentMethod;
    const metadata = payment.paymentMetadata || {};
    const bankDebitIban = metadata.bankDebitIban || payment.bankDebitIban;

    if (method === 'PRELEVEMENT_BANCAIRE') return 'Prélèvement';
    if (method === 'VIREMENT' && bankDebitIban) return 'Prélèvement';
    if (method === 'STRIPE_SEPA' || method === 'GO_CARDLESS_SEPA') return 'Prélèvement SEPA';
    if (method === 'CB' || method === 'STRIPE_CARD') return 'Carte bancaire';
    if (method === 'CHEQUE') return 'Chèque';
    if (method === 'ESPECES') return 'Espèces';
    return method || '—';
  };

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

  const exportEnrollments = async () => {
    setExporting(true);
    try {
      const body = {
        studentName: studentSearch.trim() || undefined,
        poleId: selectedPole || undefined,
        classId: selectedClassId || undefined,
        status: selectedStatusFilter === 'WAITLIST' ? undefined : selectedStatusFilter || undefined,
        waitlist: selectedStatusFilter === 'WAITLIST',
        provisional: provisionalOnly ? true : undefined,
      };
      const response = await api.post('/admin/enrollments/export', body, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inscriptions-${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible d’exporter les inscriptions');
    } finally {
      setExporting(false);
    }
  };

  const toggleRegistrationBlock = async () => {
    try {
      const nextValue = !registrationsBlocked;
      await api.put('/admin/enrollments/registration-block', { blocked: nextValue });
      setRegistrationsBlocked(nextValue);
      toast.success(`Les inscriptions sont ${nextValue ? 'bloquées' : 'débloquées'}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de mettre à jour le blocage des inscriptions');
    }
  };

  const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
    : (import.meta.env.DEV ? 'http://localhost:4000' : '');

  const getPhotoSource = (photoUrl) => {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('http')) return photoUrl;
    const normalizedPhotoUrl = photoUrl.startsWith('/uploads') ? photoUrl : `/uploads/${photoUrl}`;
    return `${BACKEND_ORIGIN}${normalizedPhotoUrl}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getPoleOptions = () => {
    const poles = classes
      .map((cls) => cls.level?.pole)
      .filter((pole) => pole && pole.id)
      .reduce((acc, pole) => {
        if (!acc.some((item) => item.id === pole.id)) acc.push(pole);
        return acc;
      }, []);
    return poles;
  };

  const getClassOptions = () => classes
    .filter((cls) => cls.level && cls.level.name)
    .sort((a, b) => (a.level?.name || '').localeCompare(b.level?.name || ''));

  const visibleEnrollments = enrollments || [];
  const confirmedCount = visibleEnrollments.filter((e) => e.status === 'CONFIRMED').length;
  const pendingCount = visibleEnrollments.filter((e) => e.status === 'PENDING').length;
  const validationPendingCount = visibleEnrollments.filter((e) => e.status !== 'CANCELLED' && e.levelValidated !== true).length;

  const groupedEnrollments = useMemo(() => {
    const groups = visibleEnrollments.reduce((acc, enrollment) => {
      const family = enrollment.student?.family;
      const familyId = family?.id || `family-unknown-${enrollment.student?.id || 'anonymous'}`;
      const familyName = family?.familyName || `${enrollment.student?.lastName || ''} ${enrollment.student?.firstName || ''}`.trim() || 'Famille inconnue';
      if (!acc[familyId]) {
        acc[familyId] = { familyId, familyName, enrollments: [], latestCreatedAt: null };
      }
      acc[familyId].enrollments.push(enrollment);
      const createdAt = new Date(enrollment.createdAt).getTime();
      if (!acc[familyId].latestCreatedAt || createdAt > acc[familyId].latestCreatedAt) {
        acc[familyId].latestCreatedAt = createdAt;
      }
      return acc;
    }, {});

    return Object.values(groups).map((group) => {
      const sortedEnrollments = group.enrollments.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return {
        ...group,
        enrollments: sortedEnrollments,
      };
    }).sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
  }, [visibleEnrollments]);

  const toggleFamilyExpansion = (familyId) => {
    setExpandedFamilies((prev) => ({ ...prev, [familyId]: !prev[familyId] }));
  };

  const isFamilyExpanded = (familyId) => Boolean(expandedFamilies[familyId]);

  const handleStatusChange = (enrollmentId, value) => {
    setStatusUpdates((prev) => ({ ...prev, [enrollmentId]: value }));
  };

  // Save status immediately. If `forcedStatus` is provided, use it directly.
  const saveStatus = async (enrollment, forcedStatus) => {
    const newStatus = forcedStatus || statusUpdates[enrollment.id] || enrollment.status;
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

  const handleLevelValidatedChange = async (enrollmentId, checked) => {
    try {
      const { data } = await api.put(`/admin/enrollments/${enrollmentId}`, { levelValidated: checked });
      setEnrollments((prev) => prev.map((e) => (e.id === enrollmentId ? data.enrollment : e)));
      toast.success('Validation du niveau mise à jour');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la mise à jour du niveau validé');
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
        waitlistOrder: enrollment.waitlistOrder || '',
      classId: enrollment.classId,
      schoolYearId: enrollment.schoolYearId,
      comment: enrollment.comment || '',
      levelValidated: Boolean(enrollment.levelValidated),
      student: {
        firstName: enrollment.student?.firstName || '',
        lastName: enrollment.student?.lastName || '',
        dateOfBirth: enrollment.student?.dateOfBirth ? enrollment.student.dateOfBirth.slice(0, 10) : '',
        gender: enrollment.student?.gender || 'GARCON',
        allergies: enrollment.student?.allergies || '',
        currentTreatments: enrollment.student?.currentTreatments || '',
        photoUrl: enrollment.student?.photoUrl || '',
        photoBase64: '',
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

  const fetchEnrollmentPayments = async (enrollmentId) => {
    try {
      const { data } = await api.get(`/admin/enrollments/${enrollmentId}/payments`);
      const uniquePayments = [...new Map((data.payments || []).map((payment) => [payment.id, payment])).values()];
      setEnrollmentPayments(uniquePayments);
      setEditingPaymentId(null);
    } catch (error) {
      console.error('Impossible de charger les paiements', error);
    }
  };

  const openPaymentModal = (enrollment) => {
    setPaymentEnrollment(enrollment);
    setEditingPaymentId(null);
    setShowPaymentDetail(false);
    setPaymentForm({ 
      payerName: '', 
      date: new Date().toISOString().slice(0, 10), 
      method: 'CHEQUE', 
      status: 'validé', 
      comment: '', 
      amount: '',
      bankDebitIban: '',
      bankDebitSwift: '',
      numberOfInstallments: 1,
      firstPaymentDate: new Date().toISOString().slice(0, 10),
      scheduleDay: 10,
      ribDocument: null,
    });
    setRefundAccessCode('');
    setRefundCodeValidated(false);
    setRefundCodeValidating(false);
    setRefundForm({ date: new Date().toISOString().slice(0, 10), amount: '', method: 'CHEQUE', comment: '' });
    setRefunds([]);
    setEnrollmentPayments([]);
    setPaymentModalOpen(true);
    fetchEnrollmentPayments(enrollment.id);
  };

  const closePaymentModal = () => {
    setPaymentModalOpen(false);
    setPaymentEnrollment(null);
    setEnrollmentPayments([]);
    setEditingPaymentId(null);
    setShowPaymentDetail(false);
    setPaymentForm({ 
      payerName: '', 
      date: new Date().toISOString().slice(0, 10), 
      method: 'CHEQUE', 
      status: 'validé', 
      comment: '', 
      amount: '',
      bankDebitIban: '',
      bankDebitSwift: '',
      numberOfInstallments: 1,
      firstPaymentDate: new Date().toISOString().slice(0, 10),
      scheduleDay: 10,
      ribDocument: null,
    });
    setRefundAccessCode('');
    setRefundCodeValidated(false);
    setRefundCodeValidating(false);
    setRefundForm({ date: new Date().toISOString().slice(0, 10), amount: '', method: 'CHEQUE', comment: '' });
    setRefunds([]);
  };

  const submitEnrollmentPayment = async (event) => {
    event.preventDefault();
    const activeEnrollment = paymentEnrollment || editingEnrollment;
    if (!activeEnrollment) return;

    setPaymentLoading(true);
    try {
      const requestBody = {
        payerName: paymentForm.payerName,
        date: paymentForm.date,
        method: paymentForm.method,
        status: paymentForm.status,
        comment: paymentForm.comment,
        amount: Number(paymentForm.amount),
      };

      // Add prelevement fields if applicable
      if (['VIREMENT', 'PRELEVEMENT_BANCAIRE'].includes(paymentForm.method)) {
        requestBody.bankDebitIban = paymentForm.bankDebitIban;
        requestBody.bankDebitSwift = paymentForm.bankDebitSwift;
        requestBody.numberOfInstallments = Number(paymentForm.numberOfInstallments) || 1;
        requestBody.firstPaymentDate = paymentForm.firstPaymentDate;
        requestBody.scheduleDay = Number(paymentForm.scheduleDay) || 10;
        if (paymentForm.ribDocument) {
          requestBody.ribDocument = paymentForm.ribDocument;
        }
      }

      // If editing an existing transaction, detect provider to confirm Stripe actions
      if (editingPaymentId) {
        const original = enrollmentPayments.find((p) => p.id === editingPaymentId) || {};
        const provider = String(original.provider || '').toUpperCase();
        // When acting on a Stripe transaction, ask for confirmation before validating or cancelling
        if (provider === 'STRIPE' && (requestBody.status === 'validé' || requestBody.status === 'annulé')) {
          const actionLabel = requestBody.status === 'validé' ? 'valider (finaliser) le paiement dans Stripe' : 'annuler le paiement dans Stripe';
          const confirmMsg = `Vous êtes sur le point de ${actionLabel}. Confirmer ?`;
          if (!window.confirm(confirmMsg)) {
            setPaymentLoading(false);
            return;
          }
        }
        await api.patch(`/admin/enrollments/${activeEnrollment.id}/payments/${editingPaymentId}`, requestBody);
        toast.success('Paiement modifié');
      } else {
        await api.post(`/admin/enrollments/${activeEnrollment.id}/payments`, requestBody);
        toast.success('Paiement enregistré');
      }

      setPaymentForm({ 
        payerName: '', 
        date: new Date().toISOString().slice(0, 10), 
        method: 'CHEQUE', 
        status: 'validé', 
        comment: '', 
        amount: '',
        bankDebitIban: '',
        bankDebitSwift: '',
        numberOfInstallments: 1,
        firstPaymentDate: new Date().toISOString().slice(0, 10),
        scheduleDay: 10,
        ribDocument: null,
      });
      setEditingPaymentId(null);
      fetchEnrollmentPayments(activeEnrollment.id);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible d’enregistrer le paiement');
    } finally {
      setPaymentLoading(false);
    }
  };

  const editEnrollmentPayment = (payment) => {
    setEditingPaymentId(payment.id);
    setShowPaymentDetail(true);
    const metadata = payment.paymentMetadata || {};
    setPaymentForm({
      payerName: payment.payerName || '',
      date: payment.processedAt ? new Date(payment.processedAt).toISOString().slice(0, 10) : (payment.createdAt ? new Date(payment.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
      method: payment.method === 'PRELEVEMENT_BANCAIRE' ? 'VIREMENT' : (payment.method || 'CHEQUE'),
      status: payment.status === 'SUCCEEDED' ? 'validé' : payment.status === 'CANCELLED' ? 'annulé' : 'non validé',
      comment: payment.description || '',
      amount: payment.amount || '',
      bankDebitIban: metadata.bankDebitIban || '',
      bankDebitSwift: metadata.bankDebitSwift || '',
      numberOfInstallments: metadata.bankDebitInstallmentsCount || 1,
      firstPaymentDate: metadata.firstPaymentDate || new Date().toISOString().slice(0, 10),
      scheduleDay: metadata.bankDebitDay || 10,
      ribDocument: null,
    });
  };

  const cancelEditPayment = () => {
    setEditingPaymentId(null);
    setShowPaymentDetail(false);
    setPaymentForm({ 
      payerName: '', 
      date: new Date().toISOString().slice(0, 10), 
      method: 'CHEQUE', 
      status: 'validé', 
      comment: '', 
      amount: '',
      bankDebitIban: '',
      bankDebitSwift: '',
      numberOfInstallments: 1,
      firstPaymentDate: new Date().toISOString().slice(0, 10),
      scheduleDay: 10,
      ribDocument: null,
    });
  };

  const deleteEnrollmentPayment = async (paymentId) => {
    const activeEnrollment = paymentEnrollment || editingEnrollment;
    if (!activeEnrollment) return;
    if (!window.confirm('Confirmer la suppression de ce paiement ?')) return;

    try {
      await api.delete(`/admin/enrollments/${activeEnrollment.id}/payments/${paymentId}`);
      toast.success('Paiement supprimé');
      if (editingPaymentId === paymentId) {
        cancelEditPayment();
      }
      fetchEnrollmentPayments(activeEnrollment.id);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de supprimer le paiement');
    }
  };

  const changeEnrollmentPaymentStatus = async (payment, status) => {
    const activeEnrollment = paymentEnrollment || editingEnrollment;
    if (!activeEnrollment) return;
    const label = status === 'validé' ? 'valider' : 'annuler';
    if (!window.confirm(`Confirmer la mise à jour du paiement en ${label} ?`)) return;

    setPaymentLoading(true);
    try {
      await api.patch(`/admin/enrollments/${activeEnrollment.id}/payments/${payment.id}`, { status });
      toast.success(`Paiement ${status === 'validé' ? 'validé' : 'annulé'}`);
      if (editingPaymentId === payment.id) {
        cancelEditPayment();
      }
      fetchEnrollmentPayments(activeEnrollment.id);
    } catch (error) {
      toast.error(error.response?.data?.error || `Impossible de ${label} le paiement`);
    } finally {
      setPaymentLoading(false);
    }
  };

  const canEditPayment = (payment) => String(payment.status) !== 'SUCCEEDED';
  const canActionPayment = (payment) => {
    // Show action buttons when payment is not validated (SUCCEEDED) and not cancelled
    const s = String(payment.status || '').toUpperCase();
    return s !== 'SUCCEEDED' && s !== 'CANCELLED';
  };

  const downloadEnrollmentPaymentReceipt = async (payment) => {
    const activeEnrollment = paymentEnrollment || editingEnrollment;
    if (!activeEnrollment) return;

    try {
      const response = await api.get(
        `/admin/enrollments/${activeEnrollment.id}/payments/${payment.id}/receipt`,
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers['content-disposition'] || '';
      const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const filename = filenameMatch ? filenameMatch[1] : `recu-${payment.id}.pdf`;

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Reçu téléchargé');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de télécharger le reçu');
    }
  };

  const addRefundEntry = async () => {
    if (!refundForm.date || !refundForm.amount || !refundForm.method) {
      toast.error('Veuillez renseigner la date, le montant et le moyen du remboursement.');
      return;
    }
    if (!refundCodeValidated) {
      toast.error('Veuillez valider le code d’accès avant d’ajouter un remboursement.');
      return;
    }
    if (enrollmentPayments.length === 0) {
      toast.error('Veuillez enregistrer un paiement avant de créer un remboursement.');
      return;
    }

    const activeEnrollment = paymentEnrollment || editingEnrollment;
    if (!activeEnrollment) return;
    const paymentId = enrollmentPayments[0].id || enrollmentPayments[0].paymentId;
    if (!paymentId) {
      toast.error('Impossible de trouver le paiement associé.');
      return;
    }

    try {
      const { data } = await api.post('/payments/refunds', {
        paymentId,
        amount: Number(refundForm.amount),
        reason: `${refundForm.method} - ${refundForm.comment || 'N/A'}`,
      });
      const savedRefund = data.refund || { id: `refund-${Date.now()}` };
      setRefunds((prev) => [
        ...prev,
        {
          id: savedRefund.id,
          date: refundForm.date,
          amount: Number(refundForm.amount).toFixed(2),
          method: refundForm.method,
          comment: refundForm.comment,
        },
      ]);
      setRefundForm({ date: new Date().toISOString().slice(0, 10), amount: '', method: 'CHEQUE', comment: '' });
      toast.success('Remboursement enregistré');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible d’enregistrer le remboursement');
    }
  };

  const deleteRefundEntry = async (refundId) => {
    const refund = refunds.find((item) => item.id === refundId);
    if (!refund) return;
    if (refund.id.startsWith('refund-')) {
      setRefunds((prev) => prev.filter((item) => item.id !== refundId));
      return;
    }

    try {
      await api.delete(`/payments/refunds/${refundId}`);
      setRefunds((prev) => prev.filter((item) => item.id !== refundId));
      toast.success('Remboursement supprimé');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de supprimer le remboursement');
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
    } catch (error) {
      setRefundCodeValidated(false);
      toast.error(error.response?.data?.error || 'Code invalide ou expiré');
    } finally {
      setRefundCodeValidating(false);
    }
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

  const handlePhotoChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        updateEditForm('student', 'photoBase64', e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      updateEditForm('student', 'photoBase64', '');
    }
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
        levelValidated: editForm.levelValidated,
        // include waitlist order when provided
        ...(editForm.waitlistOrder !== undefined && editForm.waitlistOrder !== '' ? { waitlistOrder: Number(editForm.waitlistOrder) } : {}),
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

  const closeRecordModal = () => {
    setRecordModalOpen(false);
    setRecordStudent(null);
    setRecordData({ absences: [], notes: [] });
    setRecordTab('absences');
  };

  const openRecordModal = async (student) => {
    if (!student?.id) return;
    setRecordLoading(true);
    setRecordModalOpen(true);
    setRecordStudent(student);
    setRecordData({ absences: [], notes: [] });
    setRecordTab('absences');

    try {
      const { data } = await api.get(`/admin/students/${student.id}/record`);
      setRecordStudent(data.student || student);
      setRecordData({ absences: data.absences || [], notes: data.notes || [] });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de charger la fiche élève');
      closeRecordModal();
    } finally {
      setRecordLoading(false);
    }
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
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 12 }}>Gestion des inscriptions</h2>

      <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#6B7280', marginBottom: 6 }}>Inscriptions confirmées</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#0F766E' }}>{confirmedCount}</div>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#6B7280', marginBottom: 6 }}>Inscriptions en attente</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#C2410C' }}>{pendingCount}</div>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#6B7280', marginBottom: 6 }}>Inscriptions avec test de validation</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1D4ED8' }}>{validationPendingCount}</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#111827', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={registrationsBlocked}
              disabled={registrationBlockLoading}
              onChange={toggleRegistrationBlock}
            />
            Bloquer les inscriptions
          </label>
          <div style={{ color: registrationsBlocked ? '#B91C1C' : '#047857', fontWeight: 600 }}>
            {registrationBlockLoading ? 'Chargement...' : registrationsBlocked ? 'Les inscriptions sont bloquées' : 'Les inscriptions sont ouvertes'}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr 1fr', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, color: '#374151' }}>Recherche élève</label>
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="form-control"
              placeholder="Nom ou prénom"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, color: '#374151' }}>Pôle</label>
            <select
              className="form-control"
              value={selectedPole}
              onChange={(e) => setSelectedPole(e.target.value)}
            >
              <option value="">Tous les pôles</option>
              {getPoleOptions().map((pole) => (
                <option key={pole.id} value={pole.id}>{pole.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, color: '#374151' }}>Classe</label>
            <select
              className="form-control"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="">Toutes les classes</option>
              {getClassOptions().map((cls) => (
                <option key={cls.id} value={cls.id}>{`${cls.level?.pole?.name || ''} – ${cls.level?.name || ''} ${cls.dayOfWeek || ''}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, color: '#374151' }}>Statut</label>
            <select
              className="form-control"
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
            >
              <option value="">Tous</option>
              <option value="PENDING">En attente</option>
              <option value="WAITLIST">Liste d'attente</option>
              <option value="CONFIRMED">Confirmée</option>
              <option value="CANCELLED">Annulée</option>
              <option value="ARCHIVED">Archivée</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#374151' }}>
              <input type="checkbox" checked={provisionalOnly} onChange={(e) => setProvisionalOnly(e.target.checked)} />
              Montrer uniquement les affectations provisoires
            </label>
            <div style={{ color: '#6B7280' }}>
              Résultats: {enrollments.length} / {pagination.total}
            </div>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={exportEnrollments}
            disabled={exporting || loading}
            style={{ minWidth: 160, justifySelf: 'end' }}
          >
            {exporting ? 'Export en cours…' : 'Exporter en Excel'}
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? <p>Chargement...</p> : (
          <>
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px' }}>
                <thead>
                  <tr>
                    <th>Réf. inscription</th>
                    <th>Date inscription</th>
                    <th>Élève</th>
                    <th>Pôle</th>
                    <th>Niveau</th>
                    <th>Niveau validé</th>
                    <th>Liste d'attente</th>
                    <th>Statut</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.length === 0 ? (
                    <tr><td colSpan="9" style={{ textAlign: 'center', color: '#6B7280', padding: '24px 0' }}>Aucune inscription</td></tr>
                  ) : (
                    groupedEnrollments.map((group) => (
                      <Fragment key={group.familyId}>
                        <tr style={{ background: '#F3F4F6', borderRadius: 12, boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
                          <td colSpan="9" style={{ padding: '14px 16px', fontWeight: 700, cursor: 'pointer' }} onClick={() => toggleFamilyExpansion(group.familyId)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 14, color: '#1D4ED8' }}>{isFamilyExpanded(group.familyId) ? '▾' : '▸'}</span>
                                <span>{group.familyName}</span>
                                <span style={{ fontSize: 13, color: '#475569' }}>({group.enrollments.length} inscription{group.enrollments.length > 1 ? 's' : ''})</span>
                              </div>
                              <span style={{ fontSize: 13, color: '#6B7280' }}>Cliquer pour {isFamilyExpanded(group.familyId) ? 'replier' : 'déplier'}</span>
                            </div>
                          </td>
                        </tr>

                        {isFamilyExpanded(group.familyId) && group.enrollments.map((e) => {
                          const selectedStatus = statusUpdates[e.id] || e.status;
                          const waitlist = isEnrollmentWaitlist(e);
                          return (
                            <tr key={e.id} style={{ background: '#FFFFFF', borderRadius: 12, boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)' }}>
                              <td style={{ fontWeight: 700, padding: '16px 12px' }}>{e.registrationCode || '—'}</td>
                              <td style={{ padding: '16px 12px' }}>{formatDateTime(e.createdAt)}</td>
                              <td style={{ fontWeight: 700, padding: '16px 12px', paddingLeft: 36 }}>
                                {e.student.lastName} {e.student.firstName}
                                {e.isProvisional && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 8 }}>
                                    <span style={{ background: '#FEF3C7', color: '#92400E', padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>Affectation provisoire</span>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '16px 12px' }}>{e.isProvisional ? 'Classe fictive' : (e.class?.level?.pole?.name || '—')}</td>
                              <td style={{ padding: '16px 12px' }}>{e.isProvisional ? 'Classe fictive' : (e.class?.level?.name || '—')}</td>
                              <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(e.levelValidated)}
                                  onChange={(event) => handleLevelValidatedChange(e.id, event.target.checked)}
                                />
                              </td>
                              <td style={{ padding: '16px 12px' }}>
                                <span className={`badge ${waitlist ? 'badge-danger' : 'badge-success'}`}>
                                  {waitlist ? 'Oui' : 'Non'}
                                </span>
                              </td>
                              <td style={{ padding: '16px 12px' }}>{statusBadge(selectedStatus, waitlist)}</td>
                              <td className="table-actions" style={{ justifyContent: 'flex-end', padding: '16px 12px' }}>
                                {(() => {
                                  const currentStatus = statusUpdates[e.id] || e.status;
                                  if (currentStatus === 'CONFIRMED' || currentStatus === 'CANCELLED') return null;
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <button
                                        type="button"
                                        className="btn btn-success btn-sm"
                                        title="Valider l'inscription"
                                        onClick={() => saveStatus(e, 'CONFIRMED')}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', width: 36, height: 36 }}
                                      >
                                        <FiCheckCircle size={16} />
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        title="Annuler l'inscription"
                                        onClick={() => saveStatus(e, 'CANCELLED')}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', width: 36, height: 36 }}
                                      >
                                        <FiXCircle size={16} />
                                      </button>
                                    </div>
                                  );
                                })()}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    type="button"
                                    onClick={() => openRecordModal(e.student)}
                                    title="Fiche pédagogique"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}
                                  >
                                    <FiFileText size={14} />
                                    <span style={{ fontSize: 13 }}>Fiche</span>
                                  </button>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    type="button"
                                    onClick={() => openPaymentModal(e)}
                                    title="Paiement"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}
                                  >
                                    <FiCreditCard size={14} />
                                    <span style={{ fontSize: 13 }}>Paiement</span>
                                  </button>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    type="button"
                                    onClick={() => openEditModal(e)}
                                    title="Modifier l'inscription"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}
                                  >
                                    <FiEdit2 size={14} />
                                    <span style={{ fontSize: 13 }}>Modifier</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: '#6B7280' }}>
                  Page {pagination.page} / {pagination.totalPages}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
                  >
                    Précédent
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(prev.page + 1, prev.totalPages) }))}
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </>
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
                {(editForm.student?.photoBase64 || editForm.student?.photoUrl) && (
                  <img
                    src={editForm.student.photoBase64 || getPhotoSource(editForm.student.photoUrl)}
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
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Créneau</label>
                  <input
                    type="text"
                    className="form-control"
                    value={(() => {
                      const cls = classes.find((c) => c.id === editForm.classId);
                      if (!cls) return '—';
                      return cls.isProvisional ? 'À affecter' : `${cls.dayOfWeek || ''} ${cls.startTime || ''}-${cls.endTime || ''}`.trim();
                    })()}
                    disabled
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Ordre liste d'attente</label>
                  <input
                    type="number"
                    className="form-control"
                    value={editForm.waitlistOrder || ''}
                    onChange={(event) => updateEditForm(null, 'waitlistOrder', event.target.value)}
                  />
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
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.levelValidated)}
                      onChange={(event) => updateEditForm(null, 'levelValidated', event.target.checked)}
                    />
                    Niveau validé
                  </label>
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
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="form-control"
                    onChange={handlePhotoChange}
                  />
                  {editForm.student.photoBase64 && (
                    <small style={{ color: '#6B7280', marginTop: 4, display: 'block' }}>
                      Nouvelle photo sélectionnée
                    </small>
                  )}
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

      {paymentModalOpen && paymentEnrollment && (
        <div style={overlayStyle}>
          <div className="card" style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#1d4ed8' }}>Détail des paiements</h2>
                <div style={{ color: '#64748b', marginTop: 4 }}>
                  Gérer les paiements et remboursements pour l’inscription de {paymentEnrollment.student?.firstName} {paymentEnrollment.student?.lastName}.
                </div>
              </div>
              <div>
                <button type="button" className="btn btn-outline" onClick={closePaymentModal}>Fermer</button>
              </div>
            </div>

            <div className="form-section" style={{ padding: 20, background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 14, marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div>
                  <h4 style={{ margin: 0 }}>Paiements</h4>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setShowPaymentDetail(true);
                    setEditingPaymentId(null);
                    setPaymentForm({ 
                      payerName: '', 
                      date: new Date().toISOString().slice(0, 10), 
                      method: 'CHEQUE', 
                      status: 'validé', 
                      comment: '', 
                      amount: '',
                      bankDebitIban: '',
                      bankDebitSwift: '',
                      numberOfInstallments: 1,
                      firstPaymentDate: new Date().toISOString().slice(0, 10),
                      scheduleDay: 10,
                      ribDocument: null,
                    });
                  }}
                >
                  Ajouter un paiement
                </button>
              </div>

              {(showPaymentDetail || editingPaymentId) && (
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, background: '#FFFFFF', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
                    <h5 style={{ margin: 0 }}>{editingPaymentId ? 'Modifier le paiement' : 'Ajouter un paiement'}</h5>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setShowPaymentDetail(false);
                        setEditingPaymentId(null);
                        setPaymentForm({ 
                          payerName: '', 
                          date: new Date().toISOString().slice(0, 10), 
                          method: 'CHEQUE', 
                          status: 'validé', 
                          comment: '', 
                          amount: '',
                          bankDebitIban: '',
                          bankDebitSwift: '',
                          numberOfInstallments: 1,
                          firstPaymentDate: new Date().toISOString().slice(0, 10),
                          scheduleDay: 10,
                          ribDocument: null,
                        });
                      }}
                    >
                      Fermer
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Nom payeur</label>
                        <input
                          type="text"
                          className="form-control"
                          value={paymentForm.payerName}
                          onChange={(event) => setPaymentForm((prev) => ({ ...prev, payerName: event.target.value }))}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Date</label>
                        <input
                          type="date"
                          className="form-control"
                          value={paymentForm.date}
                          onChange={(event) => setPaymentForm((prev) => ({ ...prev, date: event.target.value }))}
                          disabled={Boolean(editingPaymentId)}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Moyen</label>
                        <select
                          className="form-control"
                          value={paymentForm.method}
                          onChange={(event) => setPaymentForm((prev) => ({ ...prev, method: event.target.value }))}
                        >
                          <option value="CHEQUE">Chèque</option>
                          <option value="ESPECES">Espèces</option>
                          <option value="CB">Carte Bancaire</option>
                          <option value="VIREMENT">Prélèvement</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Statut paiement</label>
                        <select
                          className="form-control"
                          value={paymentForm.status}
                          onChange={(event) => setPaymentForm((prev) => ({ ...prev, status: event.target.value }))}
                        >
                          <option value="validé">validé</option>
                          <option value="non validé">non validé</option>
                          <option value="annulé">annulé</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Montant</label>
                        <input
                          type="number"
                          className="form-control"
                          step="0.01"
                          value={paymentForm.amount}
                          onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Commentaire</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        value={paymentForm.comment}
                        onChange={(event) => setPaymentForm((prev) => ({ ...prev, comment: event.target.value }))}
                      />
                    </div>

                    {['VIREMENT', 'PRELEVEMENT_BANCAIRE'].includes(paymentForm.method) && (
                      <div style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: 12, background: '#F9FAFB', marginTop: 12 }}>
                        <h6 style={{ margin: '0 0 12px 0', color: '#111827', fontSize: 14, fontWeight: 600 }}>Informations de prélèvement</h6>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label>IBAN</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Ex: FR1420041010050500013M02606"
                              value={paymentForm.bankDebitIban}
                              onChange={(event) => setPaymentForm((prev) => ({ ...prev, bankDebitIban: normalizeBankValue(event.target.value) }))}
                              style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label>SWIFT / BIC</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Ex: BNPAFRPP"
                              value={paymentForm.bankDebitSwift}
                              onChange={(event) => setPaymentForm((prev) => ({ ...prev, bankDebitSwift: normalizeBankValue(event.target.value) }))}
                              style={{ fontFamily: 'monospace', letterSpacing: '0.05em', textTransform: 'uppercase' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label>Nombre d'échéances</label>
                            <input
                              type="number"
                              className="form-control"
                              min="1"
                              max="12"
                              value={paymentForm.numberOfInstallments}
                              onChange={(event) => setPaymentForm((prev) => ({ ...prev, numberOfInstallments: Number(event.target.value) || 1 }))}
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label>Date début prélèvement</label>
                            <input
                              type="date"
                              className="form-control"
                              value={paymentForm.firstPaymentDate}
                              onChange={(event) => setPaymentForm((prev) => ({ ...prev, firstPaymentDate: event.target.value }))}
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label>Jour de prélèvement</label>
                            <select
                              className="form-control"
                              value={paymentForm.scheduleDay}
                              onChange={(event) => setPaymentForm((prev) => ({ ...prev, scheduleDay: Number(event.target.value) }))}
                            >
                              <option value="10">10</option>
                              <option value="20">20</option>
                              <option value="30">30</option>
                            </select>
                          </div>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Fichier RIB (PDF/Image)</label>
                          <input
                            type="file"
                            className="form-control"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                  setPaymentForm((prev) => ({
                                    ...prev,
                                    ribDocument: {
                                      base64: e.target.result,
                                      name: file.name,
                                      type: file.type,
                                    },
                                  }));
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          {paymentForm.ribDocument && (
                            <small style={{ color: '#059669', marginTop: 4, display: 'block' }}>
                              ✓ Fichier sélectionné : {paymentForm.ribDocument.name}
                            </small>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={submitEnrollmentPayment}
                        disabled={paymentLoading}
                      >
                        {paymentLoading ? 'Enregistrement...' : editingPaymentId ? 'Mettre à jour le paiement' : 'Ajouter le paiement'}
                      </button>
                      {editingPaymentId && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={cancelEditPayment}
                          disabled={paymentLoading}
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Payeur</th>
                      <th>Moyen</th>
                      <th>Montant</th>
                      <th>Statut</th>
                      <th>Description</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollmentPayments.length > 0 ? (
                      enrollmentPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{formatDate(payment.processedAt || payment.createdAt)}</td>
                          <td>{payment.payerName || '—'}</td>
                          <td>{formatPaymentMethodLabel(payment)}</td>
                          <td>{Number(payment.amount).toFixed(2)} €</td>
                          <td>{paymentStatusLabel(payment.status)}</td>
                          <td>
                            <div>{decodeText(payment.description)}</div>
                            {(() => {
                              const metadata = payment.paymentMetadata || {};
                              const bankDebitIbanRaw = metadata.bankDebitIban || payment.bankDebitIban;
                              const bankDebitSwiftRaw = metadata.bankDebitSwift || payment.bankDebitSwift;
                              const bankDebitDay = metadata.bankDebitDay || payment.scheduleDay || payment.bankDebitDay;
                              const bankDebitInstallmentsCount = metadata.bankDebitInstallmentsCount || payment.numberOfInstallments || payment.installmentsCount;
                              const bankDebitFirstPaymentDate = metadata.firstPaymentDate || payment.firstPaymentDate;
                              const bankDebitRibUrl = metadata.bankDebitRibUrl;
                              const bankDebitRibFilename = metadata.bankDebitRibFilename || 'RIB';
                              const chequeDepositDay = metadata.chequeDepositDay || payment.scheduleDay;
                              const chequeFirstPaymentDate = metadata.chequeFirstPaymentDate || payment.firstPaymentDate;
                              const isBankDebit = payment.method === 'PRELEVEMENT_BANCAIRE'
                                || (payment.method === 'VIREMENT' && bankDebitIbanRaw)
                                || payment.method === 'STRIPE_SEPA'
                                || payment.method === 'GO_CARDLESS_SEPA';

                              if (!isBankDebit && payment.method !== 'CHEQUE') return null;

                              return (
                                <div style={{ marginTop: 8, fontSize: 12, color: '#475569', lineHeight: '1.5' }}>
                                  {payment.method === 'CHEQUE' ? (
                                    <>
                                      <div><strong>Date dépôt :</strong> {formatDate(payment.processedAt || payment.createdAt)}</div>
                                      {chequeDepositDay !== undefined && chequeDepositDay !== null && (
                                        <div><strong>Jour dépôt :</strong> {chequeDepositDay}</div>
                                      )}
                                      {chequeFirstPaymentDate && (
                                        <div><strong>Date premier chèque :</strong> {formatDate(chequeFirstPaymentDate)}</div>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <div><strong>IBAN :</strong> {formatBankIbanForDisplay(bankDebitIbanRaw) || '—'}</div>
                                      <div><strong>BIC / SWIFT :</strong> {formatBankSwiftForDisplay(bankDebitSwiftRaw) || '—'}</div>
                                      {bankDebitInstallmentsCount !== undefined && bankDebitInstallmentsCount !== null && (
                                        <div><strong>Échéances :</strong> {bankDebitInstallmentsCount}</div>
                                      )}
                                      {bankDebitFirstPaymentDate && (
                                        <div><strong>Date début prélèvement :</strong> {formatDate(bankDebitFirstPaymentDate)}</div>
                                      )}
                                      {bankDebitDay !== undefined && bankDebitDay !== null && (
                                        <div><strong>Jour prélèvement :</strong> {bankDebitDay}</div>
                                      )}
                                      {bankDebitRibUrl && (
                                        <button
                                          type="button"
                                          className="btn btn-link"
                                          onClick={() => handleDownloadRib(bankDebitRibUrl, bankDebitRibFilename)}
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, marginTop: 6, color: '#1d4ed8' }}
                                        >
                                          <FiDownload size={14} /> Télécharger le RIB
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {canActionPayment(payment) && (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-success btn-sm"
                                    onClick={() => changeEnrollmentPaymentStatus(payment, 'validé')}
                                    disabled={paymentLoading}
                                    title="Valider le paiement"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', width: 36, height: 36 }}
                                  >
                                    <FiCheckCircle size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() => changeEnrollmentPaymentStatus(payment, 'annulé')}
                                    disabled={paymentLoading}
                                    title="Annuler le paiement"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', width: 36, height: 36 }}
                                  >
                                    <FiXCircle size={16} />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="btn btn-link"
                                onClick={() => downloadEnrollmentPaymentReceipt(payment)}
                                title="Télécharger le reçu"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}
                              >
                                <FiDownload size={14} />
                                <span style={{ fontSize: 13 }}>Reçu</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: '#6B7280', padding: '18px 0' }}>
                          Aucun paiement enregistré pour cette inscription.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="form-section" style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, background: '#F9FAFB', marginTop: 16 }}>
              <h4>Accès remboursement</h4>
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Code d'accès</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="form-control"
                      value={refundAccessCode}
                      onChange={(event) => {
                        setRefundAccessCode(event.target.value);
                        if (refundCodeValidated) {
                          setRefundCodeValidated(false);
                        }
                      }}
                      placeholder="Saisir le code d'accès généré par l'espace trésorier"
                      disabled={refundCodeValidated}
                      style={{ flex: 1 }}
                    />
                    {!refundCodeValidated && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={validateRefundCode}
                        disabled={refundCodeValidating || !refundAccessCode.trim()}
                      >
                        {refundCodeValidating ? 'Validation...' : 'Valider'}
                      </button>
                    )}
                    {refundCodeValidated && (
                      <div style={{ display: 'flex', alignItems: 'center', color: 'var(--amc-success)', fontWeight: 'bold' }}>
                        ✓ Validé
                      </div>
                    )}
                  </div>
                  <small style={{ color: '#6B7280', marginTop: 4, display: 'block' }}>
                    {refundCodeValidated
                      ? 'Code valide. Vous pouvez maintenant enregistrer des remboursements.'
                      : 'Ce bloc sera affiché uniquement après validation du code.'}
                  </small>
                </div>
              </div>
            </div>

            {refundCodeValidated && (
              <div className="form-section" style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, background: '#FFFFFF', marginTop: 16 }}>
                <h4>Remboursement</h4>
                <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Date remboursement</label>
                      <input
                        type="date"
                        className="form-control"
                        value={refundForm.date}
                        onChange={(event) => setRefundForm((prev) => ({ ...prev, date: event.target.value }))}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Montant</label>
                      <input
                        type="number"
                        className="form-control"
                        step="0.01"
                        value={refundForm.amount}
                        onChange={(event) => setRefundForm((prev) => ({ ...prev, amount: event.target.value }))}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Moyen</label>
                      <select
                        className="form-control"
                        value={refundForm.method}
                        onChange={(event) => setRefundForm((prev) => ({ ...prev, method: event.target.value }))}
                      >
                        <option value="CHEQUE">Chèque</option>
                        <option value="ESPECES">Espèces</option>
                        <option value="CB">Carte Bancaire</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Commentaire</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={refundForm.comment}
                      onChange={(event) => setRefundForm((prev) => ({ ...prev, comment: event.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <button type="button" className="btn btn-primary" onClick={addRefundEntry}>
                      Ajouter un remboursement
                    </button>
                  </div>
                </div>

                {refunds.length > 0 ? (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Date remboursement</th>
                          <th>Montant</th>
                          <th>Moyen</th>
                          <th>Commentaire</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refunds.map((refund) => (
                          <tr key={refund.id}>
                            <td>{refund.date}</td>
                            <td>{refund.amount} €</td>
                            <td>{refund.method}</td>
                            <td>{refund.comment || '—'}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-link text-danger"
                                onClick={() => deleteRefundEntry(refund.id)}
                              >
                                Supprimer
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>Aucun remboursement enregistré pour le moment.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {recordModalOpen && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16 }}>
              <div>
                <h3>Fiche élève</h3>
                <p style={{ margin: '6px 0 0', color: '#6B7280' }}>{recordStudent?.firstName} {recordStudent?.lastName}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {recordStudent?.photoUrl && (
                  <img
                    src={getPhotoSource(recordStudent.photoUrl)}
                    alt={`${recordStudent.firstName} ${recordStudent.lastName}`}
                    style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12, border: '1px solid #E2E8F0' }}
                  />
                )}
                <button type="button" className="btn btn-outline btn-sm" onClick={closeRecordModal}>Fermer</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className={`btn btn-sm ${recordTab === 'absences' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setRecordTab('absences')}
              >
                Absences
              </button>
              <button
                type="button"
                className={`btn btn-sm ${recordTab === 'notes' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setRecordTab('notes')}
              >
                Notes
              </button>
              {recordTab === 'absences' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', backgroundColor: '#FEF3C7', borderRadius: 8, border: '1px solid #FCD34D', marginLeft: 'auto' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--amc-primary)' }}>
                      {recordData.absences.length}
                    </div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                      absences année en cours
                    </div>
                  </div>
                </div>
              )}
            </div>

            {recordLoading ? (
              <p style={{ marginTop: 20 }}>Chargement de la fiche...</p>
            ) : (
              <div style={{ marginTop: 20 }}>
                {recordTab === 'absences' ? (
                  <div>
                    <h4>Absences</h4>
                    {recordData.absences.length === 0 ? (
                      <p>Aucune absence enregistrée.</p>
                    ) : (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Motif</th>
                            <th>Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recordData.absences.map((absence) => (
                            <tr key={absence.id}>
                              <td>{formatDate(absence.date)}</td>
                              <td>{absence.reason || '—'}</td>
                              <td>{absence.status || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  <div>
                    <h4>Notes</h4>
                    {recordData.notes.length === 0 ? (
                      <p>Aucune note enregistrée.</p>
                    ) : (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Classe</th>
                            <th>Note / appréciation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recordData.notes.map((note) => (
                            <tr key={note.id}>
                              <td>{formatDate(note.date)}</td>
                              <td>{note.classLabel || '—'}</td>
                              <td>{note.grade != null ? note.grade : note.appreciation || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function paymentStatusLabel(status) {
  if (!status) return '—';
  switch (String(status)) {
    case 'PENDING': return 'En attente';
    case 'PARTIAL': return 'Partiel';
    case 'COMPLETED': return 'Complété';
    case 'OVERDUE': return 'En retard';
    case 'FAILED': return 'Échoué';
    case 'REFUNDED': return 'Remboursé';
    case 'CANCELLED': return 'Annulé';
    case 'SUCCEEDED': return 'Payé';
    case 'INITIATED': return 'Non validé';
    default: return status;
  }
}
