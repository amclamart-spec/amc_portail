import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import SepaSetupForm from '../../components/SepaSetupForm';
import { useAuth } from '../../context/AuthContext';

const STORAGE_KEY_BASE = 'amc_family_wizard_draft_v1';
const REGISTRATION_PENDING_VALIDATION_MESSAGE = 'Votre inscription a bien été prise en compte, une validation par le service secrétériat interviendra sous peu.';

const engagementBulletPoints = [
  'Les élèves de moins de 11 ans doivent être accompagnés et récupérés par le responsable légal.',
  'Les familles s’engagent à respecter ponctualité, assiduité et suivi pédagogique à domicile.',
  'Tout changement de personne autorisée à récupérer l’enfant doit être signalé par écrit.',
  'PARTAGE est déchargée de responsabilité dès récupération de l’enfant devant sa salle.',
  'Le stationnement dangereux ou gênant aux abords du centre est strictement interdit.',
];

const emptyMember = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: 'GARCON',
  photoBase64: '',
  isOldStudent: false,
};

const emptyHealthForm = {
  hasChronicDisease: false,
  chronicDiseaseDetails: '',
  hasMedicalTreatment: false,
  medicalTreatmentDetails: '',
  hasAllergy: false,
  allergyDetails: '',
  hasDisability: false,
  disabilityDetails: '',
  otherUsefulHealthInfo: '',
  canLeaveAloneAfterClass: null,
  emergencyContacts: [{ firstName: '', lastName: '', relationship: '', phone: '' }],
  pickupAuthorizedPersons: [{ fullName: '', relationship: '', phone: '' }],
  emergencyAuthorizationAccepted: false,
  legalRepresentativeFullName: '',
  citySigned: '',
  signedAt: '',
  legalRepresentativeSignature: '',
  confidentialityAccepted: true,
  noMedicationPolicyAccepted: true,
};

const WEEK_DAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];

const getDefaultHealthForm = (wizardState) => ({
  ...emptyHealthForm,
  legalRepresentativeFullName: `${wizardState.account.firstName || ''} ${wizardState.account.lastName || ''}`.trim(),
  legalRepresentativeSignature: `${wizardState.account.firstName || ''} ${wizardState.account.lastName || ''}`.trim(),
  citySigned: wizardState.address.city || '',
  signedAt: new Date().toISOString().slice(0, 10),
});

function getDefaultState(prefill = {}) {
  return {
    draftId: null,
    account: {
      firstName: prefill.firstName || '',
      lastName: prefill.lastName || '',
      email: prefill.email || '',
      phone: prefill.phone || '',
      password: prefill.password || '',
      confirmPassword: '',
      profile: 'FAMILLE',
    },
    address: {
      familyName: prefill.lastName || '',
      addressLine1: '',
      addressLine2: '',
      postalCode: '',
      city: '',
      country: 'France',
      phonePrimary: prefill.phone || '',
      phoneSecondary: '',
    },
    members: [],
    courseSelections: [],
    healthForms: {},
    engagement: {
      readAndApproved: false,
      legalMentionAccepted: false,
      signedByFullName: `${prefill.firstName || ''} ${prefill.lastName || ''}`.trim(),
      signedByRole: 'responsable_legal',
      citySigned: '',
      signedAt: new Date().toISOString().slice(0, 10),
    },
    payment: {
      method: 'CARTE_BANCAIRE',
      installmentsCount: 1,
      scheduleDay: 10,
      chequeInstructionsAccepted: false,
    },
  };
}

