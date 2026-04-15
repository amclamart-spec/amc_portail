import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiArrowRight, FiCheck, FiBookOpen } from 'react-icons/fi';

export default function FamilyEnrollment() {
  const [step, setStep] = useState(0); // 0: select student, 1: pole, 2: level, 3: class, 4: recap
  const [students, setStudents] = useState([]);
  const [poles, setPoles] = useState([]);
  const [classes, setClasses] = useState([]);
  const [summary, setSummary] = useState(null);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedPole, setSelectedPole] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);

  const [loading, setLoading] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  useEffect(() => {
    api.get('/students').then(({ data }) => setStudents(data.students)).catch(console.error);
    api.get('/enrollments/poles').then(({ data }) => setPoles(data.poles)).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedLevel) {
      api.get('/enrollments/classes', { params: { levelId: selectedLevel.id } })
        .then(({ data }) => setClasses(data.classes)).catch(console.error);
    }
  }, [selectedLevel]);

  const handleEnroll = async () => {
    setLoading(true);
    try {
      await api.post('/enrollments', { studentId: selectedStudent.id, classId: selectedClass.id });
      toast.success('Inscription enregistrée avec succès !');
      setEnrolled(true);
      // Refresh summary
      api.get('/enrollments/summary').then(({ data }) => setSummary(data)).catch(console.error);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de l\'inscription');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(0);
    setSelectedStudent(null);
    setSelectedPole(null);
    setSelectedLevel(null);
    setSelectedClass(null);
    setEnrolled(false);
  };

  // Stepper
  const steps = ['\u00c9l\u00e8ve', 'P\u00f4le', 'Niveau', 'Cr\u00e9neau', 'R\u00e9capitulatif'];

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>
        <FiBookOpen style={{ marginRight: 8 }} /> Inscription à un cours
      </h2>

      {/* Stepper */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32, gap: 4, flexWrap: 'wrap' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: i <= step ? 'var(--amc-primary)' : '#E2E8F0',
              color: i <= step ? 'white' : '#6B7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
            }}>
              {i < step ? '\u2713' : i + 1}
            </div>
            <span style={{ margin: '0 8px', fontSize: 13, color: i <= step ? 'var(--amc-primary)' : '#6B7280', fontWeight: i === step ? 700 : 400 }}>
              {s}
            </span>
            {i < steps.length - 1 && <div style={{ width: 30, height: 2, background: i < step ? 'var(--amc-primary)' : '#E2E8F0' }} />}
          </div>
        ))}
      </div>

      {/* Success */}
      {enrolled && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h3 style={{ color: 'var(--amc-primary)', marginBottom: 8 }}>Inscription enregistrée !</h3>
          <p style={{ color: '#6B7280', marginBottom: 24 }}>
            {selectedStudent?.firstName} est inscrit(e) en {selectedLevel?.name} ({selectedClass?.dayOfWeek} {selectedClass?.startTime}-{selectedClass?.endTime})
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={reset}>
              <FiBookOpen /> Inscrire à un autre cours
            </button>
          </div>
        </div>
      )}

      {/* Step 0: Select Student */}
      {!enrolled && step === 0 && (
        <div className="card">
          <div className="card-header"><h3>Étape 1/5 — Choisir un élève</h3></div>
          {students.length === 0 ? (
            <p style={{ color: '#6B7280' }}>Aucun enfant enregistré. Ajoutez d'abord un enfant dans "Mes enfants".</p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {students.map((s) => {
                const age = Math.floor((Date.now() - new Date(s.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                return (
                  <button key={s.id} onClick={() => { setSelectedStudent(s); setStep(1); }} style={{
                    border: '2px solid var(--amc-border)', borderRadius: 8, padding: 16,
                    background: 'var(--amc-white)', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--amc-primary-light)'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--amc-border)'}
                  >
                    <strong>{s.lastName} {s.firstName}</strong>
                    <div style={{ color: '#6B7280', fontSize: 13 }}>{age} ans</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Select Pole */}
      {!enrolled && step === 1 && (
        <div className="card">
          <div className="card-header">
            <h3>Étape 2/5 — Choix du pôle</h3>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(0)}><FiArrowLeft /> Retour</button>
          </div>
          <p style={{ color: '#6B7280', marginBottom: 16 }}>Inscription de <strong>{selectedStudent?.firstName} {selectedStudent?.lastName}</strong></p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {poles.map((p) => (
              <button key={p.id} onClick={() => { setSelectedPole(p); setStep(2); }} style={{
                border: '2px solid var(--amc-border)', borderRadius: 12, padding: 24,
                background: 'var(--amc-white)', cursor: 'pointer', textAlign: 'center',
                transition: 'all 0.2s',
              }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--amc-primary)'; e.currentTarget.style.background = '#EEF2FF'; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--amc-border)'; e.currentTarget.style.background = 'var(--amc-white)'; }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>
                  {p.name.includes('Arabe') ? '📚' : p.name.includes('Coran') ? '📖' : '🌟'}
                </div>
                <strong style={{ color: 'var(--amc-primary)', fontSize: 16 }}>{p.name}</strong>
                <p style={{ color: '#6B7280', fontSize: 13, marginTop: 8 }}>{p.description}</p>
                <p style={{ fontSize: 12, color: '#9CA3AF' }}>{p.levels?.length} niveaux</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Select Level */}
      {!enrolled && step === 2 && (
        <div className="card">
          <div className="card-header">
            <h3>Étape 3/5 — Choix du niveau</h3>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(1)}><FiArrowLeft /> Retour</button>
          </div>
          <p style={{ color: '#6B7280', marginBottom: 16 }}>Pôle : <strong>{selectedPole?.name}</strong></p>
          <div style={{ display: 'grid', gap: 8 }}>
            {selectedPole?.levels?.map((l) => (
              <button key={l.id} onClick={() => { setSelectedLevel(l); setStep(3); }} style={{
                border: '2px solid var(--amc-border)', borderRadius: 8, padding: '14px 20px',
                background: 'var(--amc-white)', cursor: 'pointer', textAlign: 'left',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                transition: 'all 0.2s',
              }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--amc-primary-light)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--amc-border)'}
              >
                <div>
                  <strong>{l.name}</strong>
                  {l.minAge && <span style={{ color: '#F59E0B', fontSize: 13, marginLeft: 8 }}>(âge min: {l.minAge} ans)</span>}
                </div>
                <FiArrowRight color="#9CA3AF" />
              </button>
            ))}
          </div>
          {selectedPole?.name?.includes('Arabe') && (
            <div style={{ background: '#EEF2FF', borderRadius: 8, padding: 12, marginTop: 16, fontSize: 13, color: 'var(--amc-primary)' }}>
              ℹ️ Si vous ne connaissez pas le niveau, un test de positionnement sera proposé lors de la rentrée.
            </div>
          )}
        </div>
      )}

      {/* Step 3: Select Class */}
      {!enrolled && step === 3 && (
        <div className="card">
          <div className="card-header">
            <h3>Étape 4/5 — Choix du créneau</h3>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(2)}><FiArrowLeft /> Retour</button>
          </div>
          <p style={{ color: '#6B7280', marginBottom: 16 }}>
            Niveau : <strong>{selectedLevel?.name}</strong>
          </p>
          {classes.length === 0 ? (
            <p style={{ color: '#6B7280', textAlign: 'center', padding: 20 }}>Aucun créneau disponible pour ce niveau.</p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {classes.map((c) => {
                const pct = c.capacity > 0 ? (c.enrolledCount / c.capacity) * 100 : 100;
                const isFull = c.enrolledCount >= c.capacity || c.status === 'FULL';
                const isAlmostFull = pct >= 90 && !isFull;
                return (
                  <button key={c.id} onClick={() => { if (!isFull) { setSelectedClass(c); setStep(4); } }} disabled={isFull} style={{
                    border: `2px solid ${isFull ? '#FCA5A5' : isAlmostFull ? '#FDE68A' : 'var(--amc-border)'}`,
                    borderRadius: 8, padding: 16, background: isFull ? '#FEF2F2' : 'var(--amc-white)',
                    cursor: isFull ? 'not-allowed' : 'pointer', textAlign: 'left',
                    opacity: isFull ? 0.6 : 1, transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{c.dayOfWeek} {c.startTime} - {c.endTime}</strong>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: isFull ? '#EF4444' : isAlmostFull ? '#F59E0B' : '#22C55E',
                      }}>
                        {isFull ? '🔴 COMPLET' : isAlmostFull ? '🟠 Dernières places !' : '🟢 Places disponibles'}
                      </span>
                    </div>
                    <div style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>
                      Salle : {c.room || 'N/A'} | Professeur : {c.teacherName || 'N/A'} | Places : {c.enrolledCount}/{c.capacity}
                    </div>
                    {/* Progress bar */}
                    <div style={{ marginTop: 8, height: 6, background: '#E2E8F0', borderRadius: 3 }}>
                      <div style={{
                        height: '100%', borderRadius: 3, width: `${pct}%`,
                        background: isFull ? '#EF4444' : isAlmostFull ? '#F59E0B' : '#22C55E',
                      }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Recap */}
      {!enrolled && step === 4 && (
        <div className="card">
          <div className="card-header">
            <h3>Étape 5/5 — Récapitulatif</h3>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(3)}><FiArrowLeft /> Retour</button>
          </div>
          <div style={{ background: 'var(--amc-light-bg-2)', borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'grid', gap: 8, fontSize: 15 }}>
              <div>✓ <strong>Élève :</strong> {selectedStudent?.lastName} {selectedStudent?.firstName}</div>
              <div>✓ <strong>Pôle :</strong> {selectedPole?.name}</div>
              <div>✓ <strong>Niveau :</strong> {selectedLevel?.name}</div>
              <div>✓ <strong>Créneau :</strong> {selectedClass?.dayOfWeek} {selectedClass?.startTime}-{selectedClass?.endTime}</div>
              <div>✓ <strong>Salle :</strong> {selectedClass?.room || 'N/A'}</div>
              <div>✓ <strong>Professeur :</strong> {selectedClass?.teacherName || 'N/A'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-outline" onClick={() => setStep(0)}>Modifier</button>
            <button className="btn btn-primary btn-lg" onClick={handleEnroll} disabled={loading}>
              <FiCheck /> {loading ? 'Inscription...' : 'Confirmer l\'inscription'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
