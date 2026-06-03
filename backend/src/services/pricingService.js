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

const DEFAULT_TARIFF_ROWS = [
  { id: 'arabic-1', label: 'Arabe - 1 élève', poleName: 'Arabe', levelId: 'ALL', peopleCount: 1, priceKey: 'arabicTier1' },
  { id: 'arabic-2', label: 'Arabe - 2 élèves', poleName: 'Arabe', levelId: 'ALL', peopleCount: 2, priceKey: 'arabicTier2' },
  { id: 'arabic-3', label: 'Arabe - 3 élèves', poleName: 'Arabe', levelId: 'ALL', peopleCount: 3, priceKey: 'arabicTier3' },
  { id: 'arabic-4', label: 'Arabe - 4 élèves', poleName: 'Arabe', levelId: 'ALL', peopleCount: 4, priceKey: 'arabicTier4' },
  { id: 'arabic-5', label: 'Arabe - 5 élèves', poleName: 'Arabe', levelId: 'ALL', peopleCount: 5, priceKey: 'arabicTier5' },
  { id: 'arabic-6-plus', label: 'Arabe - 6+ élèves (unitaire)', poleName: 'Arabe', levelId: 'ALL', peopleCount: 6, priceKey: 'arabicExtraPerStudent' },
  { id: 'coran-enfant', label: 'Coran - Enfant', poleName: 'Coran', levelMatch: 'Enfant', peopleCount: 1, priceKey: 'coranEnfant' },
  { id: 'coran-adulte-homme', label: 'Coran - Adulte homme', poleName: 'Coran', levelMatch: 'Homme', peopleCount: 1, priceKey: 'coranAdulteHomme' },
  { id: 'coran-adulte-femme', label: 'Coran - Adulte femme', poleName: 'Coran', levelMatch: 'Femme', peopleCount: 1, priceKey: 'coranAdulteFemme' },
  { id: 'sciences-islamiques', label: 'Sciences islamiques', poleName: 'Sciences islamiques', levelId: 'ALL', peopleCount: 1, priceKey: 'sciencesIslamiques' },
];

