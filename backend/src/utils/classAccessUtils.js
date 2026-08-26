// Un professeur a accès à une classe s'il en est le référent (Class.teacherId)
// ou, pour le pôle Coran, s'il en est un professeur supplémentaire (ClassTeacher).
function classAccessWhere(teacherId) {
  return { OR: [{ teacherId }, { classTeachers: { some: { teacherId } } }] };
}

// Variante pour vérifier un enregistrement Class déjà chargé avec sa relation classTeachers.
function teacherHasClassAccess(classRecord, teacherId) {
  if (!classRecord) return false;
  if (classRecord.teacherId === teacherId) return true;
  return (classRecord.classTeachers || []).some((ct) => ct.teacherId === teacherId);
}

module.exports = { classAccessWhere, teacherHasClassAccess };
