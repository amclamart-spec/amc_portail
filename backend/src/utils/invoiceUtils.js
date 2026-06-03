const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const {
  resolvePricingConfig,
  getMatchingTariffRows,
  findBestTariffRowForEnrollment,
  selectTieredTariffRow,
  getIndividualCoursePrice,
  calculateArabicFee,
} = require('../services/pricingService');

const prisma = new PrismaClient();
const uploadsDir = path.join(__dirname, '../../uploads/invoices');

function getEnrollmentCourseDetails(enrollment) {
  const cls = enrollment.class || {};
  const comment = String(enrollment.comment || '').trim();

  if (comment) {
    const provisionalMatch = comment.match(/Affectation provisoire\s*[-–—]\s*([^–—-]+?)(?:\s*[-–—]\s*|$)/i);
    if (provisionalMatch) {
      const rawLabel = provisionalMatch[1].trim();
      const parts = rawLabel.split(/\s*\/\s*/);
      if (parts.length === 2) {
        return {
          courseLabel: `${parts[0]} - ${parts[1]}`,
          levelLabel: parts[1] || '-',
          poleName: parts[0] || '',
          levelCode: parts[1] || '',
        };
      }
      return {
        courseLabel: rawLabel,
        levelLabel: '-',
        poleName: rawLabel,
        levelCode: '-',
      };
    }
  }

  const poleName = cls.level?.pole?.name || '';
  const levelName = cls.level?.name || '';
  const courseLabel = [poleName, levelName].filter(Boolean).join(' - ') || cls.room || cls.teacherName || 'Cours';
  const levelLabel = cls.level?.code || levelName || '-';

  return { courseLabel, levelLabel, poleName, levelCode: cls.level?.code || levelName || '' };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function computeEnrollmentAmounts(enrollments, pricing, paymentTotal) {
  const rows = enrollments.map((enrollment) => {
    const details = getEnrollmentCourseDetails(enrollment);
    return {
      enrollment,
      childName: normalizeText(`${enrollment.student?.firstName || ''} ${enrollment.student?.lastName || ''}`),
      courseLabel: details.courseLabel,
      levelLabel: details.levelLabel,
      poleName: normalizeText(details.poleName).toLowerCase(),
      levelCode: normalizeText(details.levelCode).toUpperCase(),
      poleId: enrollment.class?.level?.pole?.id || '',
      levelId: enrollment.class?.level?.id || '',
      amount: null,
    };
  });

  const arabicRows = rows.filter((row) => row.poleName.includes('arabe'));
  const hasCustomTariffRows = Array.isArray(pricing.tariffRows) && pricing.tariffRows.some((row) => Number(row.price) > 0);

  const grouped = new Map();
  rows.forEach((row) => {
    const key = row.poleId || row.poleName || 'other';
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  });

  for (const group of grouped.values()) {
    if (hasCustomTariffRows && group.length > 1) {
      const sample = group[0];
      const matchingRows = getMatchingTariffRows(sample, pricing);
      const tieredRow = selectTieredTariffRow(matchingRows, group.length);
      if (tieredRow && Number(tieredRow.price) > 0) {
        const shared = Number(tieredRow.price) / group.length;
        group.forEach((row) => { row.amount = shared; });
        continue;
      }
    }

    for (const row of group) {
      if (hasCustomTariffRows) {
        const matchingRows = getMatchingTariffRows(row, pricing);
        const tariffRow = findBestTariffRowForEnrollment(row, matchingRows);
        if (tariffRow && Number(tariffRow.price) > 0) {
          row.amount = Number(tariffRow.price);
          continue;
        }
      }

      if (row.poleName.includes('arabe')) {
        row.amount = null;
      } else {
        row.amount = getIndividualCoursePrice(row.levelCode, pricing);
      }
    }
  }

  if (!hasCustomTariffRows && arabicRows.length > 0) {
    const totalArabic = calculateArabicFee(arabicRows.length, pricing);
    const share = totalArabic / arabicRows.length;
    arabicRows.forEach((row) => { row.amount = share; });
  }

  const unmatchedRows = rows.filter((row) => row.amount === null || Number.isNaN(row.amount));
  if (unmatchedRows.length > 0 && paymentTotal && rows.length > 0) {
    const fallbackAmount = Number(paymentTotal) / rows.length;
    unmatchedRows.forEach((row) => { row.amount = fallbackAmount; });
  }

  return rows;
}

async function buildEnrollmentTableRows(enrollmentData, paymentData) {
  if (!Array.isArray(enrollmentData) || enrollmentData.length === 0) {
    return [];
  }

  const pricing = await resolvePricingConfig(prisma);
  return computeEnrollmentAmounts(enrollmentData, pricing, Number(paymentData.totalAmount || 0));
}

// Ensure invoices directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Generate invoice PDF for a completed payment
 * @param {Object} paymentData - Payment record with family, enrollments, etc.
 * @param {Object} familyData - Family record with user info
 * @param {Array} enrollmentData - Enrollment records with course details
 * @returns {Promise<{filePath: string, filename: string}>}
 */
async function generateInvoicePDF(paymentData, familyData, enrollmentData) {
  const enrollmentRows = await buildEnrollmentTableRows(enrollmentData, paymentData);

  return new Promise((resolve, reject) => {
    try {
      const filename = `recu-${paymentData.id}.pdf`;
      const filePath = path.join(uploadsDir, filename);

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const stream = fs.createWriteStream(filePath);

      doc.on('error', reject);
      stream.on('error', reject);
      stream.on('finish', () => {
        resolve({ filePath, filename, relativePath: `/uploads/invoices/${filename}` });
      });

      doc.pipe(stream);

      // Header with logos and title
      // Robust logo discovery: check multiple possible locations (frontend public, repo root public, uploads)
      let amcLogoPath = null;
      let partnerLogoPath = null;
      const possibleLogoPaths = [
        path.join(process.cwd(), '../frontend/public/amc_logo.png'),
        path.join(process.cwd(), '../../frontend/public/amc_logo.png'),
        path.join(__dirname, '../../../frontend/public/amc_logo.png'),
        path.join(__dirname, '../../uploads/amc_logo.png'),
      ];
      const possiblePartnerPaths = [
        path.join(process.cwd(), '../frontend/public/amc_logo_partner.png'),
        path.join(process.cwd(), '../../frontend/public/amc_logo_partner.png'),
        path.join(__dirname, '../../../frontend/public/amc_logo_partner.png'),
        path.join(__dirname, '../../uploads/amc_logo_partner.png'),
      ];

      for (const p of possibleLogoPaths) {
        if (fs.existsSync(p)) { amcLogoPath = p; break; }
      }
      for (const p of possiblePartnerPaths) {
        if (fs.existsSync(p)) { partnerLogoPath = p; break; }
      }

      // Render logos at fixed positions in the header (left and right)
      const headerY = 36;
      const logoMaxHeight = 48;
      const logoMaxWidth = 120;
      try {
        if (amcLogoPath) {
          doc.image(amcLogoPath, 50, headerY, { fit: [logoMaxWidth, logoMaxHeight], align: 'left' });
        }
        if (partnerLogoPath) {
          const rightX = doc.page.width - 50 - logoMaxWidth;
          doc.image(partnerLogoPath, rightX, headerY, { fit: [logoMaxWidth, logoMaxHeight], align: 'right' });
        }
      } catch (e) {
        // If image rendering fails, log to console for debugging but continue
        console.warn('invoiceUtils: erreur rendu logo', e?.message || e);
      }

      // Move cursor below logos for title and render titles without large extra spacing
      const titleY = headerY + logoMaxHeight + 6;
      doc.y = titleY;
      doc.fontSize(11).font('Helvetica-Bold').text('ASSOCIATION PARTAGE ET DES MUSULMANS DE CLAMART', { align: 'center' });
      doc.fontSize(9).font('Helvetica').text("Portail d'Inscription Scolaire", { align: 'center' });
      // Invoice title -> Reçu
      doc.moveDown(0.3);
      doc.fontSize(18).font('Helvetica-Bold').text('REÇU', { align: 'center' });
      doc.moveDown(0.6);

      // Invoice metadata
      const invoiceDate = new Date(paymentData.createdAt);
      doc.fontSize(9).font('Helvetica');
      doc.text(`Numéro de reçu: ${paymentData.id.substring(0, 8).toUpperCase()}`, { align: 'left' });
      doc.text(`Date: ${invoiceDate.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      doc.moveDown(0.5);

      // Two-column layout: Family info (left) and Payment info (right)
      const leftX = 40;
      const rightX = 290;
      const colWidth = 200;

      // Start content at current y
      const contentStartY = doc.y;

      // Family section (left) - use local y to avoid overlapping
      let yLeft = contentStartY;
      doc.fontSize(10).font('Helvetica-Bold').text('FAMILLE', leftX, yLeft);
      yLeft += 14;
      doc.fontSize(9).font('Helvetica').text(`${familyData.user.firstName} ${familyData.user.lastName}`, leftX, yLeft);
      yLeft += 12;
      if (familyData.familyName) { doc.text(familyData.familyName, leftX, yLeft); yLeft += 12; }
      if (familyData.addressLine1) { doc.text(`${familyData.addressLine1}`, leftX, yLeft); yLeft += 12; }
      if (familyData.addressLine2) { doc.text(familyData.addressLine2, leftX, yLeft); yLeft += 12; }
      if (familyData.postalCode || familyData.city) { doc.text(`${familyData.postalCode || ''} ${familyData.city || ''}`.trim(), leftX, yLeft); yLeft += 12; }
      if (familyData.phonePrimary) { doc.text(`Téléphone: ${familyData.phonePrimary}`, leftX, yLeft); yLeft += 14; }

      // Move cursor below the left column content
      const afterColumnsY = yLeft + 6;
      doc.y = afterColumnsY;
      doc.moveDown(0.5);

      // Enrollments table section
      doc.fontSize(10).font('Helvetica-Bold').text('INSCRIPTIONS');
      doc.moveDown(0.3);

      const tableY = doc.y;
      const tableX = 40;
      const tableWidth = 530;
      const cellHeight = 20;
      const col1Width = 220; // Child
      const col2Width = 220; // Course
      const col3Width = 90; // Tariff

      // Table header
      doc.rect(tableX, tableY, tableWidth, cellHeight).stroke();
      doc.fontSize(9).font('Helvetica-Bold').text('Élève', tableX + 5, tableY + 4, { width: col1Width - 10 });
      doc.text('Cours', tableX + col1Width + 5, tableY + 4, { width: col2Width - 10 });
      doc.text('Tarif', tableX + col1Width + col2Width + 5, tableY + 4, { width: col3Width - 10, align: 'right' });

      let currentY = tableY + cellHeight;

      enrollmentRows.forEach((row) => {
        if (currentY > doc.page.height - 100) {
          doc.addPage();
          currentY = 40;
        }

        doc.rect(tableX, currentY, tableWidth, cellHeight).stroke();
        doc.fontSize(8).font('Helvetica').text(row.childName || '-', tableX + 5, currentY + 4, { width: col1Width - 10 });
        doc.text(`${row.courseLabel} (${row.levelLabel})`, tableX + col1Width + 5, currentY + 4, { width: col2Width - 10 });
        doc.text(`${Number(row.amount || 0).toFixed(2)}€`, tableX + col1Width + col2Width + 5, currentY + 4, { width: col3Width - 10, align: 'right' });
        currentY += cellHeight;
      });

      const transactionSource = Array.isArray(paymentData.transactions) ? paymentData.transactions : [];
        const eligibleStatuses = new Set(['INITIATED', 'SUCCEEDED', 'COMPLETED', 'PAID']);
        const paymentTransactionsTotal = transactionSource
          .filter((tx) => {
            const status = String(tx.status);
            return status !== 'CANCELLED' && status !== 'FAILED' && eligibleStatuses.has(status);
          })
          .reduce((sum, tx) => sum + Number(tx.amount || tx.total || 0), 0);

        if (transactionSource.length > 0) {
          if (currentY > doc.page.height - 180) {
            doc.addPage();
            currentY = 40;
          }
          doc.moveDown(0.5);
          doc.fontSize(10).font('Helvetica-Bold').text('DÉTAILS DES PAIEMENTS', 40, currentY);
          currentY += 18;

          // Table header
          const txTableX = 40;
          const txTableWidth = 515;
          const txCellH = 18;
          const colDateW = 110;
          const colRefW = 120;
          const colMethodW = 90;
          const colAmountW = 95;
          const colStatusW = 100;

          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('Date', txTableX + 5, currentY + 4, { width: colDateW - 10 });
          doc.text('Référence', txTableX + colDateW + 5, currentY + 4, { width: colRefW - 10 });
          doc.text('Méthode', txTableX + colDateW + colRefW + 5, currentY + 4, { width: colMethodW - 10 });
          doc.text('Montant', txTableX + colDateW + colRefW + colMethodW + 5, currentY + 4, { width: colAmountW - 10, align: 'right' });
          doc.text('Statut', txTableX + colDateW + colRefW + colMethodW + colAmountW + 5, currentY + 4, { width: colStatusW - 10 });
          currentY += txCellH;

          doc.fontSize(9).font('Helvetica');
          transactionSource.forEach((tx) => {
            if (currentY > doc.page.height - 120) {
              doc.addPage();
              currentY = 40;
            }
            const dateStr = new Date(tx.processedAt || tx.createdAt).toLocaleDateString('fr-FR');
            doc.text(dateStr, txTableX + 5, currentY + 4, { width: colDateW - 10 });
            doc.text(tx.id || (tx.reference || '-'), txTableX + colDateW + 5, currentY + 4, { width: colRefW - 10 });
            doc.text(formatPaymentMethod(tx.method || tx.paymentMethod, tx.metadata), txTableX + colDateW + colRefW + 5, currentY + 4, { width: colMethodW - 10 });
            doc.text(`${Number(tx.amount || tx.total || 0).toFixed(2)}€`, txTableX + colDateW + colRefW + colMethodW + 5, currentY + 4, { width: colAmountW - 10, align: 'right' });
            const statusLabel = formatPaymentStatus(tx.status);
            doc.text(statusLabel, txTableX + colDateW + colRefW + colMethodW + colAmountW + 5, currentY + 4, { width: colStatusW - 10 });
            currentY += txCellH;
          });
          currentY += 8;
        }

      // Summary section
      currentY += 10;
      if (currentY > doc.page.height - 120) {
        doc.addPage();
        currentY = 40;
      }

      doc.fontSize(10).font('Helvetica-Bold').text('RÉSUMÉ', 40, currentY);
      currentY += 20;

      // Summary table
      const summaryX = 40;
      const summaryWidth = 200;
      const summaryLabelX = summaryX;
      const summaryAmountX = summaryX + 130;

      // Registration fee
      if (Number(paymentData.registrationFee) > 0) {
        doc.fontSize(9).font('Helvetica').text('Frais d\'inscription:', summaryLabelX, currentY);
        doc.text(`${Number(paymentData.registrationFee).toFixed(2)}€`, summaryAmountX, currentY, { align: 'right' });
        currentY += 18;
      }

      // Arabic course fee
      if (Number(paymentData.arabicFee) > 0) {
        doc.text('Cours Arabe:', summaryLabelX, currentY);
        doc.text(`${Number(paymentData.arabicFee).toFixed(2)}€`, summaryAmountX, currentY, { align: 'right' });
        currentY += 18;
      }

      // Quran/Science fee
      if (Number(paymentData.coranScienceFee) > 0) {
        doc.text('Coran & Sciences:', summaryLabelX, currentY);
        doc.text(`${Number(paymentData.coranScienceFee).toFixed(2)}€`, summaryAmountX, currentY, { align: 'right' });
        currentY += 18;
      }


      // Total
      currentY += 5;
      const finalTotal = transactionSource.length > 0 ? paymentTransactionsTotal : Number(paymentData.totalAmount);
      doc.rect(summaryLabelX - 5, currentY - 5, summaryWidth + 10, 25).stroke();
      doc.fontSize(10).font('Helvetica-Bold').text('TOTAL:', summaryLabelX, currentY);
      doc.text(`${finalTotal.toFixed(2)}€`, summaryAmountX, currentY, { align: 'right' });

      // Rappel administratif juste après le résumé
      currentY += 32;
      const reminderText = `Rappel : Aucun remboursement ne pourra être exigé un mois après le début des cours. Toute interruption de cours ou retard dans l'inscription ne diminue en rien les frais d'inscription (sauf exception). Sans le dépot d'un moyen de paiement ou d'une cauion, votre inscription ne pourra pas être validé par notre association.`;
      doc.fontSize(8).font('Helvetica').text(reminderText, 40, currentY, { align: 'center', width: 515 });
      currentY += 32;

      // Footer area - ensure there is space, otherwise add a page
      const footerTop = doc.page.height - 110;
      if (currentY > footerTop - 40) {
        doc.addPage();
        currentY = 40;
      }

      // Footer texts (no central partner logo)
      const footerY = doc.page.height - 90;
      doc.fontSize(9).font('Helvetica-Bold').text('Association PARTAGE • Portail AMC', 40, footerY, { align: 'center', width: 515 });
      doc.fontSize(8).font('Helvetica').text(
        'Ce reçu a été généré automatiquement par le portail d\'inscription scolaire AMC.',
        40,
        footerY + 18,
        { align: 'center', width: 515 }
      );
      doc.text(
        `Générée le ${new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        40,
        footerY + 34,
        { align: 'center', width: 515 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function formatPaymentStatus(status) {
  const statusMap = {
    COMPLETED: 'Payé',
    SUCCEEDED: 'Payé',
    PAID: 'Payé',
    CANCELLED: 'Annulé',
    FAILED: 'Échoué',
    PENDING: 'En attente',
    INITIATED: 'Initié',
    PROCESSING: 'En traitement',
    PARTIAL: 'Partiel',
    OVERDUE: 'En retard',
  };
  return statusMap[status] || status || '-';
}

function formatPaymentMethod(method, metadata = {}) {
  const methodMap = {
    PRELEVEMENT_BANCAIRE: 'Prélèvement',
    VIREMENT: 'Prélèvement',
    CB: 'Carte Bancaire',
    SEPA: 'Prélèvement SEPA',
    CHEQUE: 'Chèque',
    ESPECES: 'Espèces',
    STRIPE: 'Carte Bancaire (Stripe)',
    PAYPAL: 'PayPal',
  };

  return methodMap[method] || method || 'Non spécifié';
}

/**
 * Get invoice file path or URL for a payment
 * @param {string} paymentId
 * @returns {{filePath: string, filename: string, relativePath: string} | null}
 */
function getInvoiceFilePath(paymentId) {
  const filename = `recu-${paymentId}.pdf`;
  const filePath = path.join(uploadsDir, filename);

  if (fs.existsSync(filePath)) {
    return {
      filePath,
      filename,
      relativePath: `/uploads/invoices/${filename}`,
    };
  }
  return null;
}

/**
 * Delete invoice PDF file
 * @param {string} paymentId
 */
function deleteInvoiceFile(paymentId) {
  const filePath = path.join(uploadsDir, `recu-${paymentId}.pdf`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    console.error(`Erreur suppression reçu ${paymentId}:`, error);
  }
  return false;
}

module.exports = {
  generateInvoicePDF,
  getInvoiceFilePath,
  deleteInvoiceFile,
  formatPaymentMethod,
};
