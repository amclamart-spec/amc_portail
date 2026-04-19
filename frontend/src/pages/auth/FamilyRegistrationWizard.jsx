import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const STORAGE_KEY = 'amc_family_wizard_draft_v1';

const engagementBulletPoints = [
  'Les élèves de moins de 11 ans doivent être accompagnés et récupérés par le responsable légal.',
  'Les familles s’engagent à respecter ponctualité, assiduité et suivi pédagogique à domicile.',
  'Tout changement de personne autorisée à récupérer l’enfant doit être signalé par écrit.',
  'AMC est déchargée de responsabilité dès récupération de l’enfant devant sa salle.',
  'Le stationnement dangereux ou gênant aux abords du centre est strictement interdit.',
];

const emptyMember = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: 'GARCON',
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

function getDefaultState(prefill = {}) {
  return {
    draftId: null,
    account: {
      firstName: prefill.firstName || '',
      lastName: prefill.lastName || '',
      email: prefill.email || '',
      phone: prefill.phone || '',
      password: prefill.password || '',
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
      method: 'STRIPE_CARD',
      installmentsCount: 1,
      scheduleDay: 10,
      chequeInstructionsAccepted: false,
    },
  };
}

export default function FamilyRegistrationWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = location.state?.prefill || {};

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [allClasses, setAllClasses] = useState([]);
  const [poles, setPoles] = useState([]);
  const [pricingPreview, setPricingPreview] = useState(null);
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [editingMemberIndex, setEditingMemberIndex] = useState(null);
  const [activeHealthMember, setActiveHealthMember] = useState(0);

  const [wizard, setWizard] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
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

  const steps = [
    'Adresse & Téléphones',
    'Membres famille',
    'Cours & tarifs',
    'Fiche sanitaire',
    'Engagement',
    'Paiement',
  ];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wizard));
  }, [wizard]);

  useEffect(() => {
    api.get('/enrollments/poles').then(({ data }) => setPoles(data.poles || [])).catch(() => {});
    setLoadingClasses(true);
    api.get('/enrollments/classes')
      .then(({ data }) => setAllClasses(data.classes || []))
      .catch(() => toast.error('Impossible de charger les créneaux'))
      .finally(() => setLoadingClasses(false));
  }, []);

  const selectedEnrollmentsLabel = useMemo(() => {
    return wizard.courseSelections.map((selection) => {
      const member = wizard.members[selection.memberIndex];
      const cls = allClasses.find((c) => c.id === selection.classId);
      if (!member || !cls) return null;
      return `${member.firstName} ${member.lastName} — ${cls.level?.pole?.name || ''} / ${cls.level?.name || ''} (${cls.dayOfWeek} ${cls.startTime}-${cls.endTime})`;
    }).filter(Boolean);
  }, [wizard.courseSelections, wizard.members, allClasses]);

  const persistDraft = async (nextStep = step) => {
    if (!wizard.account.email) return;
    try {
      const { data } = await api.post('/family-wizard/draft', {
        email: wizard.account.email,
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

  const updateWizard = (path, value) => {
    setWizard((prev) => ({
      ...prev,
      [path]: {
        ...prev[path],
        ...value,
      },
    }));
  };

  const validateStep = () => {
    if (step === 1) {
      const a = wizard.address;
      if (!a.addressLine1 || !a.postalCode || !a.city || !a.country || !a.phonePrimary) {
        toast.error('Veuillez compléter adresse, pays et téléphone principal');
        return false;
      }
    }

    if (step === 2) {
      if (wizard.members.length === 0) {
        toast.error('Ajoutez au moins un membre de la famille');
        return false;
      }
    }

    if (step === 3) {
      if (wizard.courseSelections.length === 0) {
        toast.error('Veuillez sélectionner au moins un cours');
        return false;
      }
    }

    if (step === 4) {
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

    if (step === 5) {
      const e = wizard.engagement;
      if (!e.readAndApproved || !e.legalMentionAccepted || !e.signedByFullName || !e.citySigned || !e.signedAt) {
        toast.error('Veuillez compléter l’engagement (lu/approuvé, nom, lieu, date)');
        return false;
      }
    }

    if (step === 6) {
      const p = wizard.payment;
      if (p.method === 'GO_CARDLESS_SEPA' && ![10, 20, 30].includes(Number(p.scheduleDay))) {
        toast.error('Jour SEPA invalide (10/20/30)');
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
    if (!validateStep()) return;
    const target = Math.min(step + 1, 6);
    setStep(target);
    await persistDraft(target);

    if (step === 3) {
      await refreshPricing();
    }
  };

  const prev = async () => {
    const target = Math.max(step - 1, 1);
    setStep(target);
    await persistDraft(target);
  };

  const refreshPricing = async () => {
    try {
      const { data } = await api.post('/family-wizard/pricing-preview', {
        courseSelections: wizard.courseSelections,
      });
      setPricingPreview(data.pricing);
    } catch {
      toast.error('Impossible de calculer le tarif pour le moment');
    }
  };

  const submitFinal = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      const payload = {
        ...wizard,
        account: {
          ...wizard.account,
          profile: 'FAMILLE',
        },
      };

      const { data } = await api.post('/family-wizard/complete', payload);
      localStorage.removeItem(STORAGE_KEY);
      toast.success('Inscription famille finalisée ✅');

      if (data?.payment?.checkout?.checkoutUrl) {
        window.location.href = data.payment.checkout.checkoutUrl;
        return;
      }

      navigate('/login');
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
        if (!healthForms[idx]) healthForms[idx] = { ...emptyHealthForm };
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

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: 20 }}>
      <div className="card" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ color: 'var(--amc-primary)', marginBottom: 8 }}>Assistant Inscription Famille</h2>
        <p style={{ color: '#64748B', marginBottom: 20 }}>Étape {step}/6 — {steps[step - 1]}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 24 }}>
          {steps.map((label, idx) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{
                width: 30,
                height: 30,
                margin: '0 auto 6px',
                borderRadius: '50%',
                background: idx + 1 <= step ? 'var(--amc-primary)' : '#E2E8F0',
                color: idx + 1 <= step ? '#fff' : '#64748B',
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

        {step === 1 && (
          <div>
            <h3>Adresse et téléphones</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Nom de famille *</label>
                <input className="form-control" value={wizard.address.familyName} onChange={(e) => updateWizard('address', { familyName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Téléphone principal *</label>
                <input className="form-control" value={wizard.address.phonePrimary} onChange={(e) => updateWizard('address', { phonePrimary: e.target.value })} />
              </div>
            </div>
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

        {step === 2 && (
          <div>
            <h3>Membres de la famille</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <div className="form-group"><label>Nom *</label><input className="form-control" value={memberForm.lastName} onChange={(e) => setMemberForm((p) => ({ ...p, lastName: e.target.value }))} /></div>
              <div className="form-group"><label>Prénom *</label><input className="form-control" value={memberForm.firstName} onChange={(e) => setMemberForm((p) => ({ ...p, firstName: e.target.value }))} /></div>
              <div className="form-group"><label>Date naissance *</label><input type="date" className="form-control" value={memberForm.dateOfBirth} onChange={(e) => setMemberForm((p) => ({ ...p, dateOfBirth: e.target.value }))} /></div>
              <div className="form-group"><label>Sexe</label><select className="form-control" value={memberForm.gender} onChange={(e) => setMemberForm((p) => ({ ...p, gender: e.target.value }))}><option value="GARCON">Garçon</option><option value="FILLE">Fille</option></select></div>
              <button className="btn btn-primary" onClick={addOrUpdateMember}>{editingMemberIndex !== null ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
              {wizard.members.map((m, idx) => (
                <div key={`${m.firstName}-${idx}`} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><strong>{m.firstName} {m.lastName}</strong> — {m.dateOfBirth}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => { setMemberForm(m); setEditingMemberIndex(idx); }}>Modifier</button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeMember(idx)}>Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3>Inscription aux cours</h3>
            {loadingClasses ? <p>Chargement des créneaux...</p> : (
              <>
                {wizard.members.map((member, memberIndex) => (
                  <div key={`${member.firstName}-${memberIndex}`} style={{ marginBottom: 20 }}>
                    <h4>{member.firstName} {member.lastName}</h4>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {allClasses.map((cls) => {
                        const selected = wizard.courseSelections.some((s) => s.memberIndex === memberIndex && s.classId === cls.id);
                        return (
                          <label key={cls.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                            <span>
                              <strong>{cls.level?.pole?.name || 'Pôle'} / {cls.level?.name || 'Niveau'}</strong>
                              <br />
                              <small>{cls.dayOfWeek} {cls.startTime}-{cls.endTime} • Salle {cls.room || '-'}</small>
                            </span>
                            <input type="checkbox" checked={selected} onChange={() => toggleCourseSelection(memberIndex, cls.id)} />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <button className="btn btn-outline" onClick={refreshPricing}>Recalculer les tarifs</button>

                {pricingPreview && (
                  <div className="card" style={{ marginTop: 16, background: '#EEF2FF' }}>
                    <strong>Récap tarifaire</strong>
                    <div>Frais inscription: {Number(pricingPreview.registrationFee).toFixed(2)} €</div>
                    <div>Arabe ({pricingPreview.arabicCount} élève(s)): {Number(pricingPreview.arabicFee).toFixed(2)} €</div>
                    <div>Coran/Sciences: {Number(pricingPreview.coranScienceFee).toFixed(2)} €</div>
                    <div style={{ marginTop: 8, fontWeight: 700 }}>TOTAL: {Number(pricingPreview.total).toFixed(2)} €</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 4 && (
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

        {step === 5 && (
          <div>
            <h3>Décharge & engagement</h3>
            <div className="card" style={{ background: '#FFF7ED', border: '1px solid #FDBA74' }}>
              <p><strong>Conditions principales :</strong></p>
              <ul>
                {engagementBulletPoints.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p style={{ fontSize: 13, color: '#7C2D12' }}>La signature engage les représentants légaux à respecter les règles de sécurité et de suivi pédagogique AMC.</p>
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

        {step === 6 && (
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
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Mode de paiement</label>
              <select className="form-control" value={wizard.payment.method} onChange={(e) => updateWizard('payment', { method: e.target.value })}>
                <option value="STRIPE_CARD">Carte bancaire (Stripe)</option>
                <option value="GO_CARDLESS_SEPA">Prélèvement SEPA (GoCardless)</option>
                <option value="CHEQUE">Chèque</option>
              </select>
            </div>

            {wizard.payment.method === 'STRIPE_CARD' && (
              <div className="form-group">
                <label>Nombre d'échéances (1, 2, 3, 4, 8)</label>
                <select className="form-control" value={wizard.payment.installmentsCount} onChange={(e) => updateWizard('payment', { installmentsCount: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 8].map((n) => <option key={n} value={n}>{n} fois</option>)}
                </select>
              </div>
            )}

            {wizard.payment.method === 'GO_CARDLESS_SEPA' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label>Mensualités (2 à 8)</label>
                  <select className="form-control" value={wizard.payment.installmentsCount} onChange={(e) => updateWizard('payment', { installmentsCount: Number(e.target.value) })}>
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} mensualités</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Jour de prélèvement</label>
                  <select className="form-control" value={wizard.payment.scheduleDay} onChange={(e) => updateWizard('payment', { scheduleDay: Number(e.target.value) })}>
                    {[10, 20, 30].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            )}

            {wizard.payment.method === 'CHEQUE' && (
              <>
                <div className="form-group">
                  <label>Nombre de chèques (1 à 8)</label>
                  <select className="form-control" value={wizard.payment.installmentsCount} onChange={(e) => updateWizard('payment', { installmentsCount: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} chèque(s)</option>)}
                  </select>
                </div>
                <div className="card" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <p><strong>Instructions chèque :</strong></p>
                  <ul>
                    <li>Libeller à l’ordre de l’Association des Musulmans de Clamart.</li>
                    <li>Indiquer au dos le nom de famille et l’année scolaire.</li>
                    <li>Déposer le lot de chèques selon l’échéancier généré.</li>
                  </ul>
                  <label><input type="checkbox" checked={wizard.payment.chequeInstructionsAccepted || false} onChange={(e) => updateWizard('payment', { chequeInstructionsAccepted: e.target.checked })} /> J’ai lu les instructions chèque.</label>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button className="btn btn-outline" onClick={step === 1 ? () => navigate('/register') : prev}>{step === 1 ? 'Retour inscription' : 'Précédent'}</button>
          {step < 6 ? (
            <button className="btn btn-primary" onClick={next}>Suivant</button>
          ) : (
            <button className="btn btn-primary" onClick={submitFinal} disabled={submitting}>{submitting ? 'Validation...' : 'Confirmer & payer'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
