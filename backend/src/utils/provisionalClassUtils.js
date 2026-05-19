const PROVISIONAL_CLASS_MARKER = 'AFFECTATION_PROVISOIRE';
const PROVISIONAL_CLASS_NAME = 'Classe fictive';

function isProvisionalClass(cls) {
  if (!cls) return false;
  const teacherName = String(cls.teacherName || '').trim();
  const room = String(cls.room || '').trim();
  return [PROVISIONAL_CLASS_MARKER, PROVISIONAL_CLASS_NAME].includes(teacherName)
    || [PROVISIONAL_CLASS_MARKER, PROVISIONAL_CLASS_NAME].includes(room);
}

function getProvisionalClassFilter() {
  return {
    OR: [
      { teacherName: PROVISIONAL_CLASS_MARKER },
      { room: PROVISIONAL_CLASS_MARKER },
      { teacherName: PROVISIONAL_CLASS_NAME },
      { room: PROVISIONAL_CLASS_NAME },
    ],
  };
}

module.exports = {
  PROVISIONAL_CLASS_MARKER,
  PROVISIONAL_CLASS_NAME,
  isProvisionalClass,
  getProvisionalClassFilter,
};
