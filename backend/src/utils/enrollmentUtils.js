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
  const prefix = `FAM-${yearCode}-`;
  const [latestEnrollment] = await tx.enrollment.findMany({
    where: { schoolYearId, registrationCode: { startsWith: prefix } },
    orderBy: { registrationCode: 'desc' },
    take: 1,
    select: { registrationCode: true },
  });

  const lastSequence = latestEnrollment
    ? Number(latestEnrollment.registrationCode.slice(prefix.length))
    : 0;
  const sequence = String(lastSequence + 1 + offset).padStart(3, '0');

  return `FAM-${yearCode}-${sequence}`;
}

module.exports = {
  getNextEnrollmentRegistrationCode,
  extractSchoolYearCode,
};
