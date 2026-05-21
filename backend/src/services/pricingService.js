/**
 * Service de calcul tarifaire AMC (paramétrable via PricingConfig)
 */

const DEFAULT_PRICING = {
  // Frais d'inscription facturés une seule fois par famille, quel que soit le nombre d'enfants inscrits.
  registrationFee: 10,
  fraisPrelevement: 0,
  arabicTiers: {
    1: 310,
    2: 570,
    3: 750,
    4: 900,
    5: 1050,
  },
  arabicExtraPerStudent: 150,
  individualPricing: {
    CORAN_ENFANT: 220,
    CORAN_ADULTE_HOMME: 300,
    CORAN_ADULTE_FEMME: 250,
    SCIENCES_ISLAMIQUES: 300,
  },
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePricingConfig(pricingConfig) {
  if (!pricingConfig) return { ...DEFAULT_PRICING };

  return {
    registrationFee: toNumber(pricingConfig.registrationFee, DEFAULT_PRICING.registrationFee),
    fraisPrelevement: toNumber(pricingConfig.fraisPrelevement, DEFAULT_PRICING.fraisPrelevement),
    arabicTiers: {
      1: toNumber(pricingConfig.arabicTier1, DEFAULT_PRICING.arabicTiers[1]),
      2: toNumber(pricingConfig.arabicTier2, DEFAULT_PRICING.arabicTiers[2]),
      3: toNumber(pricingConfig.arabicTier3, DEFAULT_PRICING.arabicTiers[3]),
      4: toNumber(pricingConfig.arabicTier4, DEFAULT_PRICING.arabicTiers[4]),
      5: toNumber(pricingConfig.arabicTier5, DEFAULT_PRICING.arabicTiers[5]),
    },
    arabicExtraPerStudent: toNumber(pricingConfig.arabicExtraPerStudent, DEFAULT_PRICING.arabicExtraPerStudent),
    individualPricing: {
      CORAN_ENFANT: toNumber(pricingConfig.coranEnfant, DEFAULT_PRICING.individualPricing.CORAN_ENFANT),
      CORAN_ADULTE_HOMME: toNumber(pricingConfig.coranAdulteHomme, DEFAULT_PRICING.individualPricing.CORAN_ADULTE_HOMME),
      CORAN_ADULTE_FEMME: toNumber(pricingConfig.coranAdulteFemme, DEFAULT_PRICING.individualPricing.CORAN_ADULTE_FEMME),
      SCIENCES_ISLAMIQUES: toNumber(pricingConfig.sciencesIslamiques, DEFAULT_PRICING.individualPricing.SCIENCES_ISLAMIQUES),
    },
  };
}

async function resolvePricingConfig(prisma) {
  const active = await prisma.pricingConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  return normalizePricingConfig(active);
}

function calculateArabicFee(numberOfStudentsInArabic, pricing = DEFAULT_PRICING) {
  if (numberOfStudentsInArabic <= 0) return 0;

  if (numberOfStudentsInArabic <= 5) {
    return pricing.arabicTiers[numberOfStudentsInArabic] || 0;
  }

  return pricing.arabicTiers[5] + (numberOfStudentsInArabic - 5) * pricing.arabicExtraPerStudent;
}

function normalizeLevelCode(levelCode) {
  if (!levelCode) return '';
  return String(levelCode).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}

function getIndividualCoursePrice(levelCode, pricing = DEFAULT_PRICING) {
  const normalizedCode = normalizeLevelCode(levelCode);
  const mapping = {
    ENFANT: 'CORAN_ENFANT',
    CORAN_ENFANT: 'CORAN_ENFANT',
    ADULTE_HOMME: 'CORAN_ADULTE_HOMME',
    CORAN_ADULTE_HOMME: 'CORAN_ADULTE_HOMME',
    ADULTE_FEMME: 'CORAN_ADULTE_FEMME',
    CORAN_ADULTE_FEMME: 'CORAN_ADULTE_FEMME',
    SCIENCES_ISLAMIQUES: 'SCIENCES_ISLAMIQUES',
    SCIENCES: 'SCIENCES_ISLAMIQUES',
    SCIENCES_ISLAMIQUE: 'SCIENCES_ISLAMIQUES',
  };
  const pricingKey = mapping[normalizedCode] || normalizedCode;
  return pricing.individualPricing[pricingKey] || 0;
}

function calculateFamilyTotal(enrollments, pricing = DEFAULT_PRICING, options = {}) {
  const { skipRegistrationFee = false, existingArabicCount = 0 } = options;
  let arabicCount = 0;
  let coranScienceTotal = 0;

  for (const enrollment of enrollments) {
    const pole = (enrollment.poleName || '').toLowerCase();
    if (pole.includes('arabe')) {
      arabicCount += 1;
      continue;
    }

    coranScienceTotal += getIndividualCoursePrice(enrollment.levelCode, pricing);
  }

  const registrationFee = skipRegistrationFee ? 0 : (pricing.registrationFee || 0);
  const arabicFee = calculateArabicFee(arabicCount + existingArabicCount, pricing);
  const total = registrationFee + arabicFee + coranScienceTotal;

  return {
    registrationFee,
    fraisPrelevement: pricing.fraisPrelevement || 0,
    arabicFee,
    arabicCount,
    coranScienceFee: coranScienceTotal,
    total,
    appliedPricing: pricing,
  };
}

function calculateInstallments(totalAmount, numberOfInstallments) {
  if (numberOfInstallments < 1 || numberOfInstallments > 8) {
    throw new Error('Le nombre de mensualités doit être entre 1 et 8');
  }

  const baseAmount = Math.floor((totalAmount / numberOfInstallments) * 100) / 100;
  const remainder = Math.round((totalAmount - baseAmount * numberOfInstallments) * 100) / 100;

  const installments = [];
  for (let i = 0; i < numberOfInstallments; i += 1) {
    installments.push({
      number: i + 1,
      amount: i === numberOfInstallments - 1 ? Number((baseAmount + remainder).toFixed(2)) : baseAmount,
    });
  }
  return installments;
}

function buildInstallmentSchedule(totalAmount, numberOfInstallments, options = {}) {
  const { dayOfMonth = 10, startDate = new Date() } = options;
  const parts = calculateInstallments(totalAmount, numberOfInstallments);

  return parts.map((p, index) => {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + index);
    dueDate.setDate(Math.min(dayOfMonth, 28));

    return {
      installmentNumber: p.number,
      amount: p.amount,
      dueDate,
    };
  });
}

module.exports = {
  DEFAULT_PRICING,
  normalizePricingConfig,
  resolvePricingConfig,
  calculateArabicFee,
  getIndividualCoursePrice,
  calculateFamilyTotal,
  calculateInstallments,
  buildInstallmentSchedule,
};
