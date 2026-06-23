import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

// ─── Constantes ───────────────────────────────────────────────────────────────
const WEEK_DAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];

const SCHOOL_GRADES = [
  { value: 'CP', label: 'CP', category: 'primaire' },
  { value: 'CE1', label: 'CE1', category: 'primaire' },
  { value: 'CE2', label: 'CE2', category: 'primaire' },
  { value: 'CM1', label: 'CM1', category: 'primaire' },
  { value: 'CM2', label: 'CM2', category: 'primaire' },
  { value: '6eme', label: '6ème', category: 'college' },
  { value: '5eme', label: '5ème', category: 'college' },
  { value: '4eme', label: '4ème', category: 'college' },
  { value: '3eme', label: '3ème', category: 'college' },
  { value: 'Seconde', label: 'Seconde', category: 'lycee' },
  { value: 'Premiere', label: 'Première', category: 'lycee' },
  { value: 'Terminale', label: 'Terminale', category: 'lycee' },
];

const engagementBulletPoints = [
  "Les élèves de moins de 11 ans doivent être accompagnés et récupérés par le responsable légal.",
  "Les familles s'engagent à respecter ponctualité, assiduité et suivi pédagogique à domicile.",
  "Tout changement de personne autorisée à récupérer l'enfant doit être signalé par écrit.",
  "PARTAGE est déchargée de responsabilité dès récupération de l'enfant devant sa salle.",
  "Le stationnement dangereux ou gênant aux abords du centre est strictement interdit.",
];

const STEP_LABELS = ['Info famille', 'Membres', 'Cours & tarifs', 'Fiche sanitaire', 'Engagement', 'Paiement'];

const emptyMember = { firstName: '', lastName: '', dateOfBirth: '', gender: 'GARCON', photoBase64: '', isOldStudent: false };

const emptyHealthForm = {
  hasChronicDisease: false, chronicDiseaseDetails: '',
  hasMedicalTreatment: false, medicalTreatmentDetails: '',
  hasAllergy: false, allergyDetails: '',
  hasDisability: false, disabilityDetails: '',
  otherUsefulHealthInfo: '',
  canLeaveAloneAfterClass: null,
  emergencyContacts: [{ firstName: '', lastName: '', relationship: '', phone: '' }],
  pickupAuthorizedPersons: [{ fullName: '', relationship: '', phone: '' }],
  emergencyAuthorizationAccepted: false,
  legalRepresentativeFullName: '', citySigned: '',
  signedAt: new Date().toISOString().slice(0, 10),
};

// ─── Fonctions utilitaires ─────────────────────────────────────────────────────
function normStr(s) {
  return String(s || '').toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a')
    .replace(/[ôö]/g, 'o').replace(/ç/g, 'c').replace(/[ùûü]/g, 'u');
}

function matchSoutienLevel(levelName, grade, gender) {
  if (!grade || !levelName) return false;
  const gradeObj = SCHOOL_GRADES.find((g) => g.value === grade);
  if (!gradeObj) return false;
  const ln = normStr(levelName);
  if (gradeObj.category === 'primaire') return ln.includes('primaire');
  const isFille = gender === 'FILLE';
  if (gradeObj.category === 'college') return ln.includes('college') && (isFille ? ln.includes('fille') : ln.includes('garcon'));
  if (gradeObj.category === 'lycee') return ln.includes('lycee') && (isFille ? ln.includes('fille') : ln.includes('garcon'));
  return false;
}

