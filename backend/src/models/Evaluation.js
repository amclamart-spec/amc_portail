const EVALUATION_STATUSES = ['on_time', 'late', 'missing'];

function validateEvaluationPayload(payload) {
  if (!payload) return 'Aucune donnée fournie pour l’évaluation';
  const { studentId, lessonId, grade, submitted, status } = payload;
  if (!studentId) return 'Identifiant de l’élève manquant';
  if (!lessonId) return 'Identifiant de la leçon manquant';
  if (grade === undefined || grade === null) return 'La note est requise';
  if (typeof grade !== 'number' || Number.isNaN(grade) || grade < 0 || grade > 10) {
    return 'La note doit être un nombre entre 0 et 10';
  }
  if (typeof submitted !== 'boolean') return 'Le statut de remise doit être vrai ou faux';
  if (!EVALUATION_STATUSES.includes(status)) return 'Le statut de l’évaluation est invalide';
  return null;
}

module.exports = {
  EVALUATION_STATUSES,
  validateEvaluationPayload,
};
