/**
 * Service de calcul tarifaire AMC
 * Grille 2024-2025 (paramétrable)
 */

// Tarif dégressif Arabe selon nombre d'élèves
const ARABIC_PRICING = {
  1: 310,
  2: 570,
  3: 750,
  4: 900,
  5: 1050,
};
const ARABIC_EXTRA_PER_STUDENT = 150; // Au-delà de 5

// Tarifs individuels Coran & Sciences
const INDIVIDUAL_PRICING = {
  CORAN_ENFANT: 220,
  CORAN_ADULTE_HOMME: 300,
  CORAN_ADULTE_FEMME: 250,
  SCIENCES_ISLAMIQUES: 300,
};

const REGISTRATION_FEE = 10; // Par famille, par an

function calculateArabicFee(numberOfStudentsInArabic) {
  if (numberOfStudentsInArabic <= 0) return 0;
  if (numberOfStudentsInArabic <= 5) {
    return ARABIC_PRICING[numberOfStudentsInArabic];
  }
  return ARABIC_PRICING[5] + (numberOfStudentsInArabic - 5) * ARABIC_EXTRA_PER_STUDENT;
}

function calculateFamilyTotal(enrollments) {
  // enrollments: array of { levelCode, poleName }
  let arabicCount = 0;
  let coranScienceTotal = 0;

  for (const enrollment of enrollments) {
    if (enrollment.poleName === "Cours d'Arabe") {
      arabicCount++;
    } else {
      const code = enrollment.levelCode;
      if (INDIVIDUAL_PRICING[code]) {
        coranScienceTotal += INDIVIDUAL_PRICING[code];
      }
    }
  }

  const arabicFee = calculateArabicFee(arabicCount);
  const total = REGISTRATION_FEE + arabicFee + coranScienceTotal;

  return {
    registrationFee: REGISTRATION_FEE,
    arabicFee,
    arabicCount,
    coranScienceFee: coranScienceTotal,
    total,
  };
}

function calculateInstallments(totalAmount, numberOfInstallments) {
  if (numberOfInstallments < 1 || numberOfInstallments > 8) {
    throw new Error('Le nombre de mensualités doit être entre 1 et 8');
  }
  const baseAmount = Math.floor((totalAmount / numberOfInstallments) * 100) / 100;
  const remainder = Math.round((totalAmount - baseAmount * numberOfInstallments) * 100) / 100;

  const installments = [];
  for (let i = 0; i < numberOfInstallments; i++) {
    installments.push({
      number: i + 1,
      amount: i === numberOfInstallments - 1 ? baseAmount + remainder : baseAmount,
    });
  }
  return installments;
}

module.exports = {
  REGISTRATION_FEE,
  ARABIC_PRICING,
  INDIVIDUAL_PRICING,
  calculateArabicFee,
  calculateFamilyTotal,
  calculateInstallments,
};
