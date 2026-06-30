const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
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
          scheduleLabel: [cls.dayOfWeek, cls.startTime && cls.endTime ? `${cls.startTime}-${cls.endTime}` : cls.startTime || cls.endTime || ''].filter(Boolean).join(' ') || '-',
        };
      }
      return {
        courseLabel: rawLabel,
        levelLabel: '-',
        poleName: rawLabel,
        levelCode: '-',
        scheduleLabel: [cls.dayOfWeek, cls.startTime && cls.endTime ? `${cls.startTime}-${cls.endTime}` : cls.startTime || cls.endTime || ''].filter(Boolean).join(' ') || '-',
      };
    }
  }

  const poleName = cls.level?.pole?.name || '';
  const levelName = cls.level?.name || '';
  const courseLabel = [poleName, levelName].filter(Boolean).join(' - ') || cls.room || cls.teacherName || 'Cours';
  const levelLabel = cls.level?.code || levelName || '-';

  return { courseLabel, levelLabel, poleName, levelCode: cls.level?.code || levelName || '', scheduleLabel: [cls.dayOfWeek, cls.startTime && cls.endTime ? `${cls.startTime}-${cls.endTime}` : cls.startTime || cls.endTime || ''].filter(Boolean).join(' ') || '-' };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function ensureMetadataObject(maybe) {
  if (!maybe) return {};
  if (typeof maybe === 'object') return maybe;
  if (typeof maybe === 'string') {
    try {
      const parsed = JSON.parse(maybe);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch (e) {
      return {};
    }
  }
  return {};
}

function formatDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).trim();
  return date.toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function normalizeBankValue(value) {
  if (!value) return '';
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatBankIbanForDisplay(value) {
  const cleaned = normalizeBankValue(value);
  return cleaned.replace(/(.{4})/g, '$1 ').trim();
}

function formatBankSwiftForDisplay(value) {
  return normalizeBankValue(value);
}

function formatPaymentMethod(method, metadata = {}) {
  const sourceMethod = method || metadata.paymentPlanType || metadata.method || metadata.paymentMethod;
  const methodMap = {
    PRELEVEMENT_BANCAIRE: 'Prélèvement',
    VIREMENT: 'Prélèvement',
    SEPA: 'Prélèvement SEPA',
    CB: 'Carte Bancaire',
    ESPECES: 'Espèces',
    STRIPE: 'Stripe',
    STRIPE_CARD: 'Carte Bancaire',
    STRIPE_SEPA: 'Prélèvement SEPA',
    PAYPAL: 'PayPal',
    CHEQUE: 'Chèque',
  };

  return methodMap[sourceMethod] || String(sourceMethod || 'Non spécifié');
}

function getPaymentDetails(paymentData) {
  const metadata = ensureMetadataObject(paymentData.metadata);
  const methodKey = paymentData.paymentMethod || paymentData.method || metadata.paymentPlanType || metadata.method || metadata.paymentMethod;
  const paymentMethodLabel = formatPaymentMethod(methodKey, metadata);
  const details = [
    { label: 'Mode de paiement', value: paymentMethodLabel },
  ];

  const directDebitInstallments = Number(paymentData.numberOfInstallments || metadata.bankDebitInstallmentsCount || 0) || 0;
  const chequeInstallments = Number(metadata.chequeInstallmentsCount || 0) || 0;
  const isDirectDebit = methodKey === 'PRELEVEMENT_BANCAIRE' || methodKey === 'VIREMENT' || metadata.paymentPlanType === 'PRELEVEMENT_BANCAIRE' || metadata.method === 'VIREMENT';
  const isCheque = methodKey === 'CHEQUE';

  if (isDirectDebit) {
    if (directDebitInstallments > 0) {
      details.push({ label: 'Nombre d\'echances', value: String(directDebitInstallments) });
    }
    if (metadata.firstPaymentDate) {
      details.push({ label: 'Date première échéance', value: formatDateValue(metadata.firstPaymentDate) || metadata.firstPaymentDate });
    }
    if (metadata.bankDebitDay !== undefined && metadata.bankDebitDay !== null) {
      details.push({ label: 'Jour prélèvement', value: String(metadata.bankDebitDay) });
    }
    if (metadata.bankDebitIban) {
      details.push({ label: 'IBAN', value: metadata.bankDebitIban });
    }
    if (metadata.bankDebitSwift) {
      details.push({ label: 'SWIFT', value: metadata.bankDebitSwift });
    }
  }

  if (isCheque) {
    if (chequeInstallments > 0) {
      details.push({ label: 'Nombre de cheques', value: String(chequeInstallments) });
    }
    if (metadata.chequeFirstPaymentDate) {
      details.push({ label: 'Date depot cheque', value: formatDateValue(metadata.chequeFirstPaymentDate) || metadata.chequeFirstPaymentDate });
    }
    if (metadata.chequeDepositDay !== undefined && metadata.chequeDepositDay !== null) {
      details.push({ label: 'Jour de depot', value: String(metadata.chequeDepositDay) });
    }
  }

  return details;
}

function getTransactionScheduleRecord(transaction = {}) {
  const paymentMetadata = ensureMetadataObject(transaction.paymentMetadata);
  const metadata = ensureMetadataObject(transaction.metadata);
  const mergedMetadata = { ...paymentMetadata, ...metadata };
  const methodKey = String(
    transaction.method
    || transaction.paymentMethod
    || mergedMetadata.paymentMethod
    || mergedMetadata.checkoutMethod
    || mergedMetadata.method
    || mergedMetadata.paymentPlanType
    || ''
  ).toUpperCase();

  const isDirectDebit = methodKey === 'PRELEVEMENT_BANCAIRE'
    || methodKey === 'VIREMENT'
    || methodKey === 'STRIPE_SEPA'
    || methodKey === 'GO_CARDLESS_SEPA'
    || methodKey === 'SEPA';
  const isCheque = methodKey === 'CHEQUE';

  if (!isDirectDebit && !isCheque) {
    return null;
  }

  const installmentsCount = transaction.paymentInstallmentsCount
    || mergedMetadata.bankDebitInstallmentsCount
    || mergedMetadata.chequeInstallmentsCount
    || mergedMetadata.chequeCount
    || mergedMetadata.numberOfInstallments
    || mergedMetadata.installmentsCount
    || transaction.numberOfInstallments
    || transaction.installmentsCount;

  const bankDebitDay = mergedMetadata.bankDebitDay || transaction.scheduleDay || transaction.bankDebitDay;
  const bankDebitFirstPaymentDate = mergedMetadata.firstPaymentDate || transaction.firstPaymentDate;
  const chequeDepositDay = mergedMetadata.chequeDepositDay || mergedMetadata.bankDebitDay || transaction.scheduleDay || transaction.chequeDepositDay;
  const chequeFirstPaymentDate = mergedMetadata.chequeFirstPaymentDate || mergedMetadata.firstPaymentDate || transaction.firstPaymentDate || transaction.chequeFirstPaymentDate;

  if (isCheque) {
    return {
      type: 'Chèque',
      scheduleDate: formatDateValue(chequeFirstPaymentDate) || '—',
      scheduleDay: chequeDepositDay !== undefined && chequeDepositDay !== null ? String(chequeDepositDay) : '—',
      count: installmentsCount !== undefined && installmentsCount !== null ? String(installmentsCount) : '—',
      bankInfo: '—',
    };
  }

  return {
    type: 'Prélèvement',
    scheduleDate: formatDateValue(bankDebitFirstPaymentDate) || '—',
    scheduleDay: bankDebitDay !== undefined && bankDebitDay !== null ? String(bankDebitDay) : '—',
    count: installmentsCount !== undefined && installmentsCount !== null ? String(installmentsCount) : '—',
    bankInfo: `IBAN: ${formatBankIbanForDisplay(mergedMetadata.bankDebitIban || transaction.bankDebitIban) || '—'} / SWIFT: ${formatBankSwiftForDisplay(mergedMetadata.bankDebitSwift || transaction.bankDebitSwift) || '—'}`,
  };
}

function buildEnrollmentTableRows(enrollmentData) {
  if (!Array.isArray(enrollmentData) || enrollmentData.length === 0) {
    return [];
  }

  const filteredEnrollments = enrollmentData.filter((enrollment) => String(enrollment?.status || '').toUpperCase() === 'CONFIRMED');
  if (filteredEnrollments.length === 0) {
    return [];
  }

  return filteredEnrollments.map((enrollment) => {
    const details = getEnrollmentCourseDetails(enrollment);
    return {
      childName: normalizeText(`${enrollment.student?.firstName || ''} ${enrollment.student?.lastName || ''}`),
      courseLabel: details.courseLabel,
      levelLabel: details.levelLabel,
      scheduleLabel: details.scheduleLabel || '-',
    };
  });
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
async function generateInvoicePDF(paymentData, familyData, enrollmentData, paymentTransactions = [], refunds = []) {
  const enrollmentRows = buildEnrollmentTableRows(enrollmentData);

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
      doc.moveDown(0.3);

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

      // Payer name (if available) just below family info
      const payerName = normalizeText(
        paymentData.payerName
        || paymentData.payer
        || paymentData.payerFullName
        || (Array.isArray(paymentTransactions) && paymentTransactions[0] && (paymentTransactions[0].payerName || paymentTransactions[0].payer))
        || ''
      );
      if (payerName) {
        doc.fontSize(9).font('Helvetica-Bold').text(`Nom Payeur: ${payerName}`, leftX, yLeft);
        doc.font('Helvetica');
        yLeft += 16;
      }

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
      const col1Width = 170;
      const col2Width = 240;
      const col3Width = 120;

      // Table header
      doc.rect(tableX, tableY, tableWidth, cellHeight).stroke();
      doc.fontSize(9).font('Helvetica-Bold').text('Élève', tableX + 5, tableY + 4, { width: col1Width - 10 });
      doc.text('Cours', tableX + col1Width + 5, tableY + 4, { width: col2Width - 10 });
      doc.text('Horaire', tableX + col1Width + col2Width + 5, tableY + 4, { width: col3Width - 10 });

      let currentY = tableY + cellHeight;

      enrollmentRows.forEach((row) => {
        if (currentY > doc.page.height - 100) {
          doc.addPage();
          currentY = 40;
        }

        doc.rect(tableX, currentY, tableWidth, cellHeight).stroke();
        doc.fontSize(8).font('Helvetica').text(row.childName || '-', tableX + 5, currentY + 4, { width: col1Width - 10 });
        doc.text(`${row.courseLabel} (${row.levelLabel})`, tableX + col1Width + 5, currentY + 4, { width: col2Width - 10 });
        doc.text(row.scheduleLabel || '-', tableX + col1Width + col2Width + 5, currentY + 4, { width: col3Width - 10 });
        currentY += cellHeight;
      });

      const transactionSource = Array.isArray(paymentTransactions) ? paymentTransactions : [];
      const isChequeOrDirectDebitTransaction = (tx = {}) => {
        const paymentMetadata = tx.paymentMetadata || {};
        const metadata = tx.metadata || {};
        const mergedMetadata = { ...paymentMetadata, ...metadata };
        const methodKey = String(
          tx.method
          || tx.paymentMethod
          || mergedMetadata.paymentMethod
          || mergedMetadata.checkoutMethod
          || mergedMetadata.method
          || mergedMetadata.paymentPlanType
          || ''
        ).toUpperCase();

        return methodKey === 'CHEQUE'
          || methodKey === 'PRELEVEMENT_BANCAIRE'
          || methodKey === 'VIREMENT'
          || methodKey === 'STRIPE_SEPA'
          || methodKey === 'GO_CARDLESS_SEPA'
          || methodKey === 'SEPA';
      };
      const paymentTransactionsTotal = transactionSource
        .filter((tx) => {
          const status = String(tx.status || '').trim().toUpperCase();
          return status !== 'CANCELLED' && status !== 'ANNULÉ' && status !== 'ANNULE';
        })
        .reduce((sum, tx) => sum + Number(tx.amount || tx.total || 0), 0);

      const detailTransactions = transactionSource.filter((tx) => !isChequeOrDirectDebitTransaction(tx));
      const shouldShowTransactionTable = detailTransactions.length > 0;
      const scheduleRows = transactionSource
        .filter((tx) => {
          const status = String(tx.status || '').trim().toUpperCase();
          return status !== 'CANCELLED' && status !== 'ANNULÉ' && status !== 'ANNULE';
        })
        .map((tx) => ({ tx, record: getTransactionScheduleRecord(tx) }))
        .filter((item) => item.record);

      if (shouldShowTransactionTable) {
        if (currentY > doc.page.height - 180) {
          doc.addPage();
          currentY = 40;
        }

        currentY += 10;
        doc.fontSize(10).font('Helvetica-Bold').text('DÉTAILS DES PAIEMENTS', 40, currentY);
        currentY += 18;

        if (shouldShowTransactionTable) {
          if (currentY > doc.page.height - 180) {
            doc.addPage();
            currentY = 40;
          }

          const txTableX = 40;
          const txCellH = 18;
          const colDateW = 95;
          const colMethodW = 95;
          const colAmountW = 90;
          const colStatusW = 90;
          const colDescriptionW = 160;

          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('Date', txTableX + 5, currentY + 4, { width: colDateW - 10 });
          doc.text('Méthode', txTableX + colDateW + 5, currentY + 4, { width: colMethodW - 10 });
          doc.text('Montant', txTableX + colDateW + colMethodW + 5, currentY + 4, { width: colAmountW - 10, align: 'right' });
          doc.text('Statut', txTableX + colDateW + colMethodW + colAmountW + 5, currentY + 4, { width: colStatusW - 10 });
          doc.text('Description', txTableX + colDateW + colMethodW + colAmountW + colStatusW + 5, currentY + 4, { width: colDescriptionW - 10 });
          currentY += txCellH;

          doc.fontSize(9).font('Helvetica');
          detailTransactions.forEach((tx) => {
            if (currentY > doc.page.height - 120) {
              doc.addPage();
              currentY = 40;
            }
            const dateStr = new Date(tx.processedAt || tx.createdAt).toLocaleDateString('fr-FR');
            const rawDescription = String(tx.description || tx.metadata?.comment || '').trim();
            const normalizedDescription = rawDescription.toLowerCase();
            const hasGenericAdminDescription = normalizedDescription === 'paiement ajouté par admin'
              || normalizedDescription === 'paiement ajoute par admin';
            const descriptionText = !hasGenericAdminDescription && rawDescription ? rawDescription : '-';
            const descriptionHeight = doc.heightOfString(descriptionText, { width: colDescriptionW - 10 });
            const rowHeight = Math.max(txCellH, Math.ceil(descriptionHeight + 8));

            doc.text(dateStr, txTableX + 5, currentY + 4, { width: colDateW - 10 });
            doc.text(formatPaymentMethod(tx.method || tx.paymentMethod, tx.paymentMetadata || tx.metadata), txTableX + colDateW + 5, currentY + 4, { width: colMethodW - 10 });
            doc.text(`${Number(tx.amount || tx.total || 0).toFixed(2)}€`, txTableX + colDateW + colMethodW + 5, currentY + 4, { width: colAmountW - 10, align: 'right' });
            const statusLabel = formatPaymentStatus(tx.status);
            doc.text(statusLabel, txTableX + colDateW + colMethodW + colAmountW + 5, currentY + 4, { width: colStatusW - 10 });
            doc.text(descriptionText, txTableX + colDateW + colMethodW + colAmountW + colStatusW + 5, currentY + 4, { width: colDescriptionW - 10 });
            currentY += rowHeight;
          });
          currentY += 16;

          if (scheduleRows.length > 0) {
            if (currentY > doc.page.height - 180) {
              doc.addPage();
              currentY = 40;
            }

            doc.fontSize(10).font('Helvetica-Bold').text('ÉCHÉANCES PRÉLÈVEMENT / CHÈQUE', 40, currentY);
            currentY += 18;

            const scTableX = 40;
            const scHeaderH = 36;
            const scRowH = 18;
            // Adjusted widths: make IBAN/SWIFT wider, reduce other columns
            const scTypeW = 70;
            const scDateW = 100;
            const scDayW = 80;
            const scCountW = 80;
            const scBankW = 200;
            const scTableW = scTypeW + scDateW + scDayW + scCountW + scBankW;

            // Header with border
            doc.fontSize(9).font('Helvetica-Bold');
            doc.rect(scTableX, currentY, scTableW, scHeaderH).stroke();
            doc.text('Type', scTableX + 5, currentY + 4, { width: scTypeW - 10 });
            doc.text('Date dépôt/prélèvement', scTableX + scTypeW + 5, currentY + 4, { width: scDateW - 10 });
            doc.text('Jour dépôt/prélèvement', scTableX + scTypeW + scDateW + 5, currentY + 4, { width: scDayW - 10 });
            doc.text('Nombre chèque/échéances', scTableX + scTypeW + scDateW + scDayW + 5, currentY + 4, { width: scCountW - 10 });
            doc.text('IBAN/SWIFT', scTableX + scTypeW + scDateW + scDayW + scCountW + 5, currentY + 4, { width: scBankW - 10 });
            currentY += scHeaderH;

            doc.fontSize(8.5).font('Helvetica');
            scheduleRows.forEach(({ record }) => {
              if (currentY > doc.page.height - 120) {
                doc.addPage();
                currentY = 40;
              }

              const bankInfoHeight = doc.heightOfString(record.bankInfo || '—', { width: scBankW - 10 });
              const rowHeight = Math.max(scRowH, Math.ceil(bankInfoHeight + 8));

              // Row border
              doc.rect(scTableX, currentY, scTableW, rowHeight).stroke();

              doc.text(record.type, scTableX + 5, currentY + 4, { width: scTypeW - 10 });
              doc.text(record.scheduleDate, scTableX + scTypeW + 5, currentY + 4, { width: scDateW - 10 });
              doc.text(record.scheduleDay, scTableX + scTypeW + scDateW + 5, currentY + 4, { width: scDayW - 10 });
              doc.text(record.count, scTableX + scTypeW + scDateW + scDayW + 5, currentY + 4, { width: scCountW - 10 });
              doc.text(record.bankInfo || '—', scTableX + scTypeW + scDateW + scDayW + scCountW + 5, currentY + 4, { width: scBankW - 10 });
              currentY += rowHeight;
            });
            currentY += 8;
          }
        }
      }

      if (scheduleRows.length > 0 && !shouldShowTransactionTable) {
        if (currentY > doc.page.height - 180) {
          doc.addPage();
          currentY = 40;
        }

        currentY += 10;
        doc.fontSize(10).font('Helvetica-Bold').text('ÉCHÉANCES PRÉLÈVEMENT / CHÈQUE', 40, currentY);
        currentY += 18;

        const scTableX = 40;
        const scHeaderH = 36;
        const scRowH = 18;
        const scTypeW = 70;
        const scDateW = 100;
        const scDayW = 80;
        const scCountW = 80;
        const scBankW = 200;
        const scTableW = scTypeW + scDateW + scDayW + scCountW + scBankW;

        // Header with border
        doc.fontSize(9).font('Helvetica-Bold');
        doc.rect(scTableX, currentY, scTableW, scHeaderH).stroke();
        doc.text('Type', scTableX + 5, currentY + 4, { width: scTypeW - 10 });
        doc.text('Date dépôt/prélèvement', scTableX + scTypeW + 5, currentY + 4, { width: scDateW - 10 });
        doc.text('Jour dépôt/prélèvement', scTableX + scTypeW + scDateW + 5, currentY + 4, { width: scDayW - 10 });
        doc.text('Nombre chèque/échéances', scTableX + scTypeW + scDateW + scDayW + 5, currentY + 4, { width: scCountW - 10 });
        doc.text('IBAN/SWIFT', scTableX + scTypeW + scDateW + scDayW + scCountW + 5, currentY + 4, { width: scBankW - 10 });
        currentY += scHeaderH;

        doc.fontSize(8.5).font('Helvetica');
        scheduleRows.forEach(({ record }) => {
          if (currentY > doc.page.height - 120) {
            doc.addPage();
            currentY = 40;
          }

          const bankInfoHeight = doc.heightOfString(record.bankInfo || '—', { width: scBankW - 10 });
          const rowHeight = Math.max(scRowH, Math.ceil(bankInfoHeight + 8));

          // Row border
          doc.rect(scTableX, currentY, scTableW, rowHeight).stroke();

          doc.text(record.type, scTableX + 5, currentY + 4, { width: scTypeW - 10 });
          doc.text(record.scheduleDate, scTableX + scTypeW + 5, currentY + 4, { width: scDateW - 10 });
          doc.text(record.scheduleDay, scTableX + scTypeW + scDateW + 5, currentY + 4, { width: scDayW - 10 });
          doc.text(record.count, scTableX + scTypeW + scDateW + scDayW + 5, currentY + 4, { width: scCountW - 10 });
          doc.text(record.bankInfo || '—', scTableX + scTypeW + scDateW + scDayW + scCountW + 5, currentY + 4, { width: scBankW - 10 });
          currentY += rowHeight;
        });
        currentY += 8;
      }

      const refundRows = Array.isArray(refunds) ? refunds : [];
      const refundsTotal = refundRows.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);

      if (refundRows.length > 0) {
        if (currentY > doc.page.height - 180) {
          doc.addPage();
          currentY = 40;
        }

        currentY += 10;
        doc.fontSize(10).font('Helvetica-Bold').text('REMBOURSEMENT', 40, currentY);
        currentY += 18;

        const rfTableX = 40;
        const rfCellH = 18;
        const rfDateW = 95;
        const rfAmountW = 95;
        const rfReasonW = 340;

        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Date', rfTableX + 5, currentY + 4, { width: rfDateW - 10 });
        doc.text('Montant', rfTableX + rfDateW + 5, currentY + 4, { width: rfAmountW - 10, align: 'right' });
        doc.text('Motif', rfTableX + rfDateW + rfAmountW + 5, currentY + 4, { width: rfReasonW - 10 });
        currentY += rfCellH;

        doc.fontSize(9).font('Helvetica');
        refundRows.forEach((refund) => {
          if (currentY > doc.page.height - 120) {
            doc.addPage();
            currentY = 40;
          }
          const dateStr = formatDateValue(refund.processedAt || refund.createdAt) || '-';
          const reasonText = normalizeText(refund.reason) || '-';
          const reasonHeight = doc.heightOfString(reasonText, { width: rfReasonW - 10 });
          const rowHeight = Math.max(rfCellH, Math.ceil(reasonHeight + 8));

          doc.text(dateStr, rfTableX + 5, currentY + 4, { width: rfDateW - 10 });
          doc.text(`-${Number(refund.amount || 0).toFixed(2)}€`, rfTableX + rfDateW + 5, currentY + 4, { width: rfAmountW - 10, align: 'right' });
          doc.text(reasonText, rfTableX + rfDateW + rfAmountW + 5, currentY + 4, { width: rfReasonW - 10 });
          currentY += rowHeight;
        });
        currentY += 8;
      }

      currentY += 10;
      if (currentY > doc.page.height - 120) {
        doc.addPage();
        currentY = 40;
      }

      const totalX = 40;
      const totalWidth = 200;
      const totalLabelX = totalX;
      const totalAmountX = totalX + 130;
      const finalTotal = paymentTransactionsTotal - refundsTotal;

      doc.rect(totalLabelX - 5, currentY - 5, totalWidth + 10, 25).stroke();
      doc.fontSize(10).font('Helvetica-Bold').text('TOTAL:', totalLabelX, currentY);
      doc.text(`${finalTotal.toFixed(2)}€`, totalAmountX, currentY, { align: 'right' });

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
