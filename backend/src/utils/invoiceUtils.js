const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '../../uploads/invoices');

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
      // Try to locate AMC and PARTAGE logos
      let amcLogoPath = null;
      let partnerLogoPath = null;
      const possibleLogoPaths = [
        path.join(process.cwd(), 'frontend/public/amc_logo.png'),
        path.join(process.cwd(), 'frontend/public/amc_logo.png'),
        path.join(__dirname, '../../uploads/logo.png'),
      ];
      const possiblePartnerPaths = [
        path.join(process.cwd(), 'frontend/public/amc_logo_partner.png'),
        path.join(__dirname, '../../uploads/amc_logo_partner.png'),
      ];

      for (const p of possibleLogoPaths) {
        if (fs.existsSync(p)) { amcLogoPath = p; break; }
      }
      for (const p of possiblePartnerPaths) {
        if (fs.existsSync(p)) { partnerLogoPath = p; break; }
      }

      const headerTop = doc.y;
      const logoWidth = 100;
      try {
        if (amcLogoPath) {
          doc.image(amcLogoPath, 60, doc.y, { width: logoWidth });
        }
        if (partnerLogoPath) {
          const rightX = doc.page.width - 60 - logoWidth;
          doc.image(partnerLogoPath, rightX, doc.y, { width: logoWidth });
        }
      } catch (e) {
        // ignore image rendering errors
      }

      // Title centered below logos
      doc.moveDown(4);
      doc.fontSize(11).font('Helvetica-Bold').text('ASSOCIATION PARTAGE ET DES MUSULMANS DE CLAMART', { align: 'center' });
      doc.fontSize(9).font('Helvetica').text("Portail d'Inscription Scolaire", { align: 'center' });
      doc.moveDown(0.5);

      // Invoice title -> Reçu
      doc.fontSize(18).font('Helvetica-Bold').text('REÇU', { align: 'center' });
      doc.moveDown(0.3);

      // Invoice metadata
      const invoiceDate = new Date(paymentData.createdAt);
      doc.fontSize(9).font('Helvetica');
      doc.text(`Numéro de reçu: ${paymentData.id.substring(0, 8).toUpperCase()}`, { align: 'left' });
      doc.text(`Date: ${invoiceDate.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      doc.moveDown(1);

      // Two-column layout: Family info (left) and Payment info (right)
      const leftX = 40;
      const rightX = 290;
      const colWidth = 200;

      // Family section (left)
      doc.fontSize(10).font('Helvetica-Bold').text('FAMILLE', leftX, doc.y);
      doc.fontSize(9).font('Helvetica');
      doc.text(`${familyData.user.firstName} ${familyData.user.lastName}`, leftX, doc.y + 16);
      doc.text(familyData.familyName, leftX, doc.y);
      doc.text(`${familyData.addressLine1}`, leftX, doc.y);
      if (familyData.addressLine2) {
        doc.text(familyData.addressLine2, leftX, doc.y);
      }
      doc.text(`${familyData.postalCode} ${familyData.city}`, leftX, doc.y);
      doc.text(`Téléphone: ${familyData.phonePrimary}`, leftX, doc.y);

      // Payment section (right)
      const paymentY = doc.y - 50;
      doc.fontSize(10).font('Helvetica-Bold').text('DÉTAILS DU PAIEMENT', rightX, paymentY);
      doc.fontSize(9).font('Helvetica');
      doc.text(`Statut: ${paymentData.status === 'COMPLETED' ? 'PAYÉ' : paymentData.status}`, rightX, paymentY + 16);
      doc.text(`Méthode: ${formatPaymentMethod(paymentData.paymentMethod)}`, rightX, paymentY + 32);
      doc.text(`Montant: ${Number(paymentData.totalAmount).toFixed(2)}€`, rightX, paymentY + 48, { font: 'Helvetica-Bold' });
      // Afficher le nom du payeur s'il est disponible
      const payerName = paymentData.payerName || familyData.familyName || `${familyData.user.firstName} ${familyData.user.lastName}`;
      doc.text(`Payeur: ${payerName}`, rightX, paymentY + 64);

      doc.moveDown(5);

      // Courses/Enrollments section
      doc.fontSize(10).font('Helvetica-Bold').text('COURS INSCRITS');
      doc.moveDown(0.3);

      const tableY = doc.y;
      const tableX = 40;
      const tableWidth = 530;
      const cellHeight = 20;
      const col1Width = 250; // Course name
      const col2Width = 140; // Level
      const col3Width = 140; // Amount

      // Table header
      doc.rect(tableX, tableY, tableWidth, cellHeight).stroke();
      doc.fontSize(9).font('Helvetica-Bold').text('Cours', tableX + 5, tableY + 4, { width: col1Width - 10 });
      doc.text('Niveau', tableX + col1Width + 5, tableY + 4, { width: col2Width - 10 });
      doc.text('Montant', tableX + col1Width + col2Width + 5, tableY + 4, { width: col3Width - 10, align: 'right' });

      let currentY = tableY + cellHeight;
      let totalEnrollmentAmount = 0;

      if (enrollmentData && enrollmentData.length > 0) {
        enrollmentData.forEach((enrollment) => {
          if (currentY > doc.page.height - 100) {
            doc.addPage();
            currentY = 40;
          }

          const courseNameLine = `${enrollment.class?.level?.pole?.name || '-'} - ${enrollment.class?.level?.name || '-'}`;
          doc.rect(tableX, currentY, tableWidth, cellHeight).stroke();
          doc.fontSize(8).font('Helvetica').text(courseNameLine, tableX + 5, currentY + 4, { width: col1Width - 10 });
          doc.text(enrollment.class?.level?.code || '-', tableX + col1Width + 5, currentY + 4, { width: col2Width - 10 });

          // Calculate the individual enrollment fee (total / enrollment count as approximation)
          const enrollmentAmount = Number(paymentData.totalAmount) / Math.max(enrollmentData.length, 1);
          doc.text(`${enrollmentAmount.toFixed(2)}€`, tableX + col1Width + col2Width + 5, currentY + 4, {
            width: col3Width - 10,
            align: 'right',
          });

          totalEnrollmentAmount += enrollmentAmount;
          currentY += cellHeight;
        });
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
      doc.rect(summaryLabelX - 5, currentY - 5, summaryWidth + 10, 25).stroke();
      doc.fontSize(10).font('Helvetica-Bold').text('TOTAL:', summaryLabelX, currentY);
      doc.text(`${Number(paymentData.totalAmount).toFixed(2)}€`, summaryAmountX, currentY, { align: 'right' });

      // Footer with PARTAGE branding (Reçu)
      currentY = doc.page.height - 110;
      try {
        if (partnerLogoPath) {
          const pLogoW = 80;
          const pX = (doc.page.width / 2) - (pLogoW / 2);
          doc.image(partnerLogoPath, pX, currentY - 20, { width: pLogoW });
        }
      } catch (e) {
        // ignore
      }
      doc.fontSize(9).font('Helvetica-Bold').text('Association PARTAGE • Portail AMC', 40, currentY + 30, { align: 'center', width: 515 });
      doc.fontSize(8).font('Helvetica').text(
        'Ce reçu a été généré automatiquement par le portail d\'inscription scolaire AMC.',
        40,
        currentY + 48,
        { align: 'center', width: 515 }
      );
      doc.text(
        `Générée le ${new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        40,
        currentY + 62,
        { align: 'center', width: 515 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function formatPaymentMethod(method) {
  const methodMap = {
    CB: 'Carte Bancaire',
    SEPA: 'Prélèvement SEPA',
    CHEQUE: 'Chèque',
    ESPECES: 'Espèces',
    VIREMENT: 'Virement',
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
