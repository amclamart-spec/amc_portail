function extractSchoolYearCode(label, startDate) {
  if (typeof label === 'string') {
    const yearMatch = label.match(/\d{4}/);
    if (yearMatch) {
      return yearMatch[0];
    }
  }
  if (startDate) {
    return new Date(startDate).getFullYear().toString();
  }
  return new Date().getFullYear().toString();
}

async function getNextEnrollmentRegistrationCode(tx, schoolYearId, offset = 0) {
  const schoolYear = await tx.schoolYear.findUnique({ where: { id: schoolYearId } });
  if (!schoolYear) {
    throw new Error('Année scolaire introuvable');
  }

  const yearCode = extractSchoolYearCode(schoolYear.label, schoolYear.startDate);
  const count = await tx.enrollment.count({ where: { schoolYearId } });
  const sequence = String(count + 1 + offset).padStart(3, '0');

  return `FAM-${yearCode}-${sequence}`;
}

module.exports = {
  getNextEnrollmentRegistrationCode,
  extractSchoolYearCode,
};
