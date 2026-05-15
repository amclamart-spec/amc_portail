import { useEffect, useMemo, useState } from 'react';
import { FiBookOpen, FiCalendar, FiLoader, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import useEvaluations from '../../hooks/useEvaluations';
import StatsCard from '../../components/suivi/StatsCard';
import EvaluationTable from '../../components/suivi/EvaluationTable';
import ClassOverview from '../../components/suivi/ClassOverview';
import RecentComments from '../../components/suivi/RecentComments';

const MODULES = [
  { key: 'absences', label: 'Absences' },
  { key: 'devoirs', label: 'Devoirs' },
  { key: 'notes', label: 'Notes' },
];

export default function SuiviPedagogique() {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [noteColumns, setNoteColumns] = useState([]);
  const [noteRows, setNoteRows] = useState([]);
  const [classStudents, setClassStudents] = useState([]);
  const [newNoteDiscipline, setNewNoteDiscipline] = useState('');
  const [newNoteGrade, setNewNoteGrade] = useState('');
  const [newNoteStudentId, setNewNoteStudentId] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedClass = classes.find((cls) => String(cls.id) === String(selectedClassId)) || null;
  const classPeriod = selectedClass?.schoolYear?.period;
  const periodOptions = useMemo(() => {
    if (classPeriod === 'TRIMESTRIEL') {
      return [
        { label: 'Trimestre 1', value: 'TRIMESTRE_1' },
        { label: 'Trimestre 2', value: 'TRIMESTRE_2' },
        { label: 'Trimestre 3', value: 'TRIMESTRE_3' },
      ];
    }

    if (classPeriod === 'SEMESTRIEL') {
      return [
        { label: 'Semestre 1', value: 'SEMESTRE_1' },
        { label: 'Semestre 2', value: 'SEMESTRE_2' },
      ];
    }

    return [];
  }, [classPeriod]);
  const [activeModule, setActiveModule] = useState('absences');
  const [homeworkBody, setHomeworkBody] = useState('');
  const [homeworkAttachment, setHomeworkAttachment] = useState(null);
  const [homeworkAttachmentUrl, setHomeworkAttachmentUrl] = useState(null);
  const [homeworkModalOpen, setHomeworkModalOpen] = useState(false);
  const [homeworkModalHomework, setHomeworkModalHomework] = useState(null);
  const [homeworkModalBody, setHomeworkModalBody] = useState('');
  const [homeworkModalAttachment, setHomeworkModalAttachment] = useState(null);
  const [homeworkModalAttachmentUrl, setHomeworkModalAttachmentUrl] = useState(null);
  const [absenceHistoryModalOpen, setAbsenceHistoryModalOpen] = useState(false);
  const [absenceHistoryRows, setAbsenceHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
    : (import.meta.env.DEV ? 'http://localhost:4000' : '');

  const getPhotoSource = (photoUrl) => {
    if (!photoUrl) return null;
    return photoUrl.startsWith('http') ? photoUrl : `${BACKEND_ORIGIN}${photoUrl}`;
  };

  const {
    evaluations,
    stats,
    lessons,
    absenceRoster,
    absenceHistory,
    homeworkHistory,
    loading,
    error,
    fetchEvaluations,
    fetchStats,
    fetchLessons,
    fetchAbsences,
    fetchAbsenceHistory,
    fetchClassStudents,
    fetchHomeworkMessage,
    fetchHomeworkHistory,
    saveHomeworkMessage,
    deleteHomeworkMessage,
    saveAbsences,
    saveEvaluations,
    fetchPeriodNotes,
    savePeriodNote,
  } = useEvaluations();

  useEffect(() => {
    api.get('/teacher/classes')
      .then(({ data }) => {
        setClasses(data.classes || []);
        if (data.classes?.length) {
          setSelectedClassId(String(data.classes[0].id));
        }
      })
      .catch(() => toast.error('Impossible de charger les classes'));
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    fetchLessons({ classId: selectedClassId, date: dateFilter })
      .then((lessonItems) => {
        if (lessonItems.length) {
          setSelectedLessonId((current) => lessonItems.find((lesson) => lesson.id === current)?.id || lessonItems[0].id);
        } else {
          setSelectedLessonId('');
        }
      });
  }, [selectedClassId, dateFilter]);

  useEffect(() => {
    if (activeModule === 'devoirs' && selectedClassId) {
      fetchHomeworkHistory({ classId: selectedClassId });
    }
  }, [activeModule, selectedClassId, fetchHomeworkHistory]);

  useEffect(() => {
    if (activeModule === 'absences' && selectedClassId) {
      fetchClassStudents({ classId: selectedClassId }).then((students) => {
        if (students?.length) {
          setRows(students.map((student) => ({ ...student, status: 'on_time', justification: '' })));
        } else {
          setRows([]);
        }
      });
    }
  }, [activeModule, selectedClassId, fetchClassStudents]);

  useEffect(() => {
    if (activeModule === 'notes' && selectedClassId) {
      fetchClassStudents({ classId: selectedClassId }).then((students) => {
        setClassStudents(students || []);
      });
    } else {
      setClassStudents([]);
    }
  }, [activeModule, selectedClassId, fetchClassStudents]);

  useEffect(() => {
    if (!selectedClassId) {
      setRows([]);
      return;
    }

    if (activeModule === 'absences') {
      if (!dateFilter) {
        return;
      }

      fetchAbsences({ classId: selectedClassId, date: dateFilter }).then((data) => {
        if (data?.students) {
          setRows(data.students.map((student) => ({ ...student })));
        } else {
          setRows([]);
        }
        if (data?.lessonId) {
          setSelectedLessonId(data.lessonId);
        }
      });

      fetchStats({ classId: selectedClassId, module: 'absences' });
      return;
    }

    if (activeModule === 'devoirs') {
      if (!dateFilter) {
        setRows([]);
        setHomeworkBody('');
        setHomeworkAttachmentUrl(null);
        fetchStats({ classId: selectedClassId, module: 'devoirs' });
        return;
      }

      fetchHomeworkMessage({ classId: selectedClassId, date: dateFilter }).then((homework) => {
        setRows([]);
        setHomeworkBody(homework?.body || '');
        setHomeworkAttachmentUrl(homework?.attachmentUrl || null);
      });

      fetchStats({ classId: selectedClassId, module: 'devoirs' });
      return;
    }

    if (activeModule === 'notes') {
      if (!selectedPeriod) {
        setNoteColumns([]);
        setNoteRows([]);
        return;
      }

      fetchPeriodNotes({ classId: selectedClassId, period: selectedPeriod }).then((result) => {
        setNoteColumns(result.lessons.map((lesson, index) => ({
          header: lesson.label || `Note ${index + 1}`,
          accessorKey: `discipline_${index}`,
        })));
        setNoteRows(result.students.map((student) => ({
          id: student.studentId || student.id,
          studentName: student.studentName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
          ...student.notes.reduce((acc, grade, noteIndex) => {
            acc[`discipline_${noteIndex}`] = grade;
            return acc;
          }, {}),
        })));
      });

      fetchStats({ classId: selectedClassId, module: 'notes' });
      return;
    }

    Promise.all([
      fetchEvaluations({ classId: selectedClassId, lessonId: selectedLessonId }),
      fetchStats({ classId: selectedClassId, lessonId: selectedLessonId, module: 'notes' }),
    ]).then(([evaluationRows]) => {
      setRows(evaluationRows.map((row) => ({ ...row })));
    });
  }, [activeModule, dateFilter, fetchAbsences, fetchEvaluations, fetchHomeworkMessage, fetchStats, fetchPeriodNotes, selectedClassId, selectedLessonId, selectedPeriod]);

  useEffect(() => {
    if (!classPeriod) {
      setSelectedPeriod('');
      return;
    }

    if (periodOptions.length) {
      setSelectedPeriod(periodOptions[0].value);
    }
  }, [classPeriod, periodOptions]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const modifiedRows = useMemo(
    () => {
      const sourceRows = activeModule === 'absences' ? (absenceRoster?.students || []) : evaluations;
      return rows.filter((row) => {
        const original = sourceRows.find((item) => item.studentId === row.studentId);
        return original && (
          original.grade !== row.grade ||
          original.appreciation !== row.appreciation ||
          original.submitted !== row.submitted ||
          original.status !== row.status ||
          original.justification !== row.justification
        );
      });
    },
    [rows, evaluations, absenceRoster, activeModule],
  );

  const recentComments = useMemo(
    () => (
      (evaluations || [])
        .filter((item) => item.appreciation && item.appreciation.trim())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
    ),
    [evaluations],
  );

  function buildNoteData(result) {
    const lessonIndexByColumn = [];
    const columns = [];

    result.lessons.forEach((lesson, lessonIndex) => {
      const header = lesson.label || `Note ${lessonIndex + 1}`;
      if (!columns.some((column) => column.header === header)) {
        columns.push({ header, accessorKey: `discipline_${columns.length}` });
        lessonIndexByColumn.push(lessonIndex);
      }
    });

    setNoteColumns(columns);
    setNoteRows(result.students.map((student) => {
      const row = {
        id: student.studentId || student.id,
        studentName: student.studentName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      };

      lessonIndexByColumn.forEach((lessonIndex, columnIndex) => {
        row[`discipline_${columnIndex}`] = student.notes?.[lessonIndex] ?? '';
      });

      return row;
    }));
  }

  function openHomeworkModal(homework) {
    setHomeworkModalHomework(homework);
    setHomeworkModalBody(homework.body || '');
    setHomeworkModalAttachmentUrl(homework.attachmentUrl || null);
    setHomeworkModalAttachment(null);
    setHomeworkModalOpen(true);
  }

  function closeHomeworkModal() {
    setHomeworkModalOpen(false);
    setHomeworkModalHomework(null);
    setHomeworkModalBody('');
    setHomeworkModalAttachment(null);
    setHomeworkModalAttachmentUrl(null);
  }

  async function handleSaveHomeworkModal() {
    if (!homeworkModalHomework) {
      return;
    }

    if (!homeworkModalBody.trim()) {
      toast.error('Le message de devoirs ne peut pas être vide');
      return;
    }

    setSaving(true);
    const success = await saveHomeworkMessage({
      classId: selectedClassId,
      date: homeworkModalHomework.date,
      message: homeworkModalBody,
      attachmentFilename: homeworkModalAttachment?.name || homeworkModalHomework.attachmentFilename,
      attachmentBase64: homeworkModalAttachment?.base64,
    });
    setSaving(false);

    if (success) {
      toast.success('Devoir mis à jour');
      closeHomeworkModal();
      fetchHomeworkHistory({ classId: selectedClassId });
      if (dateFilter === homeworkModalHomework.date) {
        fetchHomeworkMessage({ classId: selectedClassId, date: dateFilter }).then((homework) => {
          setHomeworkBody(homework?.body || '');
          setHomeworkAttachmentUrl(homework?.attachmentUrl || null);
        });
      }
    }
  }

  async function handleDeleteHomework(homeworkId) {
    const confirmed = window.confirm('Supprimer ce devoir ? Cette action est irréversible.');
    if (!confirmed) {
      return;
    }

    setSaving(true);
    const success = await deleteHomeworkMessage({ homeworkId });
    setSaving(false);

    if (success) {
      toast.success('Devoir supprimé');
      fetchHomeworkHistory({ classId: selectedClassId });
      if (homeworkModalHomework?.id === homeworkId) {
        closeHomeworkModal();
      }
    }
  }

  async function openAbsenceHistory() {
    if (!selectedClassId) {
      toast.error('Veuillez sélectionner une classe');
      return;
    }

    setHistoryLoading(true);
    const history = await fetchAbsenceHistory({ classId: selectedClassId });
    setAbsenceHistoryRows(history || []);
    setHistoryLoading(false);
    setAbsenceHistoryModalOpen(true);
  }

  function closeAbsenceHistory() {
    setAbsenceHistoryModalOpen(false);
    setAbsenceHistoryRows([]);
  }

  async function exportLessonPdf(lessonId, lessonTitle) {
    if (!lessonId) {
      toast.error('Leçon invalide');
      return;
    }

    try {
      const response = await api.get(`/absences/history/${lessonId}/export`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `presence-${lessonTitle || lessonId}.pdf`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Impossible de télécharger le PDF');
    }
  }

  function handleGradeChange(studentId, grade) {
    const safeGrade = Number.isFinite(grade) ? Math.min(10, Math.max(0, grade)) : 0;
    setRows((prev) => prev.map((row) => (row.studentId === studentId ? { ...row, grade: safeGrade } : row)));
  }

  function handleAppreciationChange(studentId, appreciation) {
    setRows((prev) => prev.map((row) => (row.studentId === studentId ? { ...row, appreciation } : row)));
  }

  function handleStatusChange(studentId, status) {
    setRows((prev) => prev.map((row) => (row.studentId === studentId ? { ...row, status } : row)));
  }

  function handleJustificationChange(studentId, justification) {
    setRows((prev) => prev.map((row) => (row.studentId === studentId ? { ...row, justification } : row)));
  }

  function handleSubmittedToggle(studentId) {
    setRows((prev) => prev.map((row) => (row.studentId === studentId ? { ...row, submitted: !row.submitted } : row)));
  }

  async function handleSavePeriodNote() {
    if (!selectedClassId || !selectedPeriod || !newNoteStudentId || !newNoteDiscipline) {
      toast.error('Veuillez sélectionner la classe, la période, l’élève et la discipline');
      return;
    }

    const gradeValue = Number(newNoteGrade);
    if (!Number.isFinite(gradeValue) || gradeValue < 0 || gradeValue > 10) {
      toast.error('La note doit être un nombre entre 0 et 10');
      return;
    }

    setSaving(true);
    const savedNote = await savePeriodNote({
      classId: selectedClassId,
      period: selectedPeriod,
      studentId: newNoteStudentId,
      discipline: newNoteDiscipline,
      grade: gradeValue,
    });
    setSaving(false);

    if (savedNote) {
      toast.success('Note enregistrée');
      setNewNoteDiscipline('');
      setNewNoteGrade('');
      setNewNoteStudentId('');
      fetchPeriodNotes({ classId: selectedClassId, period: selectedPeriod }).then((result) => {
        setNoteColumns(result.lessons.map((lesson, index) => ({
          header: lesson.label || `Note ${index + 1}`,
          accessorKey: `discipline_${index}`,
        })));
        setNoteRows(result.students.map((student) => ({
          id: student.studentId || student.id,
          studentName: student.studentName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
          ...student.notes.reduce((acc, grade, noteIndex) => {
            acc[`discipline_${noteIndex}`] = grade;
            return acc;
          }, {}),
        })));
      });
    } else {
      toast.error('Impossible d’enregistrer la note');
    }
  }

  async function handleSave() {
    if (activeModule === 'devoirs') {
      if (!dateFilter) {
        toast.error('Veuillez sélectionner une date');
        return;
      }

      if (!homeworkBody.trim()) {
        toast.error('Le message de devoirs ne peut pas être vide');
        return;
      }
    }

    if (activeModule === 'absences' && !dateFilter) {
      toast.error('Veuillez sélectionner une date pour enregistrer les absences');
      return;
    }

    if (modifiedRows.length === 0) {
      toast('Aucune modification à enregistrer');
      return;
    }

    setSaving(true);
    let success = false;

    if (activeModule === 'absences') {
      success = await saveAbsences({
        classId: selectedClassId,
        date: dateFilter,
        lessonId: absenceRoster?.lessonId || selectedLessonId,
        students: modifiedRows.map((row) => ({
          studentId: row.studentId,
          status: row.status || 'on_time',
          justification: row.justification || '',
          grade: Number(row.grade ?? 0),
          appreciation: row.appreciation || '',
          submitted: Boolean(row.submitted),
        })),
      });
    } else if (activeModule === 'devoirs') {
      success = await saveHomeworkMessage({
        classId: selectedClassId,
        date: dateFilter,
        message: homeworkBody,
        attachmentFilename: homeworkAttachment?.name,
        attachmentBase64: homeworkAttachment?.base64,
      });
    } else {
      success = await saveEvaluations(modifiedRows);
    }

    setSaving(false);

    if (success) {
      const successMessage = activeModule === 'absences'
        ? 'Absences enregistrées'
        : activeModule === 'devoirs'
          ? 'Message de devoirs enregistré'
          : 'Évaluations enregistrées';
      toast.success(successMessage);

      if (activeModule === 'absences') {
        fetchAbsences({ classId: selectedClassId, date: dateFilter }).then((data) => {
          if (data?.students) {
            setRows(data.students.map((student) => ({ ...student })));
          }
        });
      } else if (activeModule === 'devoirs') {
        fetchHomeworkMessage({ classId: selectedClassId, date: dateFilter }).then((homework) => {
          setHomeworkBody(homework?.body || '');
          setHomeworkAttachmentUrl(homework?.attachmentUrl || null);
          setHomeworkAttachment(null);
        });
        fetchHomeworkHistory({ classId: selectedClassId });
      } else {
        fetchEvaluations({ classId: selectedClassId, lessonId: selectedLessonId }).then((evaluationRows) => setRows(evaluationRows.map((row) => ({ ...row }))));
        fetchStats({ classId: selectedClassId, lessonId: selectedLessonId });
      }
    } else {
      toast.error('Échec de l’enregistrement');
    }
  }

  const lessonsOptions = lessons || [];

  const moduleDescription = activeModule === 'absences'
    ? 'Suivi des présences, retards et absences'
    : activeModule === 'devoirs'
      ? 'Gestion du rendu des devoirs et du statut des travaux'
      : 'Saisie et gestion des notes et appréciations';

  return (
    <div>
      <div style={{ marginBottom: 24, maxWidth: 420 }}>
        <h2 style={{ color: 'var(--amc-primary)', marginBottom: 12 }}>Suivi pédagogique</h2>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Classe</label>
            <select
              className="form-control"
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              style={{ maxWidth: '100%' }}
            >
              {classes.map((cls) => (
                <option key={cls.id} value={String(cls.id)}>
                  {cls.level?.name} - {cls.dayOfWeek} {cls.startTime}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <p style={{ color: '#6B7280', margin: 0 }}>{moduleDescription}</p>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {loading && <FiLoader className="spin" size={20} />}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        {MODULES.map((module) => (
          <button
            key={module.key}
            type="button"
            className={`btn ${activeModule === module.key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveModule(module.key)}
          >
            {module.label}
          </button>
        ))}
      </div>

      <div className="stats-grid">
        {activeModule === 'absences' ? (
          <>
            <StatsCard icon={FiCheckCircle} label="Absences" value={`${stats?.absenceRate ?? 0}%`} subtitle="Taux d'absences" />
            <StatsCard icon={FiCalendar} label="Couverture" value={`${stats?.lessonsFollowedRate ?? 0}%`} subtitle="Leçons avec saisies" />
            <StatsCard icon={FiBookOpen} label="Total" value={`${stats?.totalStudents ?? 0}`} subtitle="Élèves de la classe" />
          </>
        ) : activeModule === 'devoirs' ? (
          <>
            <StatsCard icon={FiCheckCircle} label="Devoirs publiés" value={`${stats?.submissionRate ?? 0}%`} subtitle="Travaux disponibles" />
            <StatsCard icon={FiCalendar} label="Total devoirs" value={`${stats?.homeworkCount ?? 0}`} subtitle="Nombre de messages" />
            <StatsCard icon={FiBookOpen} label="Total" value={`${stats?.totalStudents ?? 0}`} subtitle="Élèves de la classe" />
          </>
        ) : (
          <>
            <StatsCard icon={FiBookOpen} label="Moyenne classe" value={`${(stats?.averageGrade ?? 0).toFixed(1)}/10`} subtitle="Notes enregistrées" />
            <StatsCard icon={FiCheckCircle} label="Participation" value={`${stats?.participationRate ?? 0}%`} subtitle="Élèves présents" />
            <StatsCard icon={FiBookOpen} label="Total" value={`${stats?.totalStudents ?? 0}`} subtitle="Élèves de la classe" />
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h3>Filtres</h3>
            </div>
            <div className="form-group" style={{ maxWidth: 240 }}>
              <label>Date</label>
              <input
                type="date"
                className="form-control"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
              />
            </div>
            {activeModule === 'notes' && (
              <div className="form-group" style={{ maxWidth: 240 }}>
                <label>Période</label>
                <select
                  className="form-control"
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value)}
                >
                  <option value="">Sélectionner une période</option>
                  {periodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {activeModule === 'absences' && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={openAbsenceHistory}
                  disabled={historyLoading}
                >
                  {historyLoading ? 'Chargement...' : 'Voir l’historique des absences'}
                </button>
              </div>
            )}
          </div>

          {activeModule === 'devoirs' && selectedClassId && homeworkHistory.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3>Historique des devoirs</h3>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Message</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {homeworkHistory
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .map((homework) => (
                        <tr key={homework.id}>
                          <td>{new Date(homework.date).toLocaleDateString('fr-FR')}</td>
                          <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {homework.body}
                          </td>
                          <td style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => openHomeworkModal(homework)}
                            >
                              Voir
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDeleteHomework(homework.id)}
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeModule === 'devoirs' ? (
            <div className="card" style={{ padding: 16, marginBottom: 20 }}>
              <div className="card-header">
                <h3>Ajouter un devoir</h3>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="homeworkBody" style={{ fontWeight: 600 }}>Message de devoirs</label>
                <textarea
                  id="homeworkBody"
                  className="form-control"
                  rows={8}
                  placeholder="Rédigez un message visible par les familles de la classe sélectionnée"
                  value={homeworkBody}
                  onChange={(event) => setHomeworkBody(event.target.value)}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="homeworkAttachment" style={{ fontWeight: 600 }}>Pièce jointe (optionnelle)</label>
                <input
                  id="homeworkAttachment"
                  type="file"
                  className="form-control"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setHomeworkAttachment(null);
                      return;
                    }

                    const reader = new FileReader();
                    reader.onload = () => {
                      setHomeworkAttachment({
                        name: file.name,
                        base64: reader.result?.toString().split(',')[1],
                      });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </div>
              {homeworkAttachmentUrl && (
                <div style={{ marginBottom: 14 }}>
                  <strong>Pièce jointe existante :</strong>{' '}
                  <a href={homeworkAttachmentUrl} target="_blank" rel="noreferrer">Voir la pièce jointe</a>
                </div>
              )}
              <div style={{ color: '#6B7280' }}>
                Ce message sera partagé avec les familles de la classe sélectionnée.
              </div>
            </div>
          ) : activeModule === 'notes' ? (
            <>
              <div className="card" style={{ padding: 16, marginBottom: 20 }}>
                <div className="card-header">
                  <h3>Élèves de la classe</h3>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Élève</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.length === 0 ? (
                      <tr>
                        <td colSpan={2} style={{ textAlign: 'center', padding: '18px' }}>
                          {selectedClassId ? 'Chargement des élèves...' : 'Sélectionnez une classe'}
                        </td>
                      </tr>
                    ) : classStudents.map((student) => (
                      <tr key={student.id}>
                        <td style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {student.photoUrl && (
                            <img
                              src={getPhotoSource(student.photoUrl)}
                              alt={student.studentName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim()}
                              style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2E8F0' }}
                            />
                          )}
                          {student.studentName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim()}
                        </td>
                        <td>{student.status || 'Actif'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedPeriod && noteColumns.length > 0 && (
                <div className="card" style={{ padding: 16, marginBottom: 20, overflowX: 'auto' }}>
                  <div className="card-header">
                    <h3>Notes enregistrées</h3>
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Élève</th>
                        {noteColumns.map((column) => (
                          <th key={column.accessorKey}>{column.header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {noteRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.studentName}</td>
                          {noteColumns.map((column) => (
                            <td key={`${row.id}-${column.accessorKey}`}>
                              {row[column.accessorKey] ?? '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="card" style={{ padding: 16, marginBottom: 20 }}>
                <div className="card-header">
                  <h3>Saisie de notes par période</h3>
                </div>
                <div className="form-group">
                  <label>Élève</label>
                  <select
                    className="form-control"
                    value={newNoteStudentId}
                    onChange={(event) => setNewNoteStudentId(event.target.value)}
                  >
                    <option value="">Sélectionner un élève</option>
                    {classStudents.map((student) => (
                      <option key={student.studentId || student.id} value={String(student.studentId || student.id)}>
                        {student.studentName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Discipline</label>
                  <input
                    className="form-control"
                    value={newNoteDiscipline}
                    onChange={(event) => setNewNoteDiscipline(event.target.value)}
                    placeholder="Par exemple, Mathématiques"
                  />
                </div>
                <div className="form-group">
                  <label>Note</label>
                  <input
                    type="number"
                    className="form-control"
                    value={newNoteGrade}
                    onChange={(event) => setNewNoteGrade(event.target.value)}
                    min={0}
                    max={10}
                    step="0.5"
                    placeholder="0–10"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSavePeriodNote}
                    disabled={saving || !selectedPeriod}
                  >
                    {saving ? 'Enregistrement...' : 'Ajouter / mettre à jour la note'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <EvaluationTable
              rows={rows}
              mode={activeModule}
              onGradeChange={handleGradeChange}
              onAppreciationChange={handleAppreciationChange}
              onStatusChange={handleStatusChange}
              onJustificationChange={handleJustificationChange}
              onSubmittedToggle={handleSubmittedToggle}
            />
          )}

          {homeworkModalOpen && (
            <div className="modal-overlay">
              <div className="card modal-card">
                <div className="card-header">
                  <h3>Modifier le devoir</h3>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ marginBottom: 14 }}>
                    <label htmlFor="homeworkModalDate" style={{ fontWeight: 600 }}>Date du devoir</label>
                    <input
                      id="homeworkModalDate"
                      type="date"
                      className="form-control"
                      value={new Date(homeworkModalHomework.date).toISOString().slice(0, 10)}
                      disabled
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label htmlFor="homeworkModalBody" style={{ fontWeight: 600 }}>Message de devoirs</label>
                    <textarea
                      id="homeworkModalBody"
                      className="form-control"
                      rows={8}
                      value={homeworkModalBody}
                      onChange={(event) => setHomeworkModalBody(event.target.value)}
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label htmlFor="homeworkModalAttachment" style={{ fontWeight: 600 }}>Pièce jointe</label>
                    <input
                      id="homeworkModalAttachment"
                      type="file"
                      className="form-control"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          setHomeworkModalAttachment(null);
                          return;
                        }

                        const reader = new FileReader();
                        reader.onload = () => {
                          setHomeworkModalAttachment({
                            name: file.name,
                            base64: reader.result?.toString().split(',')[1],
                          });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </div>
                  {homeworkModalAttachmentUrl && (
                    <div style={{ marginBottom: 14 }}>
                      <strong>Pièce jointe actuelle :</strong>{' '}
                      <a
                        href={homeworkModalAttachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        download={homeworkModalHomework?.attachmentFilename || ''}
                        className="btn btn-sm btn-outline"
                      >
                        Télécharger{homeworkModalHomework?.attachmentFilename ? ` (${homeworkModalHomework.attachmentFilename})` : ''}
                      </a>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <button type="button" className="btn btn-outline" onClick={closeHomeworkModal}>Annuler</button>
                    <button type="button" className="btn btn-primary" onClick={handleSaveHomeworkModal} disabled={saving || !homeworkModalBody.trim()}>
                      {saving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {absenceHistoryModalOpen && (
            <div className="modal-overlay">
              <div className="card modal-card" style={{ maxWidth: 760, width: '100%' }}>
                <div className="card-header">
                  <h3>Historique des absences</h3>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <p style={{ margin: 0, color: '#6B7280' }}>
                      Liste des saisies d'absences de la classe et export de présence.
                    </p>
                    <button type="button" className="btn btn-outline" onClick={closeAbsenceHistory}>
                      Fermer
                    </button>
                  </div>
                  <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Cours</th>
                          <th style={{ width: 140 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absenceHistoryRows.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ textAlign: 'center', padding: '18px' }}>
                              {historyLoading ? 'Chargement...' : 'Aucune saisie d’absences enregistrée.'}
                            </td>
                          </tr>
                        ) : absenceHistoryRows.map((lesson) => (
                          <tr key={lesson.id}>
                            <td>{new Date(lesson.date).toLocaleDateString('fr-FR')}</td>
                            <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lesson.title}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => exportLessonPdf(lesson.id, lesson.title)}
                              >
                                Exporter
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeModule !== 'notes' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={
                  saving ||
                  loading ||
                  (activeModule === 'devoirs'
                    ? !homeworkBody.trim() || !dateFilter
                    : !dateFilter || rows.length === 0
                  )
                }
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <ClassOverview stats={stats} />
          <RecentComments comments={recentComments} />
        </div>
      </div>
    </div>
  );
}