function normalizePricingConfig(pricingConfig) {
  if (!pricingConfig) return { ...DEFAULT_PRICING, tariffRows: [] };

  const rawRows = Array.isArray(pricingConfig.tariffRows) ? pricingConfig.tariffRows : [];
  const tariffRows = rawRows.length > 0
    ? rawRows.map((row) => ({
        ...row,
        peopleCount: Number(row.peopleCount) || 0,
        price: Number(row.price) || 0,
        poleId: row.poleId || '',
        levelId: row.levelId || 'ALL',
        poleName: row.poleName || '',
        levelCode: row.levelCode || '',
      }))
    : DEFAULT_TARIFF_ROWS.map((row) => ({
        id: row.id,
        label: row.label,
        poleId: '',
        poleName: row.poleName,
        levelId: row.levelId,
        levelCode: '',
        peopleCount: row.peopleCount,
        price: toNumber(pricingConfig[row.priceKey], 0),
      }));

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
    tariffRows,
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

function getMatchingTariffRows(enrollment, pricing) {
  const rows = Array.isArray(pricing.tariffRows) ? pricing.tariffRows : [];
  if (!rows.length) return [];

  return rows.filter((row) => {
    if (row.poleId && enrollment.poleId) {
      return row.poleId === enrollment.poleId;
    }
    if (row.poleName && enrollment.poleName) {
      return String(row.poleName).toLowerCase() === String(enrollment.poleName).toLowerCase();
    }
    return false;
  });
}

function findBestTariffRowForEnrollment(enrollment, rows) {
  if (!rows?.length) return null;

  const exactLevelMatch = rows.find((row) => row.levelId && enrollment.levelId && row.levelId === enrollment.levelId);
  if (exactLevelMatch) return exactLevelMatch;

  const exactCodeMatch = rows.find((row) => row.levelCode && enrollment.levelCode && String(row.levelCode).toLowerCase() === String(enrollment.levelCode).toLowerCase());
  if (exactCodeMatch) return exactCodeMatch;

  const allLevelRow = rows.find((row) => row.levelId === 'ALL');
  if (allLevelRow) return allLevelRow;

  return rows[0] || null;
}

function selectTieredTariffRow(rows, count) {
  if (!rows?.length) return null;
  const tierRows = rows.filter((row) => row.levelId === 'ALL' && Number.isFinite(row.peopleCount));
  if (!tierRows.length) return null;

  const sortedRows = tierRows.slice().sort((a, b) => a.peopleCount - b.peopleCount);
  const exact = sortedRows.find((row) => row.peopleCount === count);
  if (exact) return exact;

  const fallback = sortedRows.filter((row) => row.peopleCount < count).pop();
  if (fallback) return fallback;

  return sortedRows[0];
}

function calculateFamilyTotal(enrollments, pricing = DEFAULT_PRICING, options = {}) {
  const { skipRegistrationFee = false, existingArabicCount = 0, totalFamilyEnrollmentsByPole = {} } = options;
  const registrationFee = skipRegistrationFee ? 0 : toNumber(pricing.registrationFee, DEFAULT_PRICING.registrationFee);
  const fraisPrelevement = toNumber(pricing.fraisPrelevement, DEFAULT_PRICING.fraisPrelevement);
  let totalFee = 0;
  let arabicFee = 0;
  let coranFee = 0;
  let sciencesFee = 0;

  const rows = Array.isArray(pricing.tariffRows) ? pricing.tariffRows : [];
  const hasCustomTariffRows = rows.length > 0 && rows.some((row) => row.price && Number(row.price) > 0);

  if (!enrollments || enrollments.length === 0) {
    const total = registrationFee + fraisPrelevement;
    return {
      registrationFee,
      fraisPrelevement,
      arabicFee: 0,
      coranFee: 0,
      sciencesFee: 0,
      total,
      arabicCount: 0,
      coranCount: 0,
      sciencesCount: 0,
      appliedPricing: pricing,
    };
  }

  const enrollmentsByPole = new Map();
  for (const enrollment of enrollments) {
    const poleKey = enrollment.poleId || String(enrollment.poleName || '').toLowerCase();
    const bucket = enrollmentsByPole.get(poleKey) || [];
    bucket.push(enrollment);
    enrollmentsByPole.set(poleKey, bucket);
  }

  // Count by pole for display
  const arabicCount = enrollments.filter((e) => String(e.poleName || '').toLowerCase().includes('arabe')).length + existingArabicCount;
  const coranCount = enrollments.filter((e) => String(e.poleName || '').toLowerCase().includes('coran')).length;
  const sciencesCount = enrollments.filter((e) => String(e.poleName || '').toLowerCase().includes('sciences') || String(e.poleName || '').toLowerCase().includes('science')).length;

  // If we have custom tariff rows, use the grid with family total counts
  if (hasCustomTariffRows) {
    for (const [poleKey, group] of enrollmentsByPole.entries()) {
      const sampleEnrollment = group[0];
      const matchingRows = getMatchingTariffRows(sampleEnrollment, pricing);

      // Get the TOTAL count for this pole (existing + new)
      const totalCountForPole = (totalFamilyEnrollmentsByPole[poleKey] || 0) + group.length;

      // Try tiered pricing based on TOTAL family count for this pole
      const tierRow = selectTieredTariffRow(matchingRows, totalCountForPole);
      if (tierRow && Number(tierRow.price) > 0) {
        const price = toNumber(tierRow.price, 0);
        const poleName = String(tierRow.poleName || sampleEnrollment.poleName || '').toLowerCase();
        if (poleName.includes('arabe')) {
          arabicFee += price;
        } else if (poleName.includes('coran')) {
          coranFee += price;
        } else if (poleName.includes('sciences') || poleName.includes('science')) {
          sciencesFee += price;
        } else {
          totalFee += price;
        }
        continue;
      }

      // Fallback: Individual pricing from tariff rows
      for (const enrollment of group) {
        const matchingRowsForEnrollment = getMatchingTariffRows(enrollment, pricing);
        const tariffRow = findBestTariffRowForEnrollment(enrollment, matchingRowsForEnrollment);
        if (tariffRow && Number(tariffRow.price) > 0) {
          const price = toNumber(tariffRow.price, 0);
          const poleName = String(tariffRow.poleName || enrollment.poleName || '').toLowerCase();
          if (poleName.includes('arabe')) {
            arabicFee += price;
          } else if (poleName.includes('coran')) {
            coranFee += price;
          } else if (poleName.includes('sciences') || poleName.includes('science')) {
            sciencesFee += price;
          } else {
            totalFee += price;
          }
        }
      }
    }
  } else {
    // Fallback to legacy pricing if no custom tariff rows
    for (const enrollment of enrollments) {
      const pole = (enrollment.poleName || '').toLowerCase();
      const coursePrice = toNumber(getIndividualCoursePrice(enrollment.levelCode, pricing), 0);
      if (pole.includes('arabe')) {
        arabicFee += coursePrice;
      } else if (pole.includes('coran')) {
        coranFee += coursePrice;
      } else if (pole.includes('sciences') || pole.includes('science')) {
        sciencesFee += coursePrice;
      } else {
        totalFee += coursePrice;
      }
    }
  }

  // Calculate Arabic fee based on count if no tariff rows were applied
  if (!hasCustomTariffRows && arabicCount > 0) {
    arabicFee = calculateArabicFee(arabicCount, pricing);
  }

  const total = registrationFee + arabicFee + coranFee + sciencesFee + totalFee;
  return {
    registrationFee,
    fraisPrelevement,
    arabicFee,
    coranFee,
    sciencesFee,
    total,
    arabicCount,
    coranCount,
    sciencesCount,
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

  const firstDueDate = new Date(startDate);
  firstDueDate.setDate(1);
  firstDueDate.setDate(Math.min(dayOfMonth, 28));
  if (firstDueDate < startDate) {
    firstDueDate.setMonth(firstDueDate.getMonth() + 1);
  }

  return parts.map((p, index) => {
    const dueDate = new Date(firstDueDate);
    dueDate.setMonth(dueDate.getMonth() + index);

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
  getMatchingTariffRows,
  findBestTariffRowForEnrollment,
  selectTieredTariffRow,
  calculateFamilyTotal,
  calculateInstallments,
  buildInstallmentSchedule,
};
