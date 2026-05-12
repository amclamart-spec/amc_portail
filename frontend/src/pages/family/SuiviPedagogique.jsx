import { useEffect, useState } from 'react';
import api from '../../api/axios';

export default function FamilyPedagogy() {
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [section, setSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [error, setError] = useState('');
  const [absences, setAbsences] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      try {
        const { data } = await api.get('/family/pedagogy/students');
        const fetchedStudents = data.students || [];
        setStudents(fetchedStudents);
        if (fetchedStudents.length > 0) {
          setSelectedStudentId(fetchedStudents[0].id);
        }
      } catch (err) {
        setError('Impossible de charger vos élèves.');
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  const handleSection = async (targetSection) => {
    if (!selectedStudentId) return;
    setSectionLoading(true);
    setError('');

    try {
      if (targetSection === 'absences') {
        const { data } = await api.get('/family/pedagogy/absences', { params: { studentId: selectedStudentId } });
        setAbsences(data.absences || []);
      }
      if (targetSection === 'homework') {
        const { data } = await api.get('/family/pedagogy/homework', { params: { studentId: selectedStudentId } });
        setHomeworks(data.homeworks || []);
      }
      if (targetSection === 'notes') {
        const { data } = await api.get('/family/pedagogy/notes', { params: { studentId: selectedStudentId } });
        setNotes(data.notes || []);
      }
      setSection(targetSection);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du chargement des informations.');
    } finally {
      setSectionLoading(false);
    }
  };

  const formatStudentName = (student) => `${student.firstName || ''} ${student.lastName || ''}`.trim();
  const selectedStudent = students.find((student) => student.id === selectedStudentId);

  if (loading) {
    return <p>Chargement...</p>;
  }

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 24 }}>Suivi pédagogique</h2>

      {students.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p>Aucun enfant n'est associé à votre compte. Ajoutez un enfant dans l'espace « Mes enfants » pour accéder au suivi pédagogique.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="form-group" style={{ maxWidth: 360 }}>
              <label>Choisissez un élève</label>
              <select
                className="form-control"
                style={{ width: '100%' }}
                value={selectedStudentId}
                onChange={(event) => {
                  setSelectedStudentId(event.target.value);
                  setSection('');
                }}
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {formatStudentName(student) || 'Élève sans nom'}
                  </option>
                ))}
              </select>
            </div>

            {selectedStudent && selectedStudent.enrollments?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong>Inscriptions actives :</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {selectedStudent.enrollments.map((enrollment) => (
                    <span key={enrollment.id} className="badge badge-info">
                      {enrollment.classLabel || 'Classe inconnue'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className={`btn ${section === 'absences' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleSection('absences')}
                disabled={!selectedStudentId || sectionLoading}
              >
                Voir les absences
              </button>
              <button
                className={`btn ${section === 'homework' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleSection('homework')}
                disabled={!selectedStudentId || sectionLoading}
              >
                Voir les devoirs
              </button>
              <button
                className={`btn ${section === 'notes' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleSection('notes')}
                disabled={!selectedStudentId || sectionLoading}
              >
                Voir les notes
              </button>
            </div>
          </div>

          {error && (
            <div className="card" style={{ background: '#FEF3C7', color: '#92400E', marginBottom: 20 }}>
              {error}
            </div>
          )}

          {sectionLoading && <p>Chargement...</p>}

          {!sectionLoading && section === 'absences' && (
            <div className="card">
              <div className="card-header">
                <h3>Absences</h3>
              </div>
              {absences.length === 0 ? (
                <p style={{ padding: 20 }}>Aucune absence enregistrée pour cet élève.</p>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {absences.map((absence) => (
                    <div key={absence.id} className="card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <strong>{absence.lessonTitle || 'Leçon inconnue'}</strong>
                        <span>{absence.date ? new Date(absence.date).toLocaleDateString('fr-FR') : 'Date inconnue'}</span>
                      </div>
                      <div style={{ marginTop: 8, color: '#6B7280' }}>{absence.classLabel}</div>
                      {absence.justification && <div style={{ marginTop: 8 }}><strong>Justification :</strong> {absence.justification}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!sectionLoading && section === 'homework' && (
            <div className="card">
              <div className="card-header">
                <h3>Devoirs</h3>
              </div>
              {homeworks.length === 0 ? (
                <p style={{ padding: 20 }}>Aucun message de devoirs disponible pour cet élève pour le moment.</p>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {homeworks.map((homework) => (
                    <div key={homework.id} className="card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <strong>{homework.classLabel || 'Classe inconnue'}</strong>
                        <span>{homework.date ? new Date(homework.date).toLocaleDateString('fr-FR') : 'Date inconnue'}</span>
                      </div>
                      <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{homework.body}</p>
                      {homework.attachmentUrl && (
                        <a 
                          href={homework.attachmentUrl} 
                          download={homework.attachmentFilename || 'piece-jointe'}
                          className="btn btn-outline btn-sm"
                          style={{ marginTop: 12, display: 'inline-block' }}
                        >
                          📥 Télécharger la pièce jointe{homework.attachmentFilename ? ` (${homework.attachmentFilename})` : ''}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!sectionLoading && section === 'notes' && (
            <div className="card">
              <div className="card-header">
                <h3>Notes et appréciations</h3>
              </div>
              {notes.length === 0 ? (
                <p style={{ padding: 20 }}>Aucune note disponible pour cet élève pour le moment.</p>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {notes.map((note) => (
                    <div key={note.id} className="card" style={{ padding: 16, background: '#F9FAFB', borderLeft: '4px solid var(--amc-primary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        <div>
                          <strong style={{ color: 'var(--amc-primary)' }}>{note.lessonTitle || 'Leçon inconnue'}</strong>
                          <div style={{ marginTop: 4, fontSize: '0.9em', color: '#6B7280' }}>{note.classLabel || 'Classe inconnue'}</div>
                        </div>
                        <span style={{ fontSize: '0.85em', color: '#9CA3AF' }}>{note.date ? new Date(note.date).toLocaleDateString('fr-FR') : 'Date inconnue'}</span>
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', alignItems: 'center' }}>
                        {note.grade !== null && note.grade !== undefined && (
                          <>
                            <strong>Note :</strong>
                            <div style={{ background: 'white', padding: '6px 12px', borderRadius: 4, textAlign: 'center', fontWeight: 'bold', color: 'var(--amc-primary)', minWidth: 50 }}>
                              {note.grade} / 10
                            </div>
                          </>
                        )}
                      </div>
                      {note.appreciation && (
                        <div style={{ marginTop: 12, padding: '12px', background: 'white', borderRadius: 4, fontStyle: 'italic', color: '#374151' }}>
                          <strong>Appréciation :</strong>
                          <p style={{ margin: '6px 0 0 0' }}>{note.appreciation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
