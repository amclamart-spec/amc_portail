import { useState, useCallback } from 'react';
import api from '../api/axios';

export default function useEvaluations() {
  const [evaluations, setEvaluations] = useState([]);
  const [stats, setStats] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [absenceRoster, setAbsenceRoster] = useState(null);
  const [absenceHistory, setAbsenceHistory] = useState([]);
  const [homeworkHistory, setHomeworkHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEvaluations = useCallback(async ({ classId, lessonId }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get('/evaluations', { params: { classId, lessonId } });
      setEvaluations(data.evaluations || []);
      return data.evaluations || [];
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les évaluations');
      setEvaluations([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async ({ classId, lessonId, module }) => {
    setLoading(true);
    setError(null);

    try {
      const params = { classId };
      if (lessonId) params.lessonId = lessonId;
      if (module) params.module = module;

      const { data } = await api.get('/evaluations/stats', { params });
      setStats(data.stats || null);
      return data.stats || null;
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les statistiques');
      setStats(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLessons = useCallback(async ({ classId, date }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get('/evaluations/lessons', { params: { classId, date } });
      setLessons(data.lessons || []);
      return data.lessons || [];
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les leçons');
      setLessons([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAbsences = useCallback(async ({ classId, date }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get('/absences', { params: { classId, date } });
      setAbsenceRoster(data || null);
      return data || null;
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les absences');
      setAbsenceRoster(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClassStudents = useCallback(async ({ classId }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get('/absences/class-students', { params: { classId } });
      return data.students || [];
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les élèves de la classe');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHomeworkMessage = useCallback(async ({ classId, date }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get('/homework', { params: { classId, date } });
      return data.homework || null;
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger le message de devoirs');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHomeworkHistory = useCallback(async ({ classId }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get('/homework/history', { params: { classId } });
      setHomeworkHistory(data.homeworks || []);
      return data.homeworks || [];
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger l’historique des devoirs');
      setHomeworkHistory([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAbsenceHistory = useCallback(async ({ classId }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get('/absences/history', { params: { classId } });
      setAbsenceHistory(data.lessons || []);
      return data.lessons || [];
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger l’historique des absences');
      setAbsenceHistory([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const saveHomeworkMessage = useCallback(async ({ classId, date, message, attachmentFilename, attachmentBase64 }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post('/homework', { classId, date, message, attachmentFilename, attachmentBase64 });
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’enregistrer le message de devoirs');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteHomeworkMessage = useCallback(async ({ homeworkId }) => {
    setLoading(true);
    setError(null);

    try {
      await api.delete(`/homework/${homeworkId}`);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de supprimer le devoir');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveAbsences = useCallback(async ({ classId, date, students }) => {
    setLoading(true);
    setError(null);

    try {
      await api.post('/absences', { classId, date, students });
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’enregistrer les absences');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPeriodNotes = useCallback(async ({ classId, period }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get('/evaluations/period', { params: { classId, period } });
      return data || { lessons: [], students: [] };
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger les notes par période');
      return { lessons: [], students: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const savePeriodNote = useCallback(async ({ classId, period, studentId, discipline, grade }) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post('/evaluations/note', { classId, period, studentId, discipline, grade });
      return data?.note || null;
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’enregistrer la note');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  async function saveEvaluations(updatedRows) {
    setLoading(true);
    setError(null);

    try {
      await Promise.all(updatedRows.map((row) => api.post('/evaluations', {
        studentId: row.studentId,
        lessonId: row.lessonId,
        grade: Number(row.grade),
        appreciation: row.appreciation || '',
        submitted: Boolean(row.submitted),
        status: row.status || 'on_time',
      })));
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible d’enregistrer les évaluations');
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
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
    fetchPeriodNotes,
    savePeriodNote,
    saveEvaluations,
  };
}