function getAgeFromDate(dateString) {
  if (!dateString) return null;
  const dob = new Date(dateString);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function isClassAllowedForAge(cls, age) {
  if (age === null) return true;
  const minAge = cls.level?.minAge;
  const maxAge = cls.level?.maxAge;
  if (minAge !== undefined && minAge !== null && age < minAge) return false;
  if (maxAge !== undefined && maxAge !== null && age > maxAge) return false;
  return true;
}

function isLevelAllowedForAge(level, age) {
  if (age === null) return true;
  const minAge = level?.minAge;
  const maxAge = level?.maxAge;
  if (minAge !== undefined && minAge !== null && age < minAge) return false;
  if (maxAge !== undefined && maxAge !== null && age > maxAge) return false;
  return true;
}

export default function FamilyRegistrationWizard({ existingFamily = false }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = location.state?.prefill || {};
  const storageKey = existingFamily ? `${STORAGE_KEY_BASE}_existing_family` : STORAGE_KEY_BASE;

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [allClasses, setAllClasses] = useState([]);
  const [poles, setPoles] = useState([]);
  const [pricingPreview, setPricingPreview] = useState(null);
  const [courseFilterPoleId, setCourseFilterPoleId] = useState('');
  const [courseFilterDay, setCourseFilterDay] = useState('');
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [editingMemberIndex, setEditingMemberIndex] = useState(null);
  const [activeHealthMember, setActiveHealthMember] = useState(0);
  const [emailError, setEmailError] = useState('');
  const [sepaCheckout, setSepaCheckout] = useState(null);
  const stripePromise = useMemo(() => {
    const key = import.meta.env.VITE_STRIPE_PUBLIC_KEY || '';
    return key ? loadStripe(key) : null;
  }, []);

  const [wizard, setWizard] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...getDefaultState(prefill), ...parsed };
      } catch {
        return getDefaultState(prefill);
      }
    }
    return getDefaultState(prefill);
  });

  const passwordRef = useRef(wizard.account.password);

  const jumpToStep = async (target) => {
    setStep(target);
    await persistDraft(target);
  };

  const handleMemberPhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setMemberForm((prev) => ({ ...prev, photoBase64: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const steps = existingFamily
    ? ['Membres famille', 'Cours & tarifs', 'Fiche sanitaire', 'Engagement', 'Paiement']
    : ['Adresse & Téléphones', 'Membres famille', 'Cours & tarifs', 'Fiche sanitaire', 'Engagement', 'Paiement'];

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(wizard));
  }, [wizard, storageKey]);

  useEffect(() => {
    if (existingFamily && user?.email && user.email !== wizard.account.email) {
      setWizard((prev) => ({
        ...prev,
        account: {
          ...prev.account,
          email: user.email,
          firstName: prev.account.firstName || user.firstName || '',
          lastName: prev.account.lastName || user.lastName || '',
        },
      }));
    }
  }, [existingFamily, user, wizard.account.email]);

  useEffect(() => {
    if (!prefill?.email) return;

    setWizard((prev) => {
      const account = {
        ...prev.account,
        firstName: prev.account.firstName || prefill.firstName || '',
        lastName: prev.account.lastName || prefill.lastName || '',
        email: prev.account.email || prefill.email || '',
        phone: prev.account.phone || prefill.phone || '',
        password: prev.account.password || prefill.password || '',
      };

      const address = {
        ...prev.address,
        familyName: prev.address.familyName || prefill.lastName || '',
        phonePrimary: prev.address.phonePrimary || prefill.phone || '',
      };

      const engagement = {
        ...prev.engagement,
        signedByFullName: prev.engagement.signedByFullName || `${prefill.firstName || ''} ${prefill.lastName || ''}`.trim(),
        citySigned: prev.engagement.citySigned || '',
        signedAt: prev.engagement.signedAt || new Date().toISOString().slice(0, 10),
      };

      if (account === prev.account && address === prev.address && engagement === prev.engagement) {
        return prev;
      }

      return {
        ...prev,
        account,
        address,
        engagement,
      };
    });
  }, [prefill]);

  useEffect(() => {
    if (!wizard.members.length) return;

    setWizard((prev) => {
      const healthForms = { ...prev.healthForms };
      let updated = false;
      prev.members.forEach((member, idx) => {
        const existing = healthForms[idx];
        if (!existing || !existing.legalRepresentativeFullName || !existing.signedAt || !existing.legalRepresentativeSignature || !existing.citySigned) {
          const defaults = getDefaultHealthForm(prev);
          healthForms[idx] = {
            ...emptyHealthForm,
            ...existing,
            legalRepresentativeFullName: existing?.legalRepresentativeFullName || defaults.legalRepresentativeFullName,
            legalRepresentativeSignature: existing?.legalRepresentativeSignature || defaults.legalRepresentativeSignature,
            citySigned: existing?.citySigned || defaults.citySigned,
            signedAt: existing?.signedAt || defaults.signedAt,
          };
          updated = true;
        }
      });
      if (!updated) return prev;
      return { ...prev, healthForms };
    });
  }, [wizard.members, wizard.account.firstName, wizard.account.lastName, wizard.address.city]);

  useEffect(() => {
    if (!wizard.account.password) {
      passwordRef.current = '';
      return;
    }

    if (!wizard.account.confirmPassword || wizard.account.confirmPassword === passwordRef.current) {
      setWizard((prev) => ({
        ...prev,
        account: {
          ...prev.account,
          confirmPassword: prev.account.password,
        },
      }));
    }

    passwordRef.current = wizard.account.password;
  }, [wizard.account.password]);

  useEffect(() => {
    api.get('/enrollments/poles').then(({ data }) => setPoles(data.poles || [])).catch(() => {});
    setLoadingClasses(true);
    api.get('/enrollments/classes')
      .then(({ data }) => setAllClasses(data.classes || []))
      .catch(() => toast.error('Impossible de charger les créneaux'))
      .finally(() => setLoadingClasses(false));
  }, []);

  useEffect(() => {
    const hasNewChild = wizard.members.some((member) => !member.isOldStudent);
    // If there is any new child, disallow online methods (Stripe / SEPA) and fallback to an offline method
    if (hasNewChild && (wizard.payment.method === 'STRIPE_CARD' || wizard.payment.method === 'STRIPE_SEPA' || wizard.payment.method === 'GO_CARDLESS_SEPA')) {
      updateWizard('payment', { method: 'ESPECES' });
    }
  }, [wizard.members]);

  useEffect(() => {
    if (['STRIPE_CARD', 'STRIPE_SEPA', 'GO_CARDLESS_SEPA'].includes(wizard.payment.method)) {
      updateWizard('payment', { method: 'ESPECES' });
    }
  }, [wizard.payment.method]);

  useEffect(() => {
    if (wizard.payment.method === 'GO_CARDLESS_SEPA') {
      updateWizard('payment', { method: 'STRIPE_SEPA', installmentsCount: 1 });
    }
  }, [wizard.payment.method]);

  const levelsById = useMemo(() => {
    return new Map(
      poles.flatMap((pole) => (pole.levels || []).map((level) => [level.id, { ...level, poleId: pole.id, poleName: pole.name }]))
    );
  }, [poles]);

  const sciencePole = useMemo(() => poles.find((p) => String(p.name || '').toLowerCase().includes('sciences')), [poles]);
  const coranPole = useMemo(() => poles.find((p) => String(p.name || '').toLowerCase().includes('coran')), [poles]);

  const selectedEnrollmentsLabel = useMemo(() => {
    return wizard.courseSelections.map((selection) => {
      const member = wizard.members[selection.memberIndex];
      if (!member) return null;

      if (selection.classId) {
        const cls = allClasses.find((c) => c.id === selection.classId);
        if (!cls) return null;
        return `${member.firstName} ${member.lastName} — ${cls.level?.pole?.name || ''} / ${cls.level?.name || ''} (${cls.dayOfWeek} ${cls.startTime}-${cls.endTime})`;
      }

      if (selection.levelId) {
        const level = levelsById.get(selection.levelId);
        if (!level) return null;
        return `${member.firstName} ${member.lastName} — ${level.poleName || ''} / ${level.name}`;
      }

      if (selection.poleId) {
        const pole = poles.find((p) => p.id === selection.poleId);
        if (!pole) return null;
        return `${member.firstName} ${member.lastName} — ${pole.name}`;
      }

      return null;
    }).filter(Boolean);
  }, [wizard.courseSelections, wizard.members, allClasses, poles, levelsById]);

  const classesGroupedByPole = useMemo(() => {
    const poleOrder = new Map(poles.map((pole, index) => [pole.id, index]));
    const groups = new Map();

    allClasses.forEach((cls) => {
      const pole = cls.level?.pole || cls.pole;
      const poleId = pole?.id || 'unknown';
      const poleName = pole?.name || 'Autres';
      const key = `${poleId}:${poleName}`;
      if (!groups.has(key)) {
        groups.set(key, { poleId, poleName, classes: [], sortOrder: poleOrder.has(poleId) ? poleOrder.get(poleId) : 999 });
      }
      groups.get(key).classes.push(cls);
    });

    return Array.from(groups.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.poleName.localeCompare(b.poleName))
      .map((group) => ({
        ...group,
        classes: group.classes.sort((a, b) => {
          const levelOrder = (a.level?.sortOrder || 0) - (b.level?.sortOrder || 0);
          if (levelOrder !== 0) return levelOrder;
          if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek.localeCompare(b.dayOfWeek);
          return a.startTime.localeCompare(b.startTime);
        }),
      }));
  }, [allClasses, poles]);

  useEffect(() => {
    if (((existingFamily && step === 1) || (!existingFamily && step === 2))) {
      refreshPricing();
    }
  }, [wizard.courseSelections, step, existingFamily]);

  const persistDraft = async (nextStep = step) => {
    const email = wizard.account.email || user?.email;
    if (!email) return;
    try {
      const { data } = await api.post('/family-wizard/draft', {
        email,
        draftId: wizard.draftId,
        currentStep: nextStep,
        payload: wizard,
      });

      if (data?.draft?.id && data.draft.id !== wizard.draftId) {
        setWizard((prev) => ({ ...prev, draftId: data.draft.id }));
      }
    } catch {
      // fallback local uniquement
    }
  };

  const isEmailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validateEmailAvailability = async (email) => {
    if (!isEmailValid(email)) {
      setEmailError('Veuillez saisir un email valide');
      return false;
    }

    try {
      await api.post('/family-wizard/check-email', { email });
      setEmailError('');
      return true;
    } catch (error) {
      if (error.response?.status === 409) {
        setEmailError('Un compte existe déjà avec cet email');
        toast.error('Un compte existe déjà avec cet email');
        return false;
      }
      toast.error('Impossible de vérifier l’email pour le moment');
      return false;
    }
  };

  const updateWizard = (path, value) => {
    setWizard((prev) => ({
      ...prev,
      [path]: {
        ...prev[path],
        ...value,
      },
    }));
  };

  const validateStep = async () => {
    if (!existingFamily && step === 0) {
      const a = wizard.address;
      const account = wizard.account;
      if (!account.firstName || !account.lastName || !account.email || !account.phone || !account.password) {
        toast.error('Veuillez compléter les informations de compte (nom, email, téléphone, mot de passe)');
        return false;
      }
      if (!isEmailValid(account.email)) {
        toast.error('Veuillez saisir un email valide');
        return false;
      }
      const emailAvailable = await validateEmailAvailability(account.email);
      if (!emailAvailable) {
        return false;
      }
      if (!account.phone.trim()) {
        toast.error('Le téléphone est obligatoire');
        return false;
      }
      if (account.password.length < 8 || !/[A-Z]/.test(account.password) || !/[0-9]/.test(account.password)) {
        toast.error('Le mot de passe doit contenir 8 caractères, une majuscule et un chiffre');
        return false;
      }
      if (account.password !== account.confirmPassword) {
        toast.error('Les mots de passe ne correspondent pas');
        return false;
      }
      if (!a.addressLine1 || !a.postalCode || !a.city || !a.country) {
        toast.error('Veuillez compléter l’adresse et le pays');
        return false;
      }
    }

    if ((existingFamily && step === 0) || (!existingFamily && step === 1)) {
      if (wizard.members.length === 0) {
        toast.error('Ajoutez au moins un membre de la famille');
        return false;
      }
    }

    if ((existingFamily && step === 1) || (!existingFamily && step === 2)) {
      const oldMemberIndices = wizard.members
        .map((member, idx) => member.isOldStudent ? idx : -1)
        .filter((idx) => idx !== -1);
      if (oldMemberIndices.length > 0) {
        const selectedOldMembers = new Set(wizard.courseSelections.map((s) => s.memberIndex));
        const missingSelection = oldMemberIndices.some((idx) => !selectedOldMembers.has(idx));
        if (missingSelection) {
          toast.error('Veuillez sélectionner un cours pour chaque ancien élève');
          return false;
        }
      }
    }

    if ((existingFamily && step === 2) || (!existingFamily && step === 3)) {
      const form = wizard.healthForms[activeHealthMember] || emptyHealthForm;
      if (form.hasChronicDisease && !form.chronicDiseaseDetails.trim()) return toast.error('Détail des maladies chroniques requis'), false;
      if (form.hasMedicalTreatment && !form.medicalTreatmentDetails.trim()) return toast.error('Détail du traitement requis'), false;
      if (form.hasAllergy && !form.allergyDetails.trim()) return toast.error('Détail des allergies requis'), false;
      if (form.hasDisability && !form.disabilityDetails.trim()) return toast.error('Détail du handicap requis'), false;
      if (form.canLeaveAloneAfterClass === null || form.canLeaveAloneAfterClass === undefined) return toast.error('Choix de sortie obligatoire'), false;
      if (form.canLeaveAloneAfterClass === false && !(form.pickupAuthorizedPersons || []).some((p) => p.fullName && p.phone)) {
        return toast.error('Ajoutez au moins une personne autorisée à récupérer l’enfant'), false;
      }
      if (!form.emergencyAuthorizationAccepted || !form.legalRepresentativeFullName || !form.citySigned || !form.signedAt) {
        return toast.error('Autorisation d’urgence et signature sanitaire obligatoires'), false;
      }
    }

    if ((existingFamily && step === 3) || (!existingFamily && step === 4)) {
      const e = wizard.engagement;
      if (!e.readAndApproved || !e.legalMentionAccepted || !e.signedByFullName || !e.citySigned || !e.signedAt) {
        toast.error('Veuillez compléter l’engagement (lu/approuvé, nom, lieu, date)');
        return false;
      }
    }

    if ((existingFamily && step === 4) || (!existingFamily && step === 5)) {
      const p = wizard.payment;
      if ((p.method === 'STRIPE_CARD' || p.method === 'STRIPE_SEPA') && p.installmentsCount > 1 && ![10, 20, 30].includes(Number(p.scheduleDay))) {
        toast.error('Jour de prélèvement invalide (10/20/30)');
        return false;
      }
      if (p.method === 'CHEQUE' && !p.chequeInstructionsAccepted) {
        toast.error('Veuillez confirmer avoir lu les instructions de paiement par chèque');
        return false;
      }
    }

    return true;
  };

  const next = async () => {
    if (!(await validateStep())) return;
    const target = Math.min(step + 1, steps.length - 1);
    setStep(target);
    await persistDraft(target);

    if ((existingFamily && step === 1) || (!existingFamily && step === 2)) {
      await refreshPricing();
    }
  };

  const prev = async () => {
    const target = Math.max(step - 1, 0);
    setStep(target);
    await persistDraft(target);
  };

  const refreshPricing = async () => {
    try {
      const { data } = await api.post('/family-wizard/pricing-preview', {
        courseSelections: wizard.courseSelections,
        existingFamily,
      });
      setPricingPreview(data.pricing);
    } catch {
      toast.error('Impossible de calculer le tarif pour le moment');
    }
  };

  const handleSepaMandateSuccess = () => {
    localStorage.removeItem(storageKey);
    navigate(`/login?registration_message=${encodeURIComponent(REGISTRATION_PENDING_VALIDATION_MESSAGE)}`);
  };

  const submitFinal = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      const payload = existingFamily
        ? { ...wizard }
        : {
          ...wizard,
          account: {
            ...wizard.account,
            profile: 'FAMILLE',
          },
        };

      if (payload.payment?.method === 'CARTE_BANCAIRE') {
        payload.payment.method = 'ESPECES';
      }

      const endpoint = existingFamily ? '/family-wizard/complete-existing' : '/family-wizard/complete';
      const { data } = await api.post(endpoint, payload);

      if (data?.payment?.checkout?.clientSecret) {
        setSepaCheckout(data.payment.checkout);
        toast.success('Veuillez signer le mandat SEPA pour finaliser votre inscription.');
        return;
      }

      if (data?.payment?.checkout?.checkoutUrl) {
        localStorage.removeItem(storageKey);
        toast.success('Redirection vers le paiement...');
        window.location.href = data.payment.checkout.checkoutUrl;
        return;
      }

      localStorage.removeItem(storageKey);
      navigate(`/login?registration_message=${encodeURIComponent(REGISTRATION_PENDING_VALIDATION_MESSAGE)}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur de finalisation');
    } finally {
      setSubmitting(false);
    }
  };

  const addOrUpdateMember = () => {
    if (!memberForm.firstName || !memberForm.lastName || !memberForm.dateOfBirth) {
      toast.error('Nom, prénom et date de naissance requis');
      return;
    }

    setWizard((prev) => {
      const members = [...prev.members];
      if (editingMemberIndex !== null) {
        members[editingMemberIndex] = memberForm;
      } else {
        members.push(memberForm);
      }

      const healthForms = { ...prev.healthForms };
      members.forEach((_, idx) => {
        if (!healthForms[idx]) {
          healthForms[idx] = getDefaultHealthForm(prev);
        }
      });

      return {
        ...prev,
        members,
        healthForms,
      };
    });

    setMemberForm(emptyMember);
    setEditingMemberIndex(null);
  };

  const removeMember = (index) => {
    setWizard((prev) => {
      const members = prev.members.filter((_, idx) => idx !== index);
      const courseSelections = prev.courseSelections.filter((s) => s.memberIndex !== index).map((s) => ({
        ...s,
        memberIndex: s.memberIndex > index ? s.memberIndex - 1 : s.memberIndex,
      }));

      const healthForms = {};
      members.forEach((_, idx) => {
        const sourceIndex = idx >= index ? idx + 1 : idx;
        healthForms[idx] = prev.healthForms[sourceIndex] || { ...emptyHealthForm };
      });

      return { ...prev, members, courseSelections, healthForms };
    });

    setActiveHealthMember(0);
  };

  const toggleCourseSelection = (memberIndex, classId) => {
    setWizard((prev) => {
      const exists = prev.courseSelections.find((s) => s.memberIndex === memberIndex && s.classId === classId);
      const nextSelections = exists
        ? prev.courseSelections.filter((s) => !(s.memberIndex === memberIndex && s.classId === classId))
        : [...prev.courseSelections, { memberIndex, classId }];
      return { ...prev, courseSelections: nextSelections };
    });
  };

  const toggleLevelSelection = (memberIndex, poleId, levelId) => {
    setWizard((prev) => {
      const exists = prev.courseSelections.find((s) => s.memberIndex === memberIndex && s.levelId === levelId);
      const nextSelections = exists
        ? prev.courseSelections.filter((s) => !(s.memberIndex === memberIndex && s.levelId === levelId))
        : [...prev.courseSelections, { memberIndex, poleId, levelId }];
      return { ...prev, courseSelections: nextSelections };
    });
  };

  const activeHealthForm = wizard.healthForms[activeHealthMember] || emptyHealthForm;

  const updateActiveHealthForm = (partial) => {
    setWizard((prev) => ({
      ...prev,
      healthForms: {
        ...prev.healthForms,
        [activeHealthMember]: {
          ...activeHealthForm,
          ...partial,
        },
      },
    }));
  };

  const updateCollectionRow = (field, index, partial) => {
    const source = [...(activeHealthForm[field] || [])];
    source[index] = { ...source[index], ...partial };
    updateActiveHealthForm({ [field]: source });
  };

  const addCollectionRow = (field, template) => {
    updateActiveHealthForm({
      [field]: [...(activeHealthForm[field] || []), template],
    });
  };

  const removeCollectionRow = (field, index) => {
    updateActiveHealthForm({
      [field]: (activeHealthForm[field] || []).filter((_, i) => i !== index),
    });
  };

  if (sepaCheckout) {
    const paymentStep = existingFamily ? 4 : 5;
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: 20 }}>
        <div className="card" style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
          <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Signature du mandat SEPA</h2>
          <p style={{ color: '#475569', marginBottom: 18 }}>
            Votre inscription est enregistrée. Veuillez signer le mandat SEPA pour autoriser le premier prélèvement.
          </p>
          <p style={{ marginBottom: 18 }}>
            <button
              type="button"
              className="btn btn-link"
              onClick={() => {
                setSepaCheckout(null);
                jumpToStep(paymentStep);
              }}
              style={{ padding: 0, color: '#1D4ED8' }}
            >
              ← Retourner à l’étape Paiement
            </button>
          </p>
          <Elements stripe={stripePromise}>
            <SepaSetupForm
              clientSecret={sepaCheckout.clientSecret}
              montantTotal={sepaCheckout.montantTotal}
              nombreEcheances={sepaCheckout.nombreEcheances}
              customerId={sepaCheckout.customerId}
              nomTitulaire={sepaCheckout.payerName}
              emailTitulaire={sepaCheckout.email}
              paymentId={sepaCheckout.paymentId}
              mandateToken={sepaCheckout.mandateToken}
              inscriptionId={sepaCheckout.inscriptionId}
              dueDateFirstPayment={sepaCheckout.dueDateFirstPayment}
              onSuccess={handleSepaMandateSuccess}
            />
          </Elements>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: 20 }}>
      <div className="card" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <img src="/amc_logo.png" alt="AMC Logo" style={{ height: 50, objectFit: 'contain' }} />
          <img src="/amc_logo_partner.png" alt="PARTAGE Logo" style={{ height: 50, objectFit: 'contain' }} />
        </div>
        <h2 style={{ color: 'var(--amc-primary)', marginBottom: 8 }}>
          {existingFamily ? 'Ajouter un enfant et finaliser son inscription' : 'Assistant Inscription Famille'}
        </h2>
        <p style={{ color: '#64748B', marginBottom: 20 }}>Étape {step + 1}/{steps.length} — {steps[step]}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 24 }}>
          {steps.map((label, idx) => (
            <div key={label} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => jumpToStep(idx)}>
              <div style={{
                width: 30,
                height: 30,
                margin: '0 auto 6px',
                borderRadius: '50%',
                background: idx <= step ? 'var(--amc-primary)' : '#E2E8F0',
                color: idx <= step ? '#fff' : '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
              }}>
                {idx + 1}
              </div>
              <div style={{ fontSize: 11, color: idx + 1 <= step ? 'var(--amc-primary)' : '#94A3B8' }}>{label}</div>
            </div>
          ))}
        </div>

        {step === 0 && !existingFamily && (
          <div>
            <h3>Compte famille</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Prénom *</label>
                <input className="form-control" value={wizard.account.firstName} onChange={(e) => updateWizard('account', { firstName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Nom *</label>
                <input className="form-control" value={wizard.account.lastName} onChange={(e) => updateWizard('account', { lastName: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Email *</label>
              <input type="email" className="form-control" value={wizard.account.email} onChange={(e) => {
                updateWizard('account', { email: e.target.value });
                setEmailError('');
              }} />
              {emailError ? <div style={{ color: '#dc2626', marginTop: 6, fontSize: 13 }}>{emailError}</div> : null}
            </div>
            <div className="form-group">
              <label>Téléphone *</label>
              <input type="tel" className="form-control" value={wizard.account.phone} onChange={(e) => updateWizard('account', { phone: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Mot de passe *</label>
                <input type="password" className="form-control" value={wizard.account.password} onChange={(e) => updateWizard('account', { password: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Confirmez le mot de passe *</label>
                <input type="password" className="form-control" value={wizard.account.confirmPassword} onChange={(e) => updateWizard('account', { confirmPassword: e.target.value })} />
              </div>
            </div>

            <h3 style={{ marginTop: 24 }}>Adresse et téléphones</h3>
            <div className="form-group"><label>Adresse *</label><input className="form-control" value={wizard.address.addressLine1} onChange={(e) => updateWizard('address', { addressLine1: e.target.value })} /></div>
            <div className="form-group"><label>Complément</label><input className="form-control" value={wizard.address.addressLine2} onChange={(e) => updateWizard('address', { addressLine2: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12 }}>
              <div className="form-group"><label>Code postal *</label><input className="form-control" value={wizard.address.postalCode} onChange={(e) => updateWizard('address', { postalCode: e.target.value })} /></div>
              <div className="form-group"><label>Ville *</label><input className="form-control" value={wizard.address.city} onChange={(e) => updateWizard('address', { city: e.target.value })} /></div>
              <div className="form-group"><label>Pays *</label><input className="form-control" value={wizard.address.country} onChange={(e) => updateWizard('address', { country: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Téléphone secondaire</label><input className="form-control" value={wizard.address.phoneSecondary} onChange={(e) => updateWizard('address', { phoneSecondary: e.target.value })} /></div>
          </div>
        )}

        {((step === 0 && existingFamily) || (step === 1 && !existingFamily)) && (
          <div>
            <h3>Membres de la famille</h3>
            <div style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid #E2E8F0', borderRadius: 12, background: '#ffffff' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.7fr 1fr 0.9fr', gap: 10, alignItems: 'center' }} className="member-inline-row">
                <div className="form-group member-inline">
                  <input className="form-control" placeholder="Nom *" value={memberForm.lastName} onChange={(e) => setMemberForm((p) => ({ ...p, lastName: e.target.value }))} />
                </div>
                <div className="form-group member-inline">
                  <input className="form-control" placeholder="Prénom *" value={memberForm.firstName} onChange={(e) => setMemberForm((p) => ({ ...p, firstName: e.target.value }))} />
                </div>
                <div className="form-group member-inline">
                  <input type="date" className="form-control" placeholder="Date naissance *" value={memberForm.dateOfBirth} onChange={(e) => setMemberForm((p) => ({ ...p, dateOfBirth: e.target.value }))} />
                </div>
                <div className="form-group member-inline">
                  <select className="form-control" value={memberForm.gender} onChange={(e) => setMemberForm((p) => ({ ...p, gender: e.target.value }))}>
                    <option value="GARCON">Garçon</option>
                    <option value="FILLE">Fille</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 10, background: '#F8FAFC', cursor: 'pointer', minWidth: 140, maxWidth: 220 }} className="member-photo-input">
                  <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Photo</span>
                  <input type="file" accept="image/*" className="form-control" onChange={handleMemberPhotoChange} style={{ padding: 2, minWidth: 0, width: 'auto' }} />
                </label>
                <label style={{ margin: 0, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 10, background: '#F8FAFC' }} className="member-inline-legacy">
                  <input type="checkbox" checked={memberForm.isOldStudent || false} onChange={(e) => setMemberForm((p) => ({ ...p, isOldStudent: e.target.checked }))} />
                  <span style={{ fontSize: 13, color: '#334155' }}>Ancien élève</span>
                </label>
                <button className="btn btn-primary btn-sm" onClick={addOrUpdateMember} style={{ whiteSpace: 'nowrap', padding: '10px 14px' }}>{editingMemberIndex !== null ? 'Mettre à jour' : 'Ajouter'}</button>
              </div>
              {memberForm.photoBase64 && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
                  <img src={memberForm.photoBase64} alt="Aperçu photo" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 12, border: '1px solid #E2E8F0' }} />
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
              {wizard.members.map((m, idx) => (
                <div key={`${m.firstName}-${idx}`} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {m.photoBase64 ? (
                      <img src={m.photoBase64} alt="Photo enfant" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 10, border: '1px solid #E2E8F0' }} />
                    ) : null}
                    <div><strong>{m.firstName} {m.lastName}</strong> — {m.dateOfBirth}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => { setMemberForm(m); setEditingMemberIndex(idx); }}>Modifier</button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeMember(idx)}>Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {((step === 1 && existingFamily) || (step === 2 && !existingFamily)) && (
          <div>
            <h3>Inscription aux cours</h3>
            {loadingClasses ? <p>Chargement des créneaux...</p> : (
              <>
                {wizard.members.map((member, memberIndex) => {
                  const isOldStudent = Boolean(member.isOldStudent);
                  const memberAge = getAgeFromDate(member.dateOfBirth);
                  return (
                    <div key={`${member.firstName}-${memberIndex}`} style={{ marginBottom: 20, border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, background: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0 }}>{member.firstName} {member.lastName}</h4>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                          <input type="checkbox" checked={isOldStudent} onChange={(e) => {
                            const checked = e.target.checked;
                            setWizard((prev) => ({
                              ...prev,
                              members: prev.members.map((m, idx) => idx === memberIndex ? { ...m, isOldStudent: checked } : m),
                              courseSelections: checked ? prev.courseSelections : prev.courseSelections.filter((s) => s.memberIndex !== memberIndex),
                            }));
                          }} /> Ancien élève
                        </label>
                      </div>
                      {!isOldStudent ? (
                        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', marginBottom: 16 }}>
                          <strong>Nouveau cours :</strong> Sélectionnez les pôles et cours disponibles. Un test de niveau sera organisé avec le secrétariat.
                        </div>
                      ) : null}
                      {!isOldStudent && poles.length > 0 ? (
                        <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                          {poles.map((pole) => {
                              // If science levels are merged into coran block, skip rendering the standalone science pole
                              if (sciencePole && coranPole && pole.id === sciencePole.id) return null;

                              const isArabic = String(pole.name || '').toLowerCase().includes('arabe');
                              const isCoran = String(pole.name || '').toLowerCase().includes('coran');

                              // Arabic: simple checkbox for the pole
                              if (isArabic) {
                                const poleSelected = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.poleId === pole.id && !s.classId && !s.levelId);
                                return (
                                  <div key={pole.id} style={{ borderRadius: 16, background: '#ffffff', border: '1px solid #E2E8F0', padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                                      <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1D4ED8' }}>{pole.name}</div>
                                        <div style={{ color: '#64748B', fontSize: 13 }}>{pole.description || 'Cours de langue arabe'}</div>
                                      </div>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, padding: '6px 12px', borderRadius: 999, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                        <input
                                          type="checkbox"
                                          checked={poleSelected}
                                          onChange={() => {
                                            setWizard((prev) => {
                                              const exists = prev.courseSelections.some((s) => s.memberIndex === memberIndex && s.poleId === pole.id && !s.classId && !s.levelId);
                                              const nextSelections = exists
                                                ? prev.courseSelections.filter((s) => !(s.memberIndex === memberIndex && s.poleId === pole.id && !s.classId && !s.levelId))
                                                : [...prev.courseSelections, { memberIndex, poleId: pole.id }];
                                              return { ...prev, courseSelections: nextSelections };
                                            });
                                          }}
                                          style={{ cursor: 'pointer' }}
                                        />
                                        Sélectionner
                                      </label>
                                    </div>
                                  </div>
                                );
                              }

                              // Coran: show Coran levels plus Sciences levels merged
                              if (isCoran) {
                                const scienceLevels = (sciencePole && sciencePole.levels) || [];
                                const mergedLevels = [...(pole.levels || []).map((l) => ({ ...l, poleId: pole.id })), ...scienceLevels.map((l) => ({ ...l, poleId: sciencePole?.id }))]
                                  .filter((lvl) => isLevelAllowedForAge(lvl, memberAge));

                                return (
                                  <div key={pole.id} style={{ borderRadius: 16, background: '#ffffff', border: '1px solid #E2E8F0', padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                                      <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1D4ED8' }}>{pole.name} & Sciences islamiques</div>
                                        <div style={{ color: '#64748B', fontSize: 13 }}>{pole.description || 'Choisissez un ou plusieurs niveaux'}</div>
                                      </div>
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700 }}>
                                        {mergedLevels.length} niveau(s)
                                      </div>
                                    </div>

                                    {mergedLevels.length > 0 ? (
                                      <div style={{ display: 'grid', gap: 12 }}>
                                        {mergedLevels.map((level) => {
                                          const levelSelected = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.levelId === level.id);
                                          return (
                                            <label
                                              key={level.id}
                                              style={{
                                                borderRadius: 14,
                                                border: '1px solid',
                                                borderColor: levelSelected ? '#2563EB' : '#E2E8F0',
                                                background: levelSelected ? '#EFF6FF' : '#FFFFFF',
                                                padding: 14,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                              }}
                                            >
                                              <div>
                                                <div style={{ fontSize: 14, fontWeight: 700 }}>{level.name}</div>
                                                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{level.code || 'Niveau'}</div>
                                              </div>
                                              <input
                                                type="checkbox"
                                                checked={levelSelected}
                                                onChange={() => toggleLevelSelection(memberIndex, level.poleId, level.id)}
                                              />
                                            </label>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: 13, color: '#64748B', padding: '12px 0' }}>Aucun niveau disponible pour ce pôle.</div>
                                    )}
                                  </div>
                                );
                              }

                              // Default: show levels for other poles
                                  const levelList = (pole.levels || []).filter((lvl) => isLevelAllowedForAge(lvl, memberAge));
                              return (
                                <div key={pole.id} style={{ borderRadius: 16, background: '#ffffff', border: '1px solid #E2E8F0', padding: 16 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                                    <div>
                                      <div style={{ fontSize: 16, fontWeight: 700, color: '#1D4ED8' }}>{pole.name}</div>
                                      <div style={{ color: '#64748B', fontSize: 13 }}>{pole.description || 'Sélectionnez un niveau pour ce pôle'}</div>
                                    </div>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700 }}>
                                      {levelList.length} niveau(s)
                                    </div>
                                  </div>

                                      {levelList.length > 0 ? (
                                    <div style={{ display: 'grid', gap: 12 }}>
                                      {levelList.map((level) => {
                                        const levelSelected = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.levelId === level.id);
                                        return (
                                          <label
                                            key={level.id}
                                            style={{
                                              borderRadius: 14,
                                              border: '1px solid',
                                              borderColor: levelSelected ? '#2563EB' : '#E2E8F0',
                                              background: levelSelected ? '#EFF6FF' : '#FFFFFF',
                                              padding: 14,
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              cursor: 'pointer',
                                            }}
                                          >
                                            <div>
                                              <div style={{ fontSize: 14, fontWeight: 700 }}>{level.name}</div>
                                              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{level.code || 'Niveau'}</div>
                                            </div>
                                            <input
                                              type="checkbox"
                                              checked={levelSelected}
                                              onChange={() => toggleLevelSelection(memberIndex, pole.id, level.id)}
                                            />
                                          </label>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 13, color: '#64748B', padding: '12px 0' }}>Aucun niveau disponible pour ce pôle.</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                      ) : null}
                      {isOldStudent && classesGroupedByPole.length > 0 ? (() => {
                        const filteredGroups = classesGroupedByPole
                          .map((group) => ({
                            ...group,
                            classes: group.classes.filter((cls) => {
                              if (!isClassAllowedForAge(cls, memberAge)) return false;
                              if (courseFilterPoleId && group.poleId !== courseFilterPoleId) return false;
                              if (courseFilterDay && cls.dayOfWeek !== courseFilterDay) return false;
                              return true;
                            }),
                          }))
                          .filter((group) => group.classes.length > 0);
                        const hasAnyClass = filteredGroups.some((group) => group.classes.length > 0);
                        const filtersSelected = Boolean(courseFilterPoleId || courseFilterDay);
                        return (
                          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 16, borderRadius: 18, background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180, maxWidth: 240, flex: 1 }}>
                                <label style={{ fontWeight: 700, fontSize: 12, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pôle</label>
                                <select
                                  value={courseFilterPoleId}
                                  onChange={(e) => setCourseFilterPoleId(e.target.value)}
                                  style={{ border: '1px solid #CBD5E1', borderRadius: 14, padding: '12px 14px', background: '#F8FAFC', color: '#0F172A', outline: 'none', boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.06)' }}
                                >
                                  <option value="">Choisir</option>
                                  {poles.map((pole) => (
                                    <option key={pole.id} value={pole.id}>{pole.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180, maxWidth: 240, flex: 1 }}>
                                <label style={{ fontWeight: 700, fontSize: 12, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Jour</label>
                                <select
                                  value={courseFilterDay}
                                  onChange={(e) => setCourseFilterDay(e.target.value)}
                                  style={{ border: '1px solid #CBD5E1', borderRadius: 14, padding: '12px 14px', background: '#F8FAFC', color: '#0F172A', outline: 'none', boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.06)' }}
                                >
                                  <option value="">Choisir</option>
                                  {WEEK_DAYS.map((day) => (
                                    <option key={day} value={day}>{day}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            {!filtersSelected ? (
                              <div style={{ padding: 16, borderRadius: 12, background: '#FEF3C7', border: '1px solid #FBBF24', color: '#92400E' }}>
                                Veuillez sélectionner au moins un Pôle ou un Jour pour afficher les cours disponibles.
                              </div>
                            ) : (
                              <>
                                <div style={{ borderRadius: 16, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: 16 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                                    <div>
                                      <div style={{ fontSize: 16, fontWeight: 700, color: '#1D4ED8' }}>Niveaux disponibles par pôle</div>
                                      <div style={{ color: '#64748B', fontSize: 13 }}>Affichage des niveaux par pôle en plus des cours Arabe et Coran.</div>
                                    </div>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700 }}>
                                      {filteredGroups.length} pôles
                                    </div>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                                    {filteredGroups.map((group) => {
                                      const uniqueLevels = Array.from(new Set(group.classes.map((cls) => cls.level?.name).filter(Boolean)));
                                      return (
                                        <div key={`${group.poleId}-levels`} style={{ borderRadius: 14, background: '#FFFFFF', border: '1px solid #E2E8F0', padding: 12 }}>
                                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1D4ED8', marginBottom: 8 }}>{group.poleName}</div>
                                          <div style={{ fontSize: 12, color: '#475569', minHeight: 32 }}>
                                            {uniqueLevels.length > 0 ? uniqueLevels.join(', ') : 'Aucun niveau défini'}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {!hasAnyClass ? (
                                  <div style={{ padding: 16, borderRadius: 12, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>
                                    Aucun cours disponible pour cet âge ou les filtres sélectionnés ({memberAge !== null ? `${memberAge} ans` : 'date de naissance invalide'}).
                                  </div>
                                ) : null}

                                {filteredGroups.map((group) => (
                                  <div key={group.poleId} style={{ borderRadius: 16, background: '#ffffff', border: '1px solid #E2E8F0', padding: 16 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                                <div>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1D4ED8' }}>{group.poleName}</div>
                                  <div style={{ color: '#64748B', fontSize: 13 }}>{group.classes.length} cours disponibles</div>
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700 }}>
                                  Par pôle
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                                {group.classes.map((cls) => {
                                  const selected = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.classId === cls.id);
                                  const isWaitlist = cls.status === 'FULL' || cls.enrolledCount >= cls.capacity;
                                  return (
                                    <label
                                      key={cls.id}
                                      style={{
                                        borderRadius: 14,
                                        border: '1px solid',
                                        borderColor: selected ? '#2563EB' : isWaitlist ? '#F87171' : '#E2E8F0',
                                        background: selected ? '#EFF6FF' : isWaitlist ? '#FEF2F2' : '#FFFFFF',
                                        padding: 14,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        minHeight: 130,
                                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                        boxShadow: selected ? '0 10px 30px rgba(37,99,235,0.08)' : '0 0 0 rgba(0,0,0,0)',
                                      }}
                                    >
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                                          <div>
                                            <div style={{ fontSize: 14, fontWeight: 700 }}>{cls.level?.name || cls.pole?.name || 'Niveau'}</div>
                                            <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{cls.dayOfWeek} {cls.startTime} - {cls.endTime}</div>
                                          </div>
                                          {selected && (
                                            <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', background: '#DBEAFE', borderRadius: 999, padding: '4px 10px' }}>
                                              Sélectionné
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>Salle {cls.room || '-'}</div>
                                        {cls.teacherName ? <div style={{ fontSize: 12, color: '#475569' }}>Professeur : {cls.teacherName}</div> : null}
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                        <span style={{ fontSize: 12, color: isWaitlist ? '#B91C1C' : '#334155' }}>{isWaitlist ? 'Liste d’attente' : `${cls.enrolledCount}/${cls.capacity} inscrits`}</span>
                                        <input type="checkbox" checked={selected} onChange={() => toggleCourseSelection(memberIndex, cls.id)} />
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                                </>
                              )}
                        </div>
                        );
                      })() : null}
                    </div>
                  );
                })}

                <button className="btn btn-outline" onClick={refreshPricing}>Recalculer les tarifs</button>

                {pricingPreview && (
                  <div className="card" style={{ marginTop: 16, background: '#EEF2FF' }}>
                    <strong>Récap tarifaire</strong>
                    <div>Frais inscription (1 fois par famille): {Number(pricingPreview.registrationFee).toFixed(2)} €</div>
                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>Ce montant est facturé une seule fois, quel que soit le nombre d’enfants inscrits.</div>
                    <div>Arabe ({pricingPreview.arabicCount} élève(s)): {Number(pricingPreview.arabicFee).toFixed(2)} €</div>
                    <div>Coran: {Number(pricingPreview.coranFee ?? pricingPreview.coranScienceFee).toFixed(2)} €</div>
                    <div>Sciences islamiques: {Number(pricingPreview.sciencesFee || 0).toFixed(2)} €</div>
                    {wizard.payment.method === 'GO_CARDLESS_SEPA' && pricingPreview.fraisPrelevement > 0 && (
                      <div>Frais prélèvement SEPA: {Number(pricingPreview.fraisPrelevement).toFixed(2)} €</div>
                    )}
                    <div style={{ marginTop: 8, fontWeight: 700 }}>
                      TOTAL: {Number(pricingPreview.total + (wizard.payment.method === 'GO_CARDLESS_SEPA' ? pricingPreview.fraisPrelevement : 0)).toFixed(2)} €
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {((step === 2 && existingFamily) || (step === 3 && !existingFamily)) && (
          <div>
            <h3>Formulaire sanitaire</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {wizard.members.map((m, idx) => (
                <button key={idx} className={`btn btn-sm ${idx === activeHealthMember ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveHealthMember(idx)}>
                  {m.firstName} {m.lastName}
                </button>
              ))}
            </div>

            {wizard.members.length === 0 ? <p>Ajoutez d’abord des membres à l’étape 2.</p> : (
              <div>
                {[
                  ['hasChronicDisease', 'Maladies chroniques', 'chronicDiseaseDetails'],
                  ['hasMedicalTreatment', 'Traitement médical', 'medicalTreatmentDetails'],
                  ['hasAllergy', 'Allergies', 'allergyDetails'],
                  ['hasDisability', 'Handicap', 'disabilityDetails'],
                ].map(([flag, label, detail]) => (
                  <div key={flag} className="form-group">
                    <label>{label} ?</label>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <label><input type="radio" checked={activeHealthForm[flag] === true} onChange={() => updateActiveHealthForm({ [flag]: true })} /> Oui</label>
                      <label><input type="radio" checked={activeHealthForm[flag] === false} onChange={() => updateActiveHealthForm({ [flag]: false, [detail]: '' })} /> Non</label>
                    </div>
                    {activeHealthForm[flag] && (
                      <textarea className="form-control" rows={2} placeholder="Détails" value={activeHealthForm[detail] || ''} onChange={(e) => updateActiveHealthForm({ [detail]: e.target.value })} />
                    )}
                  </div>
                ))}

                <div className="form-group"><label>Infos utiles complémentaires</label><textarea className="form-control" rows={2} value={activeHealthForm.otherUsefulHealthInfo || ''} onChange={(e) => updateActiveHealthForm({ otherUsefulHealthInfo: e.target.value })} /></div>

                <h4>Contacts d'urgence</h4>
                {(activeHealthForm.emergencyContacts || []).map((contact, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                    <input className="form-control" placeholder="Nom" value={contact.lastName || ''} onChange={(e) => updateCollectionRow('emergencyContacts', idx, { lastName: e.target.value })} />
                    <input className="form-control" placeholder="Prénom" value={contact.firstName || ''} onChange={(e) => updateCollectionRow('emergencyContacts', idx, { firstName: e.target.value })} />
                    <input className="form-control" placeholder="Lien" value={contact.relationship || ''} onChange={(e) => updateCollectionRow('emergencyContacts', idx, { relationship: e.target.value })} />
                    <input className="form-control" placeholder="Téléphone" value={contact.phone || ''} onChange={(e) => updateCollectionRow('emergencyContacts', idx, { phone: e.target.value })} />
                    <button className="btn btn-danger btn-sm" onClick={() => removeCollectionRow('emergencyContacts', idx)}>X</button>
                  </div>
                ))}
                <button className="btn btn-outline btn-sm" onClick={() => addCollectionRow('emergencyContacts', { firstName: '', lastName: '', relationship: '', phone: '' })}>+ contact</button>

                <div className="form-group" style={{ marginTop: 14 }}>
                  <label>Sortie seul après cours ?</label>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <label><input type="radio" checked={activeHealthForm.canLeaveAloneAfterClass === true} onChange={() => updateActiveHealthForm({ canLeaveAloneAfterClass: true })} /> Oui</label>
                    <label><input type="radio" checked={activeHealthForm.canLeaveAloneAfterClass === false} onChange={() => updateActiveHealthForm({ canLeaveAloneAfterClass: false })} /> Non</label>
                  </div>
                </div>

                {activeHealthForm.canLeaveAloneAfterClass === false && (
                  <>
                    <h4>Personnes autorisées à récupérer l'enfant</h4>
                    {(activeHealthForm.pickupAuthorizedPersons || []).map((person, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                        <input className="form-control" placeholder="Nom complet" value={person.fullName || ''} onChange={(e) => updateCollectionRow('pickupAuthorizedPersons', idx, { fullName: e.target.value })} />
                        <input className="form-control" placeholder="Lien" value={person.relationship || ''} onChange={(e) => updateCollectionRow('pickupAuthorizedPersons', idx, { relationship: e.target.value })} />
                        <input className="form-control" placeholder="Téléphone" value={person.phone || ''} onChange={(e) => updateCollectionRow('pickupAuthorizedPersons', idx, { phone: e.target.value })} />
                        <button className="btn btn-danger btn-sm" onClick={() => removeCollectionRow('pickupAuthorizedPersons', idx)}>X</button>
                      </div>
                    ))}
                    <button className="btn btn-outline btn-sm" onClick={() => addCollectionRow('pickupAuthorizedPersons', { fullName: '', relationship: '', phone: '' })}>+ personne</button>
                  </>
                )}

                <div className="form-group" style={{ marginTop: 14 }}>
                  <label><input type="checkbox" checked={activeHealthForm.emergencyAuthorizationAccepted || false} onChange={(e) => updateActiveHealthForm({ emergencyAuthorizationAccepted: e.target.checked })} /> J'autorise les interventions d'urgence si nécessaire</label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <input className="form-control" placeholder="Nom du représentant légal" value={activeHealthForm.legalRepresentativeFullName || ''} onChange={(e) => updateActiveHealthForm({ legalRepresentativeFullName: e.target.value, legalRepresentativeSignature: e.target.value })} />
                  <input className="form-control" placeholder="Ville" value={activeHealthForm.citySigned || ''} onChange={(e) => updateActiveHealthForm({ citySigned: e.target.value })} />
                  <input type="date" className="form-control" value={activeHealthForm.signedAt || ''} onChange={(e) => updateActiveHealthForm({ signedAt: e.target.value })} />
                </div>
              </div>
            )}
          </div>
        )}

        {((step === 3 && existingFamily) || (step === 4 && !existingFamily)) && (
          <div>
            <h3>Décharge & engagement</h3>
            <div className="card" style={{ background: '#FFF7ED', border: '1px solid #FDBA74' }}>
              <p><strong>Conditions principales :</strong></p>
              <ul>
                {engagementBulletPoints.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p style={{ fontSize: 13, color: '#7C2D12' }}>La signature engage les représentants légaux à respecter les règles de sécurité et de suivi pédagogique PARTAGE.</p>
            </div>

            <div style={{ marginBottom: 18, padding: 16, border: '2px solid #DC2626', borderRadius: 10, background: '#FEE2E2' }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#991B1B' }}>⚠️ Veuillez lire le règlement intérieur avant de valider vos inscriptions</div>
              <div style={{ fontSize: 14 }}>
                <a href="/reglement-interieur" target="_blank" rel="noopener noreferrer" style={{ color: '#DC2626', textDecoration: 'underline', fontWeight: 600 }}>
                  Ouvrir le règlement intérieur
                </a>
              </div>
            </div>

            <div className="form-group">
              <label><input type="checkbox" checked={wizard.engagement.readAndApproved} onChange={(e) => updateWizard('engagement', { readAndApproved: e.target.checked })} /> J'ai lu l'engagement complet</label>
            </div>
            <div className="form-group">
              <label><input type="checkbox" checked={wizard.engagement.legalMentionAccepted} onChange={(e) => updateWizard('engagement', { legalMentionAccepted: e.target.checked })} /> Mention "Lu et approuvé" confirmée</label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
              <input className="form-control" placeholder="Nom et prénom signataire" value={wizard.engagement.signedByFullName} onChange={(e) => updateWizard('engagement', { signedByFullName: e.target.value })} />
              <input className="form-control" placeholder="Lieu" value={wizard.engagement.citySigned} onChange={(e) => updateWizard('engagement', { citySigned: e.target.value })} />
              <input type="date" className="form-control" value={wizard.engagement.signedAt} onChange={(e) => updateWizard('engagement', { signedAt: e.target.value })} />
            </div>
          </div>
        )}

        {((step === 4 && existingFamily) || (step === 5 && !existingFamily)) && (
          <div>
            <h3>Paiement & confirmation</h3>

            <div className="card" style={{ marginBottom: 14, background: '#F8FAFC' }}>
              <strong>Récapitulatif des inscriptions</strong>
              <ul>
                {selectedEnrollmentsLabel.map((line) => <li key={line}>{line}</li>)}
              </ul>
              {pricingPreview && (
                <div style={{ marginTop: 8, fontWeight: 700 }}>
                  Total estimé: {Number(pricingPreview.total).toFixed(2)} €
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                    Montant total incluant les frais d’inscription facturés une seule fois par famille.
                  </div>
                </div>
              )}
            </div>

              <div className="form-group" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label>Mode de paiement</label>
                  <select className="form-control" value={wizard.payment.method} onChange={(e) => {
                    const method = e.target.value;
                    updateWizard('payment', { method });
                  }}>
                    <option value="CARTE_BANCAIRE">Carte bancaire (au secrétariat)</option>
                    <option value="ESPECES">Espèces</option>
                    <option value="CHEQUE">Chèque</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label>Payeur</label>
                  <input
                    className="form-control"
                    type="text"
                    value={wizard.payment.payerName ?? wizard.address.familyName ?? ''}
                    onChange={e => updateWizard('payment', { payerName: e.target.value })}
                    placeholder="Nom du payeur"
                  />
                </div>
              </div>
            {wizard.payment.method === 'STRIPE_SEPA' && (
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div className="form-group" style={{ maxWidth: 320 }}>
                  <label>Échéances</label>
                  <select className="form-control" value={wizard.payment.installmentsCount} onChange={(e) => updateWizard('payment', { installmentsCount: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'échéance' : 'échéances'}</option>)}
                  </select>
                  <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
                    Votre mandat SEPA sera créé et votre IBAN enregistré pour le prélèvement du montant prévu.
                  </div>
                </div>
                {wizard.payment.installmentsCount > 1 && (
                  <>
                    <div className="form-group" style={{ maxWidth: 320 }}>
                      <label>Jour de prélèvement</label>
                      <select className="form-control" value={wizard.payment.scheduleDay} onChange={(e) => updateWizard('payment', { scheduleDay: Number(e.target.value) })}>
                        {[10, 20, 30].map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
                      Le premier prélèvement sera déclenché à la date choisie, puis les échéances suivantes seront prélevées automatiquement le même jour chaque mois.
                    </div>
                  </>
                )}
              </div>
            )}

            {wizard.payment.method === 'CHEQUE' && (
              <>
                <div className="form-group">
                  <label>Nombre de chèques (1 à 8)</label>
                  <select className="form-control" value={wizard.payment.installmentsCount} onChange={(e) => updateWizard('payment', { installmentsCount: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} chèque(s)</option>)}
                  </select>
                </div>
                <div className="card" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <p><strong>Instructions chèque :</strong></p>
                  <ul>
                    <li>Libeller à l’ordre de l’Association PARTAGE.</li>
                    <li>Indiquer au dos le nom de famille et l’année scolaire.</li>
                    <li>Déposer le lot de chèques selon l’échéancier généré.</li>
                  </ul>
                  <label><input type="checkbox" checked={wizard.payment.chequeInstructionsAccepted || false} onChange={(e) => updateWizard('payment', { chequeInstructionsAccepted: e.target.checked })} /> J’ai lu les instructions chèque.</label>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, flexWrap: 'wrap', gap: 10 }}>
          <button className="btn btn-outline" onClick={step === 0 ? () => navigate(existingFamily ? '/famille' : '/register') : prev}>{step === 0 ? (existingFamily ? 'Retour famille' : 'Retour inscription') : 'Précédent'}</button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {step < steps.length - 1 ? (
              <button className="btn btn-primary" onClick={next}>Suivant</button>
            ) : (
              <button className="btn btn-primary" onClick={submitFinal} disabled={submitting}>{submitting ? 'Validation...' : 'Confirmer & payer'}</button>
            )}
          </div>
        </div>
        <div style={{ marginTop: 24, padding: 16, border: '1px solid #E2E8F0', borderRadius: 12, background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <img src="/amc_logo.png" alt="AMC" style={{ height: 32, objectFit: 'contain' }} />
            <img src="/amc_logo_partner.png" alt="PARTAGE" style={{ height: 32, objectFit: 'contain' }} />
          </div>
          <div style={{ fontWeight: 700 }}>Association AMC & PARTAGE</div>
          <div style={{ color: '#475569', fontSize: 13 }}>Association Partage et des Musulmans de Clamart (AMC) — 92140 Clamart, France</div>
        </div>
      </div>
    </div>
  );
}