function getAgeFromDate(dateString) {
  if (!dateString) return null;
  const dob = new Date(dateString);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

function isLevelAllowedForAge(level, age) {
  if (age === null) return true;
  if (level?.minAge != null && age < level.minAge) return false;
  if (level?.maxAge != null && age > level.maxAge) return false;
  return true;
}

function isClassAllowedForAge(cls, age) {
  if (age === null) return true;
  if (cls.level?.minAge != null && age < cls.level.minAge) return false;
  if (cls.level?.maxAge != null && age > cls.level.maxAge) return false;
  return true;
}

function isValidIban(value) {
  if (!value) return false;
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(String(value).toUpperCase().replace(/\s+/g, ''));
}

function isValidSwift(value) {
  if (!value) return false;
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(String(value).trim().toUpperCase());
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function AdminEnrollmentWizard({ family, familyDetails, isNewFamily = false, onClose, onSuccess }) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [allClasses, setAllClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [poles, setPoles] = useState([]);
  const [pricingPreview, setPricingPreview] = useState(null);
  const [courseFilterPoleId, setCourseFilterPoleId] = useState('');
  const [courseFilterDay, setCourseFilterDay] = useState('');
  const [schoolGradeByMember, setSchoolGradeByMember] = useState({});
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [editingMemberIndex, setEditingMemberIndex] = useState(null);
  const [activeHealthMember, setActiveHealthMember] = useState(0);

  const [wizard, setWizard] = useState(() => {
    const f = family || {};
    const repName = `${f.user?.firstName || ''} ${f.user?.lastName || ''}`.trim();
    return {
      email: '',
      address: {
        familyName: f.familyName || '',
        addressLine1: f.addressLine1 || '',
        addressLine2: f.addressLine2 || '',
        postalCode: f.postalCode || '',
        city: f.city || '',
        country: f.country || 'France',
        phonePrimary: f.phonePrimary || '',
        phoneSecondary: f.phoneSecondary || '',
      },
      members: [],
      courseSelections: [],
      healthForms: {},
      engagement: {
        readAndApproved: false,
        legalMentionAccepted: false,
        signedByFullName: repName,
        signedByRole: 'responsable_legal',
        citySigned: f.city || '',
        signedAt: new Date().toISOString().slice(0, 10),
      },
      payment: {
        method: '',
        installmentsCount: 1,
        scheduleDay: 10,
        firstPaymentDate: new Date().toISOString().slice(0, 10),
        chequeInstructionsAccepted: false,
        bankDebitIban: '',
        bankDebitSwift: '',
        ribDocument: null,
      },
    };
  });

  // Charger les cours et pôles
  useEffect(() => {
    api.get('/enrollments/poles').then(({ data }) => setPoles(data.poles || [])).catch(() => {});
    setLoadingClasses(true);
    api.get('/enrollments/classes')
      .then(({ data }) => setAllClasses((data.classes || []).filter((c) => c.status !== 'CLOSED')))
      .catch(() => toast.error('Impossible de charger les cours'))
      .finally(() => setLoadingClasses(false));
  }, []);

  const updateWizard = (section, partial) =>
    setWizard((prev) => ({ ...prev, [section]: { ...prev[section], ...partial } }));

  const activeHealthForm = wizard.healthForms[activeHealthMember] || { ...emptyHealthForm };

  const updateActiveHealthForm = (partial) => {
    setWizard((prev) => ({
      ...prev,
      healthForms: {
        ...prev.healthForms,
        [activeHealthMember]: { ...(prev.healthForms[activeHealthMember] || emptyHealthForm), ...partial },
      },
    }));
  };

  const updateCollectionRow = (field, index, partial) => {
    const source = [...(activeHealthForm[field] || [])];
    source[index] = { ...source[index], ...partial };
    updateActiveHealthForm({ [field]: source });
  };

  const addCollectionRow = (field, template) =>
    updateActiveHealthForm({ [field]: [...(activeHealthForm[field] || []), template] });

  const removeCollectionRow = (field, index) =>
    updateActiveHealthForm({ [field]: (activeHealthForm[field] || []).filter((_, i) => i !== index) });

  // Ajouter un élève existant de la famille
  const addExistingStudent = (student) => {
    const already = wizard.members.some(
      (m) => m.firstName === student.firstName && m.lastName === student.lastName && m.dateOfBirth?.slice(0, 10) === student.dateOfBirth?.slice(0, 10)
    );
    if (already) { toast.error('Cet élève est déjà dans la liste'); return; }
    const newMember = {
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : '',
      gender: student.gender || 'GARCON',
      photoBase64: '',
      isOldStudent: true,
    };
    setWizard((prev) => {
      const members = [...prev.members, newMember];
      const healthForms = { ...prev.healthForms };
      const idx = members.length - 1;
      if (!healthForms[idx]) {
        healthForms[idx] = {
          ...emptyHealthForm,
          legalRepresentativeFullName: `${family?.user?.firstName || ''} ${family?.user?.lastName || ''}`.trim(),
          citySigned: family?.city || '',
          signedAt: new Date().toISOString().slice(0, 10),
        };
      }
      return { ...prev, members, healthForms };
    });
  };

  // Ajouter / mettre à jour un membre manuel
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
          healthForms[idx] = {
            ...emptyHealthForm,
            legalRepresentativeFullName: `${family?.user?.firstName || ''} ${family?.user?.lastName || ''}`.trim(),
            citySigned: family?.city || '',
            signedAt: new Date().toISOString().slice(0, 10),
          };
        }
      });
      return { ...prev, members, healthForms };
    });
    setMemberForm(emptyMember);
    setEditingMemberIndex(null);
  };

  const removeMember = (index) => {
    setWizard((prev) => {
      const members = prev.members.filter((_, i) => i !== index);
      const courseSelections = prev.courseSelections
        .filter((s) => s.memberIndex !== index)
        .map((s) => ({ ...s, memberIndex: s.memberIndex > index ? s.memberIndex - 1 : s.memberIndex }));
      const healthForms = {};
      members.forEach((_, i) => { healthForms[i] = prev.healthForms[i >= index ? i + 1 : i] || { ...emptyHealthForm }; });
      return { ...prev, members, courseSelections, healthForms };
    });
    setActiveHealthMember(0);
  };

  const toggleCourseSelection = (memberIndex, classId) => {
    setWizard((prev) => {
      const exists = prev.courseSelections.find((s) => s.memberIndex === memberIndex && s.classId === classId);
      return {
        ...prev,
        courseSelections: exists
          ? prev.courseSelections.filter((s) => !(s.memberIndex === memberIndex && s.classId === classId))
          : [...prev.courseSelections, { memberIndex, classId }],
      };
    });
  };

  const toggleLevelSelection = (memberIndex, poleId, levelId) => {
    setWizard((prev) => {
      const exists = prev.courseSelections.find((s) => s.memberIndex === memberIndex && s.levelId === levelId);
      return {
        ...prev,
        courseSelections: exists
          ? prev.courseSelections.filter((s) => !(s.memberIndex === memberIndex && s.levelId === levelId))
          : [...prev.courseSelections, { memberIndex, poleId, levelId }],
      };
    });
  };

  const sciencePole = useMemo(() => poles.find((p) => normStr(p.name).includes('sciences')), [poles]);
  const coranPole = useMemo(() => poles.find((p) => normStr(p.name).includes('coran')), [poles]);

  const classesGroupedByPole = useMemo(() => {
    const map = {};
    for (const cls of allClasses) {
      const pid = cls.level?.pole?.id || cls.poleId || 'other';
      const pname = cls.level?.pole?.name || cls.pole?.name || 'Autre';
      if (!map[pid]) map[pid] = { poleId: pid, poleName: pname, classes: [] };
      map[pid].classes.push(cls);
    }
    return Object.values(map);
  }, [allClasses]);

  const selectedEnrollmentsLabel = useMemo(() => {
    return wizard.courseSelections.map((sel) => {
      const m = wizard.members[sel.memberIndex];
      if (!m) return '';
      if (sel.classId) {
        const cls = allClasses.find((c) => c.id === sel.classId);
        return `${m.firstName} ${m.lastName} : ${cls?.level?.name || cls?.pole?.name || 'Cours'}`;
      }
      if (sel.levelId) {
        const lev = poles.flatMap((p) => p.levels || []).find((l) => l.id === sel.levelId);
        return `${m.firstName} ${m.lastName} : ${lev?.name || 'Niveau'}`;
      }
      if (sel.poleId) {
        const pole = poles.find((p) => p.id === sel.poleId);
        return `${m.firstName} ${m.lastName} : ${pole?.name || 'Pôle'}`;
      }
      return '';
    }).filter(Boolean);
  }, [wizard.courseSelections, wizard.members, allClasses, poles]);

  const refreshPricing = async () => {
    try {
      const { data } = await api.post('/family-wizard/pricing-preview', {
        courseSelections: wizard.courseSelections,
        existingFamily: true,
      });
      setPricingPreview(data.pricing);
    } catch { /* silencieux */ }
  };

  // Validation par étape
  const validateStep = () => {
    const { address, members, courseSelections, engagement } = wizard;

    if (step === 0) {
      if (!address.familyName || !address.addressLine1 || !address.postalCode || !address.city || !address.phonePrimary) {
        toast.error('Veuillez compléter les champs obligatoires (nom famille, adresse, téléphone)');
        return false;
      }
      if (isNewFamily) {
        if (!wizard.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizard.email)) {
          toast.error('Veuillez saisir une adresse email valide pour le compte famille');
          return false;
        }
      }
    }

    if (step === 1) {
      if (members.length === 0) {
        toast.error('Ajoutez au moins un membre');
        return false;
      }
    }

    if (step === 2) {
      const oldStudents = members.filter((m) => m.isOldStudent);
      if (oldStudents.length > 0) {
        const missing = oldStudents.some((_, idx) => {
          const realIdx = members.indexOf(oldStudents[idx]);
          return !courseSelections.some((s) => s.memberIndex === realIdx && s.classId);
        });
        if (missing) {
          toast.error('Veuillez sélectionner un cours pour chaque ancien élève');
          return false;
        }
      }
    }

    if (step === 3) {
      for (let i = 0; i < members.length; i++) {
        const h = wizard.healthForms[i] || {};
        const m = members[i];
        const name = `${m.firstName} ${m.lastName}`;
        if (h.canLeaveAloneAfterClass === null || h.canLeaveAloneAfterClass === undefined) {
          toast.error(`Fiche ${name} : précisez si l'élève peut sortir seul après le cours`);
          setActiveHealthMember(i);
          return false;
        }
        if (h.canLeaveAloneAfterClass === false && (!h.pickupAuthorizedPersons || h.pickupAuthorizedPersons.length === 0)) {
          toast.error(`Fiche ${name} : ajoutez au moins une personne autorisée à récupérer l'élève`);
          setActiveHealthMember(i);
          return false;
        }
        if (!h.emergencyAuthorizationAccepted) {
          toast.error(`Fiche ${name} : l'autorisation d'urgence doit être acceptée`);
          setActiveHealthMember(i);
          return false;
        }
      }
    }

    if (step === 4) {
      if (!engagement.readAndApproved || !engagement.legalMentionAccepted || !engagement.signedByFullName || !engagement.citySigned || !engagement.signedAt) {
        toast.error("Veuillez compléter l'engagement (validation, signataire, lieu, date)");
        return false;
      }
    }

    if (step === 5) {
      if (!wizard.payment.method) {
        toast.error('Veuillez sélectionner un mode de paiement');
        return false;
      }
    }

    return true;
  };

  const next = async () => {
    if (!validateStep()) return;
    if (step === 2) await refreshPricing();
    setStep((s) => Math.min(s + 1, 5));
  };

  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      const payload = {
        address: wizard.address,
        members: wizard.members,
        courseSelections: wizard.courseSelections,
        healthForms: wizard.healthForms,
        engagement: wizard.engagement,
        payment: wizard.payment,
      };
      if (isNewFamily) {
        await api.post('/admin/families/enroll-new', { ...payload, email: wizard.email });
      } else {
        await api.post(`/admin/families/${family.id}/enroll`, payload);
      }
      toast.success('Inscription créée avec succès');
      onSuccess?.();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Erreur lors de la création de l'inscription");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Rendu du step 0 : Info famille ─────────────────────────────────────────
  const renderStep0 = () => (
    <div>
      <h3 style={{ marginBottom: 16 }}>Informations famille</h3>

      {isNewFamily ? (
        <div style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#92400E' }}>
          Nouvelle famille — renseignez les informations ci-dessous. Un compte sera créé avec l'adresse email saisie. Le responsable pourra réinitialiser son mot de passe par email.
        </div>
      ) : (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#1E40AF' }}>
          Ces informations sont pré-remplies depuis le profil de la famille sélectionnée. Vous pouvez les modifier si nécessaire.
        </div>
      )}

      {isNewFamily && (
        <div className="form-group">
          <label>Email du compte famille *</label>
          <input
            type="email"
            className="form-control"
            placeholder="exemple@email.com"
            value={wizard.email}
            onChange={(e) => setWizard((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>
      )}

      <div className="form-group">
        <label>Nom de famille *</label>
        <input className="form-control" value={wizard.address.familyName} onChange={(e) => updateWizard('address', { familyName: e.target.value })} />
      </div>

      <div className="form-group">
        <label>Adresse *</label>
        <input className="form-control" value={wizard.address.addressLine1} onChange={(e) => updateWizard('address', { addressLine1: e.target.value })} />
      </div>
      <div className="form-group">
        <label>Complément d'adresse</label>
        <input className="form-control" value={wizard.address.addressLine2} onChange={(e) => updateWizard('address', { addressLine2: e.target.value })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label>Code postal *</label>
          <input className="form-control" value={wizard.address.postalCode} onChange={(e) => updateWizard('address', { postalCode: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Ville *</label>
          <input className="form-control" value={wizard.address.city} onChange={(e) => updateWizard('address', { city: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Pays *</label>
          <input className="form-control" value={wizard.address.country} onChange={(e) => updateWizard('address', { country: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label>Téléphone principal *</label>
          <input type="tel" className="form-control" value={wizard.address.phonePrimary} onChange={(e) => updateWizard('address', { phonePrimary: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Téléphone secondaire</label>
          <input type="tel" className="form-control" value={wizard.address.phoneSecondary} onChange={(e) => updateWizard('address', { phoneSecondary: e.target.value })} />
        </div>
      </div>
    </div>
  );

  // ─── Rendu du step 1 : Membres ───────────────────────────────────────────────
  const renderStep1 = () => {
    const existingStudents = familyDetails?.students || [];
    return (
      <div>
        <h3 style={{ marginBottom: 16 }}>Membres de la famille</h3>

        {existingStudents.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 8, color: '#374151' }}>Élèves existants de la famille</h4>
            <div style={{ display: 'grid', gap: 8 }}>
              {existingStudents.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#F9FAFB' }}>
                  <div>
                    <strong>{s.firstName} {s.lastName}</strong>
                    <span style={{ marginLeft: 10, color: '#6B7280', fontSize: 13 }}>{s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : ''}</span>
                    <span style={{ marginLeft: 8, color: '#6B7280', fontSize: 12 }}>({s.gender === 'FILLE' ? 'Fille' : 'Garçon'})</span>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => addExistingStudent(s)}>+ Ajouter</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, background: '#fff', marginBottom: 16 }}>
          <h4 style={{ marginBottom: 10, color: '#374151' }}>Ajouter un nouveau membre</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
            <input className="form-control" placeholder="Nom *" value={memberForm.lastName} onChange={(e) => setMemberForm((p) => ({ ...p, lastName: e.target.value }))} />
            <input className="form-control" placeholder="Prénom *" value={memberForm.firstName} onChange={(e) => setMemberForm((p) => ({ ...p, firstName: e.target.value }))} />
            <input type="date" className="form-control" value={memberForm.dateOfBirth} onChange={(e) => setMemberForm((p) => ({ ...p, dateOfBirth: e.target.value }))} />
            <select className="form-control" value={memberForm.gender} onChange={(e) => setMemberForm((p) => ({ ...p, gender: e.target.value }))}>
              <option value="GARCON">Garçon</option>
              <option value="FILLE">Fille</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={memberForm.isOldStudent} onChange={(e) => setMemberForm((p) => ({ ...p, isOldStudent: e.target.checked }))} />
              Ancien élève
            </label>
            <button className="btn btn-primary btn-sm" onClick={addOrUpdateMember}>
              {editingMemberIndex !== null ? 'Mettre à jour' : 'Ajouter'}
            </button>
            {editingMemberIndex !== null && (
              <button className="btn btn-outline btn-sm" onClick={() => { setMemberForm(emptyMember); setEditingMemberIndex(null); }}>Annuler</button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {wizard.members.map((m, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#F9FAFB' }}>
              <div>
                <strong>{m.firstName} {m.lastName}</strong>
                <span style={{ marginLeft: 10, color: '#6B7280', fontSize: 13 }}>{m.dateOfBirth}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: m.isOldStudent ? '#0369A1' : '#6B7280' }}>{m.isOldStudent ? 'Ancien élève' : 'Nouvel élève'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-outline btn-sm" onClick={() => { setMemberForm(m); setEditingMemberIndex(idx); }}>Modifier</button>
                <button className="btn btn-danger btn-sm" onClick={() => removeMember(idx)}>Supprimer</button>
              </div>
            </div>
          ))}
          {wizard.members.length === 0 && (
            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: 16 }}>Aucun membre ajouté — utilisez le formulaire ci-dessus ou ajoutez un élève existant.</p>
          )}
        </div>
      </div>
    );
  };

  // ─── Rendu du step 2 : Cours ─────────────────────────────────────────────────
  const renderStep2 = () => (
    <div>
      <h3 style={{ marginBottom: 16 }}>Inscription aux cours</h3>
      {loadingClasses ? <p>Chargement des cours...</p> : wizard.members.map((member, memberIndex) => {
        const isOldStudent = Boolean(member.isOldStudent);
        const memberAge = getAgeFromDate(member.dateOfBirth);

        return (
          <div key={memberIndex} style={{ marginBottom: 20, border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>{member.firstName} {member.lastName}</h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, margin: 0 }}>
                <input type="checkbox" checked={isOldStudent} onChange={(e) => {
                  const checked = e.target.checked;
                  setWizard((prev) => ({
                    ...prev,
                    members: prev.members.map((m, i) => i === memberIndex ? { ...m, isOldStudent: checked } : m),
                    courseSelections: checked ? prev.courseSelections : prev.courseSelections.filter((s) => s.memberIndex !== memberIndex),
                  }));
                }} />
                Ancien élève
              </label>
            </div>

            {/* Classe scolaire — toujours visible, utile pour soutien scolaire */}
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10 }}>
              <label style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', margin: 0 }}>Classe scolaire</label>
              <select
                value={schoolGradeByMember[memberIndex] || ''}
                onChange={(e) => setSchoolGradeByMember((prev) => ({ ...prev, [memberIndex]: e.target.value }))}
                style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff', minWidth: 160 }}
              >
                <option value="">— Sélectionner —</option>
                {SCHOOL_GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>Requis pour le soutien scolaire</span>
            </div>

            {/* Nouveau élève : sélection par pôle/niveau */}
            {!isOldStudent && poles.length > 0 && (
              <div style={{ display: 'grid', gap: 14 }}>
                {poles.map((pole) => {
                  if (sciencePole && coranPole && pole.id === sciencePole.id) return null;
                  const isArabic = normStr(pole.name).includes('arabe');
                  const isCoran = normStr(pole.name).includes('coran');
                  const isSoutien = normStr(pole.name).includes('soutien');

                  if (isArabic) {
                    const sel = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.poleId === pole.id && !s.classId && !s.levelId);
                    return (
                      <div key={pole.id} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 700, color: '#1D4ED8' }}>{pole.name}</div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                            <input type="checkbox" checked={sel} onChange={() => {
                              setWizard((prev) => {
                                const exists = prev.courseSelections.some((s) => s.memberIndex === memberIndex && s.poleId === pole.id && !s.classId && !s.levelId);
                                return {
                                  ...prev,
                                  courseSelections: exists
                                    ? prev.courseSelections.filter((s) => !(s.memberIndex === memberIndex && s.poleId === pole.id && !s.classId && !s.levelId))
                                    : [...prev.courseSelections, { memberIndex, poleId: pole.id }],
                                };
                              });
                            }} />
                            Sélectionner
                          </label>
                        </div>
                      </div>
                    );
                  }

                  if (isCoran) {
                    const scienceLevels = (sciencePole?.levels || []).map((l) => ({ ...l, poleId: sciencePole.id }));
                    const coranLevels = (pole.levels || []).map((l) => ({ ...l, poleId: pole.id }));
                    const merged = [...coranLevels, ...scienceLevels].filter((l) => isLevelAllowedForAge(l, memberAge));
                    return (
                      <div key={pole.id} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 700, color: '#1D4ED8', marginBottom: 10 }}>{pole.name} & Sciences islamiques</div>
                        {merged.map((level) => {
                          const sel = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.levelId === level.id);
                          return (
                            <label key={level.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, border: `1px solid ${sel ? '#2563EB' : '#E5E7EB'}`, background: sel ? '#EFF6FF' : '#fff', marginBottom: 6, cursor: 'pointer' }}>
                              <span style={{ fontWeight: sel ? 700 : 400 }}>{level.name}</span>
                              <input type="checkbox" checked={sel} onChange={() => toggleLevelSelection(memberIndex, level.poleId, level.id)} />
                            </label>
                          );
                        })}
                        {merged.length === 0 && <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun niveau disponible.</p>}
                      </div>
                    );
                  }

                  if (isSoutien) {
                    const grade = schoolGradeByMember[memberIndex] || '';
                    const matching = (pole.levels || []).filter((l) => matchSoutienLevel(l.name, grade, member.gender));
                    return (
                      <div key={pole.id} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 700, color: '#1D4ED8', marginBottom: 10 }}>{pole.name}</div>
                        {!grade ? (
                          <div style={{ padding: 10, borderRadius: 8, background: '#FEF3C7', border: '1px solid #FBBF24', color: '#92400E', fontSize: 13 }}>Sélectionnez la classe scolaire (ci-dessus) pour afficher les cours disponibles.</div>
                        ) : matching.length === 0 ? (
                          <div style={{ padding: 10, borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13 }}>Aucun cours disponible pour ce niveau.</div>
                        ) : matching.map((level) => {
                          const sel = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.levelId === level.id);
                          return (
                            <label key={level.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, border: `1px solid ${sel ? '#2563EB' : '#E5E7EB'}`, background: sel ? '#EFF6FF' : '#fff', marginBottom: 6, cursor: 'pointer' }}>
                              <span style={{ fontWeight: sel ? 700 : 400 }}>{level.name}</span>
                              <input type="checkbox" checked={sel} onChange={() => toggleLevelSelection(memberIndex, pole.id, level.id)} />
                            </label>
                          );
                        })}
                      </div>
                    );
                  }

                  // Pôle standard
                  const levelList = (pole.levels || []).filter((l) => isLevelAllowedForAge(l, memberAge));
                  return (
                    <div key={pole.id} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 700, color: '#1D4ED8', marginBottom: 10 }}>{pole.name}</div>
                      {levelList.map((level) => {
                        const sel = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.levelId === level.id);
                        return (
                          <label key={level.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, border: `1px solid ${sel ? '#2563EB' : '#E5E7EB'}`, background: sel ? '#EFF6FF' : '#fff', marginBottom: 6, cursor: 'pointer' }}>
                            <span style={{ fontWeight: sel ? 700 : 400 }}>{level.name}</span>
                            <input type="checkbox" checked={sel} onChange={() => toggleLevelSelection(memberIndex, pole.id, level.id)} />
                          </label>
                        );
                      })}
                      {levelList.length === 0 && <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun niveau disponible pour cet âge.</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ancien élève : sélection de classes */}
            {isOldStudent && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Pôle</label>
                    <select value={courseFilterPoleId} onChange={(e) => setCourseFilterPoleId(e.target.value)} style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', background: '#F8FAFC', fontSize: 13 }}>
                      <option value="">Tous les pôles</option>
                      {poles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Jour</label>
                    <select value={courseFilterDay} onChange={(e) => setCourseFilterDay(e.target.value)} style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', background: '#F8FAFC', fontSize: 13 }}>
                      <option value="">Tous les jours</option>
                      {WEEK_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {classesGroupedByPole.map((group) => {
                  const isSoutien = normStr(group.poleName).includes('soutien');
                  const grade = schoolGradeByMember[memberIndex] || '';
                  const filteredClasses = group.classes.filter((cls) => {
                    if (!isClassAllowedForAge(cls, memberAge)) return false;
                    if (courseFilterPoleId && group.poleId !== courseFilterPoleId) return false;
                    if (courseFilterDay) {
                      const slots = cls.classTimeSlots?.map((c) => c.timeSlot) || [];
                      const days = slots.length > 0 ? slots.map((s) => s.dayOfWeek) : [cls.dayOfWeek];
                      if (!days.includes(courseFilterDay)) return false;
                    }
                    if (cls.genre === 'Masculin' && member.gender !== 'GARCON') return false;
                    if (cls.genre === 'Feminin' && member.gender !== 'FILLE') return false;
                    if (isSoutien) {
                      if (!grade) return false;
                      if (!matchSoutienLevel(cls.level?.name, grade, member.gender)) return false;
                    }
                    return true;
                  });
                  if (filteredClasses.length === 0 && !isSoutien) return null;

                  return (
                    <div key={group.poleId} style={{ marginBottom: 16, border: '1px solid #E5E7EB', borderRadius: 12, padding: 14 }}>
                      <div style={{ fontWeight: 700, color: '#1D4ED8', marginBottom: 10 }}>{group.poleName}</div>

                      {filteredClasses.length === 0 ? (
                        <p style={{ color: '#9CA3AF', fontSize: 13 }}>{isSoutien ? "Sélectionnez la classe scolaire (ci-dessus) pour afficher les cours." : 'Aucun cours disponible.'}</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                          {filteredClasses.map((cls) => {
                            const sel = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.classId === cls.id);
                            const full = cls.status === 'FULL';
                            const slots = cls.classTimeSlots?.map((c) => c.timeSlot) || [];
                            return (
                              <label key={cls.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 12, borderRadius: 10, border: `1px solid ${sel ? '#2563EB' : full ? '#F87171' : '#E5E7EB'}`, background: sel ? '#EFF6FF' : full ? '#FEF2F2' : '#fff', cursor: 'pointer', minHeight: 100 }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{cls.level?.name || cls.pole?.name || 'Cours'}</div>
                                  {slots.length > 0
                                    ? slots.map((s, i) => <div key={i} style={{ fontSize: 12, color: '#475569' }}>{s.dayOfWeek} {s.startTime}–{s.endTime}</div>)
                                    : <div style={{ fontSize: 12, color: '#475569' }}>{cls.dayOfWeek} {cls.startTime}–{cls.endTime}</div>
                                  }
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                  <span style={{ fontSize: 12, color: full ? '#B91C1C' : '#374151' }}>{full ? "Liste d'attente" : `${cls.enrolledCount}/${cls.capacity}`}</span>
                                  <input type="checkbox" checked={sel} onChange={() => toggleCourseSelection(memberIndex, cls.id)} />
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ─── Rendu du step 3 : Fiche sanitaire ───────────────────────────────────────
  const renderStep3 = () => (
    <div>
      <h3 style={{ marginBottom: 16 }}>Fiche sanitaire</h3>
      {wizard.members.length === 0 ? <p>Aucun membre — revenez à l'étape 2.</p> : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {wizard.members.map((m, idx) => (
              <button key={idx} type="button" className={`btn btn-sm ${idx === activeHealthMember ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveHealthMember(idx)}>
                {m.firstName} {m.lastName}
              </button>
            ))}
          </div>

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
                <textarea className="form-control" rows={2} placeholder="Précisez..." value={activeHealthForm[detail] || ''} onChange={(e) => updateActiveHealthForm({ [detail]: e.target.value })} />
              )}
            </div>
          ))}

          <div className="form-group"><label>Informations complémentaires</label><textarea className="form-control" rows={2} value={activeHealthForm.otherUsefulHealthInfo || ''} onChange={(e) => updateActiveHealthForm({ otherUsefulHealthInfo: e.target.value })} /></div>

          <h4 style={{ marginTop: 16 }}>Contacts d'urgence</h4>
          {(activeHealthForm.emergencyContacts || []).map((c, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
              <input className="form-control" placeholder="Nom" value={c.lastName || ''} onChange={(e) => updateCollectionRow('emergencyContacts', idx, { lastName: e.target.value })} />
              <input className="form-control" placeholder="Prénom" value={c.firstName || ''} onChange={(e) => updateCollectionRow('emergencyContacts', idx, { firstName: e.target.value })} />
              <input className="form-control" placeholder="Lien" value={c.relationship || ''} onChange={(e) => updateCollectionRow('emergencyContacts', idx, { relationship: e.target.value })} />
              <input className="form-control" placeholder="Téléphone" value={c.phone || ''} onChange={(e) => updateCollectionRow('emergencyContacts', idx, { phone: e.target.value })} />
              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeCollectionRow('emergencyContacts', idx)}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => addCollectionRow('emergencyContacts', { firstName: '', lastName: '', relationship: '', phone: '' })}>+ Contact</button>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Sortie seule après le cours ?</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label><input type="radio" checked={activeHealthForm.canLeaveAloneAfterClass === true} onChange={() => updateActiveHealthForm({ canLeaveAloneAfterClass: true })} /> Oui</label>
              <label><input type="radio" checked={activeHealthForm.canLeaveAloneAfterClass === false} onChange={() => updateActiveHealthForm({ canLeaveAloneAfterClass: false })} /> Non</label>
            </div>
          </div>

          {activeHealthForm.canLeaveAloneAfterClass === false && (
            <>
              <h4>Personnes autorisées à récupérer l'enfant</h4>
              {(activeHealthForm.pickupAuthorizedPersons || []).map((p, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                  <input className="form-control" placeholder="Nom complet" value={p.fullName || ''} onChange={(e) => updateCollectionRow('pickupAuthorizedPersons', idx, { fullName: e.target.value })} />
                  <input className="form-control" placeholder="Lien" value={p.relationship || ''} onChange={(e) => updateCollectionRow('pickupAuthorizedPersons', idx, { relationship: e.target.value })} />
                  <input className="form-control" placeholder="Téléphone" value={p.phone || ''} onChange={(e) => updateCollectionRow('pickupAuthorizedPersons', idx, { phone: e.target.value })} />
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeCollectionRow('pickupAuthorizedPersons', idx)}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => addCollectionRow('pickupAuthorizedPersons', { fullName: '', relationship: '', phone: '' })}>+ Personne</button>
            </>
          )}

          <div className="form-group" style={{ marginTop: 14 }}>
            <label>
              <input type="checkbox" checked={activeHealthForm.emergencyAuthorizationAccepted || false} onChange={(e) => updateActiveHealthForm({ emergencyAuthorizationAccepted: e.target.checked })} />
              {' '}J'autorise les interventions d'urgence si nécessaire
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginTop: 8 }}>
            <input className="form-control" placeholder="Nom du représentant légal" value={activeHealthForm.legalRepresentativeFullName || ''} onChange={(e) => updateActiveHealthForm({ legalRepresentativeFullName: e.target.value })} />
            <input className="form-control" placeholder="Ville" value={activeHealthForm.citySigned || ''} onChange={(e) => updateActiveHealthForm({ citySigned: e.target.value })} />
            <input type="date" className="form-control" value={activeHealthForm.signedAt || ''} onChange={(e) => updateActiveHealthForm({ signedAt: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );

  // ─── Rendu du step 4 : Engagement ────────────────────────────────────────────
  const renderStep4 = () => (
    <div>
      <h3 style={{ marginBottom: 16 }}>Décharge & engagement</h3>
      <div className="card" style={{ background: '#FFF7ED', border: '1px solid #FDBA74', marginBottom: 16 }}>
        <strong>Conditions principales :</strong>
        <ul style={{ marginTop: 8 }}>{engagementBulletPoints.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>

      <div className="form-group">
        <label><input type="checkbox" checked={wizard.engagement.readAndApproved} onChange={(e) => updateWizard('engagement', { readAndApproved: e.target.checked })} /> J'ai lu l'engagement complet</label>
      </div>
      <div className="form-group">
        <label><input type="checkbox" checked={wizard.engagement.legalMentionAccepted} onChange={(e) => updateWizard('engagement', { legalMentionAccepted: e.target.checked })} /> Mention «Lu et approuvé» confirmée</label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginTop: 12 }}>
        <input className="form-control" placeholder="Nom et prénom signataire" value={wizard.engagement.signedByFullName} onChange={(e) => updateWizard('engagement', { signedByFullName: e.target.value })} />
        <input className="form-control" placeholder="Lieu" value={wizard.engagement.citySigned} onChange={(e) => updateWizard('engagement', { citySigned: e.target.value })} />
        <input type="date" className="form-control" value={wizard.engagement.signedAt} onChange={(e) => updateWizard('engagement', { signedAt: e.target.value })} />
      </div>
    </div>
  );

  // ─── Rendu du step 5 : Paiement ──────────────────────────────────────────────
  const renderStep5 = () => {
    const p = wizard.payment;
    const isSepa = p.method === 'PRELEVEMENT_BANCAIRE';
    const isCheque = p.method === 'CHEQUE';

    return (
      <div>
        <h3 style={{ marginBottom: 16 }}>Paiement & confirmation</h3>

        {selectedEnrollmentsLabel.length > 0 && (
          <div className="card" style={{ background: '#F8FAFC', marginBottom: 14 }}>
            <strong>Récapitulatif des inscriptions</strong>
            <ul style={{ marginTop: 8 }}>{selectedEnrollmentsLabel.map((line) => <li key={line}>{line}</li>)}</ul>
            {pricingPreview && (
              <div style={{ marginTop: 10, fontWeight: 700 }}>
                Total estimé : {Number(pricingPreview.total + (isSepa ? (pricingPreview.fraisPrelevement || 0) : 0)).toFixed(2)} €
              </div>
            )}
            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={refreshPricing}>Recalculer</button>
          </div>
        )}

        <div className="form-group">
          <label>Mode de paiement *</label>
          <select className="form-control" value={p.method} onChange={(e) => updateWizard('payment', { method: e.target.value })}>
            <option value="" disabled>-- Sélectionner --</option>
            <option value="ESPECES">Espèces (au secrétariat)</option>
            <option value="CHEQUE">Chèque(s)</option>
            <option value="PRELEVEMENT_BANCAIRE">Prélèvement bancaire</option>
          </select>
        </div>

        {isSepa && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Nombre d'échéances</label>
                <input type="number" min={1} max={8} className="form-control" value={p.installmentsCount} onChange={(e) => updateWizard('payment', { installmentsCount: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Jour de prélèvement</label>
                <select className="form-control" value={p.scheduleDay} onChange={(e) => updateWizard('payment', { scheduleDay: Number(e.target.value) })}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Date première échéance</label>
              <input type="date" className="form-control" value={p.firstPaymentDate} onChange={(e) => updateWizard('payment', { firstPaymentDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>IBAN *</label>
              <input className="form-control" value={p.bankDebitIban} onChange={(e) => updateWizard('payment', { bankDebitIban: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="FR76..." />
            </div>
            <div className="form-group">
              <label>BIC/SWIFT *</label>
              <input className="form-control" value={p.bankDebitSwift} onChange={(e) => updateWizard('payment', { bankDebitSwift: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="BNPAFRPP..." />
            </div>
            <div className="form-group">
              <label>RIB (fichier)</label>
              <input type="file" accept=".pdf,image/*" className="form-control" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => updateWizard('payment', { ribDocument: { name: file.name, base64: reader.result } });
                reader.readAsDataURL(file);
              }} />
              {p.ribDocument?.name && <div style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>✓ {p.ribDocument.name}</div>}
            </div>
          </>
        )}

        {isCheque && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Nombre de chèques</label>
                <input type="number" min={1} max={10} className="form-control" value={p.installmentsCount} onChange={(e) => updateWizard('payment', { installmentsCount: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Jour de dépôt</label>
                <select className="form-control" value={p.scheduleDay} onChange={(e) => updateWizard('payment', { scheduleDay: Number(e.target.value) })}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Date du premier chèque</label>
              <input type="date" className="form-control" value={p.firstPaymentDate} onChange={(e) => updateWizard('payment', { firstPaymentDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>
                <input type="checkbox" checked={p.chequeInstructionsAccepted} onChange={(e) => updateWizard('payment', { chequeInstructionsAccepted: e.target.checked })} />
                {' '}J'ai pris connaissance des instructions de remise des chèques
              </label>
            </div>
          </>
        )}
      </div>
    );
  };

  // ─── Layout principal ─────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 0' }}>
      <div style={{ background: '#F8FAFC', width: 'min(1000px, 95vw)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', marginBottom: 20 }}>

        {/* Entête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #E5E7EB' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--amc-primary)' }}>
              {isNewFamily ? 'Nouvelle inscription — Nouvelle famille' : `Nouvelle inscription — ${family?.familyName || 'Famille'}`}
            </h3>
            <div style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>Étape {step + 1}/{STEP_LABELS.length} — {STEP_LABELS[step]}</div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>✕ Fermer</button>
        </div>

        {/* Barre de progression */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STEP_LABELS.length}, 1fr)`, padding: '14px 24px', borderBottom: '1px solid #E5E7EB', gap: 4 }}>
          {STEP_LABELS.map((label, idx) => (
            <div key={label} style={{ textAlign: 'center', cursor: idx < step ? 'pointer' : 'default' }} onClick={() => { if (idx < step) setStep(idx); }}>
              <div style={{ width: 28, height: 28, margin: '0 auto 4px', borderRadius: '50%', background: idx < step ? '#16A34A' : idx === step ? 'var(--amc-primary)' : '#E5E7EB', color: idx <= step ? '#fff' : '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                {idx < step ? '✓' : idx + 1}
              </div>
              <div style={{ fontSize: 11, color: idx <= step ? 'var(--amc-primary)' : '#9CA3AF' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Contenu de l'étape */}
        <div style={{ padding: 24 }}>
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: '1px solid #E5E7EB' }}>
          <button type="button" className="btn btn-outline" onClick={step === 0 ? onClose : prev}>
            {step === 0 ? 'Annuler' : '← Précédent'}
          </button>
          {step < 5 ? (
            <button type="button" className="btn btn-primary" onClick={next}>Suivant →</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Enregistrement...' : 'Valider l\'inscription'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
