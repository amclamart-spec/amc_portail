const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { PrismaClient } = require('@prisma/client');
const { sendMail } = require('../services/emailService');
const { createActivityLog } = require('../services/activityLogService');

const prisma = new PrismaClient();

const STUDENT_COLUMN_LABELS = {
  name: 'Élève',
  dob: 'Date de naissance',
  class: 'Classe',
  schedule: 'Créneau',
  parentContacts: 'Contacts parents',
  medicalInfo: 'Infos médicales',
  paymentStatus: 'Statut paiement',
};

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function toIsoDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(toNumber(value));
}

function formatExportPaymentMethod(method, metadata = {}) {
  if (method === 'VIREMENT' || method === 'PRELEVEMENT_BANCAIRE') return 'Prélèvement';
  if (method === 'SEPA' || method === 'STRIPE_SEPA' || method === 'GO_CARDLESS_SEPA') return 'Prélèvement SEPA';
  return method || '-';
}

function getBankDebitExportFields(metadata = {}) {
  const installmentsCount = metadata?.bankDebitInstallmentsCount ?? metadata?.numberOfInstallments ?? '-';
  const firstPaymentDate = metadata?.firstPaymentDate ? new Date(metadata.firstPaymentDate).toLocaleDateString('fr-FR') : '-';
  const scheduleDay = metadata?.bankDebitDay ?? metadata?.scheduleDay ?? '-';
  const iban = metadata?.bankDebitIban || '-';
  const swift = metadata?.bankDebitSwift || '-';
  return { installmentsCount, firstPaymentDate, scheduleDay, iban, swift };
}

function getChequeExportFields(metadata = {}) {
  const installmentsCount = metadata?.chequeInstallmentsCount ?? metadata?.numberOfInstallments ?? metadata?.installmentsCount ?? '-';
  const depositDate = metadata?.chequeFirstPaymentDate ? new Date(metadata.chequeFirstPaymentDate).toLocaleDateString('fr-FR') : '-';
  const depositDay = metadata?.chequeDepositDay ?? '-';
  return { installmentsCount, depositDate, depositDay };
}

function formatExportPaymentStatus(status) {
  const labels = {
    PENDING: 'En attente',
    PARTIAL: 'Partiel',
    PAID: 'Payé',
    OVERDUE: 'En retard',
    CANCELLED: 'Annulé',
    FAILED: 'Échoué',
    SUCCEEDED: 'Réussi',
    REFUNDED: 'Remboursé',
    REQUIRES_ACTION: 'Action requise',
    PROCESSING: 'En cours',
  };
  return labels[status] || status || '-';
}

function parseFormat(value, allowed = ['excel', 'pdf', 'csv']) {
  const format = String(value || 'excel').toLowerCase();
  if (!allowed.includes(format)) {
    throw new Error(`Format invalide. Formats autorisés: ${allowed.join(', ')}`);
  }
  return format;
}

function buildCsv(headers, rows) {
  const escape = (value) => {
    const text = String(value ?? '');
    if (text.includes(';') || text.includes('\n') || text.includes('"')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  return [
    headers.map(escape).join(';'),
    ...rows.map((row) => row.map(escape).join(';')),
  ].join('\n');
}

async function getTargetSchoolYearId(schoolYearId) {
  if (schoolYearId) return schoolYearId;
  const current = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
  return current?.id || null;
}

function sendExcel(res, filename, worksheetName, headers, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(worksheetName);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  sheet.columns = headers.map(() => ({ width: 25 }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  return workbook.xlsx.write(res).then(() => res.end());
}

function hexToArgb(hex) {
  const normalized = String(hex || '#FFFFFF').replace('#', '').trim();
  return `FF${normalized.length === 6 ? normalized : normalized.padStart(6, '0')}`.toUpperCase();
}

function sendPlanningExcel(res, filename, days, uniquePeriods, schedule) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Planning hebdo');
  sheet.properties.defaultRowHeight = 32;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const headers = ['Horaire', ...days];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E3A6C' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  sheet.columns = [{ width: 18 }, ...days.map(() => ({ width: 30 }))];

  uniquePeriods.forEach((period) => {
    const row = [
      `${period.startTime} - ${period.endTime}`,
      ...days.map((day) => {
        const classesForDay = schedule[day][`${period.startTime}-${period.endTime}`] || [];
        if (classesForDay.length === 0) return '-';
        const texts = classesForDay.slice(0, 3).map((cls) => {
          const level = `${cls.level?.pole?.name || 'Pôle'} • ${cls.level?.name || 'Niveau'}`;
          const teacher = cls.teacher?.lastName ? `${cls.teacher.firstName || ''} ${cls.teacher.lastName}`.trim() : cls.teacherName || 'Professeur non défini';
          const room = cls.room || cls.roomRef?.name || 'Salle non définie';
          return `${level}\nSalle: ${room}\nProf: ${teacher}`;
        });
        if (classesForDay.length > 3) {
          texts.push(`+ ${classesForDay.length - 3} autre(s)`);
        }
        return texts.join('\n\n');
      }),
    ];
    const excelRow = sheet.addRow(row);
    excelRow.height = 60;
    excelRow.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'top', horizontal: colNumber === 1 ? 'center' : 'left', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
      if (colNumber > 1) {
        const value = cell.value || '';
        if (value !== '-') {
          const fillColor = getPlanningColor(value);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(fillColor) } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      }
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  return workbook.xlsx.write(res).then(() => res.end());
}

function sendCsv(res, filename, headers, rows) {
  const csv = buildCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(`\uFEFF${csv}`);
}

function sendSimplePdf(res, filename, title, headers, rows) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);

  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  doc.pipe(res);

  const titleColor = '#1D4F91';
  const headerBg = '#0E3A6C';
  const headerText = '#FFFFFF';
  const rowBg1 = '#F4F8FF';
  const rowBg2 = '#FFFFFF';
  const borderColor = '#CED9EB';
  const textColor = '#222222';

  doc.fontSize(18).fillColor(titleColor).text(title);
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor('#5A677D').text(`Généré le ${new Date().toLocaleString('fr-FR')}`);
  doc.moveDown(0.5);

  const pageLeft = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columnCount = headers.length;
  const columnWidth = Math.max(80, Math.floor(pageWidth / columnCount));
  const availableWidth = Math.min(pageWidth, columnWidth * columnCount);
  const rowPadding = 6;

  let y = doc.y;

  function drawTableHeader() {
    let x = pageLeft;
    for (let i = 0; i < headers.length; i += 1) {
      const width = i === headers.length - 1 ? availableWidth - (columnWidth * (headers.length - 1)) : columnWidth;
      doc.rect(x, y, width, 26).fill(headerBg).stroke(borderColor);
      doc.fillColor(headerText).fontSize(9).text(headers[i], x + rowPadding, y + 7, { width: width - rowPadding * 2, align: 'left' });
      x += width;
    }
    y += 26;
  }

  function addPage() {
    doc.addPage();
    y = doc.y;
    drawTableHeader();
  }

  drawTableHeader();

  rows.forEach((row, rowIndex) => {
    const rowBg = rowIndex % 2 === 0 ? rowBg1 : rowBg2;
    let x = pageLeft;
    const cellHeights = row.map((cell, cellIndex) => {
      const width = cellIndex === headers.length - 1 ? availableWidth - (columnWidth * (headers.length - 1)) : columnWidth;
      return doc.heightOfString(String(cell ?? ''), { width: width - rowPadding * 2, align: 'left', continued: false, paragraphGap: 2 });
    });
    const rowHeight = Math.max(20, Math.max(...cellHeights) + rowPadding * 2);

    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      addPage();
    }

    for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
      const width = cellIndex === headers.length - 1 ? availableWidth - (columnWidth * (headers.length - 1)) : columnWidth;
      doc.rect(x, y, width, rowHeight).fill(rowBg).stroke(borderColor);
      doc.fillColor(textColor).fontSize(9).text(String(row[cellIndex] ?? ''), x + rowPadding, y + rowPadding, {
        width: width - rowPadding * 2,
        align: 'left',
      });
      x += width;
    }

    y += rowHeight;
  });

  doc.end();
}

async function exportTabular(res, { format, filename, title, worksheetName, headers, rows }) {
  if (format === 'excel') {
    await sendExcel(res, filename, worksheetName || 'Export', headers, rows);
    return;
  }
  if (format === 'csv') {
    sendCsv(res, filename, headers, rows);
    return;
  }
  sendSimplePdf(res, filename, title, headers, rows);
}

function getStudentColumns(columns) {
  const defaultColumns = ['name', 'dob', 'class', 'schedule', 'parentContacts', 'medicalInfo', 'paymentStatus'];
  const selected = Array.isArray(columns) && columns.length > 0 ? columns : defaultColumns;
  return selected.filter((col) => STUDENT_COLUMN_LABELS[col]);
}

function studentValueByColumn(student, column) {
  switch (column) {
    case 'name':
      return `${student.lastName} ${student.firstName}`;
    case 'dob':
      return new Date(student.dateOfBirth).toLocaleDateString('fr-FR');
    case 'class':
      return student.classesSummary || '—';
    case 'schedule':
      return student.schedulesSummary || '—';
    case 'parentContacts':
      return student.parentsSummary || '—';
    case 'medicalInfo':
      return student.medicalSummary || 'RAS';
    case 'paymentStatus':
      return student.paymentSummary || '—';
    default:
      return '—';
  }
}

async function buildStudentExportData(filters = {}) {
  const { schoolYearId, poleId, levelId, classId } = filters;

  const enrollmentWhere = {
    status: { in: ['PENDING', 'CONFIRMED'] },
    ...(schoolYearId ? { schoolYearId } : {}),
    ...(classId ? { classId } : {}),
    ...(poleId || levelId
      ? {
          class: {
            ...(poleId ? { poleId } : {}),
            ...(levelId ? { levelId } : {}),
          },
        }
      : {}),
  };

  const enrollments = await prisma.enrollment.findMany({
    where: enrollmentWhere,
    include: {
      class: {
        include: {
          level: { include: { pole: true } },
          schoolYear: true,
        },
      },
      student: {
        include: {
          family: {
            include: {
              user: true,
              parents: true,
              payments: {
                where: schoolYearId ? { schoolYearId } : {},
                orderBy: { createdAt: 'desc' },
              },
            },
          },
        },
      },
    },
    orderBy: [{ class: { dayOfWeek: 'asc' } }, { class: { startTime: 'asc' } }],
  });

  const grouped = new Map();
  for (const enrollment of enrollments) {
    const key = enrollment.studentId;
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...enrollment.student,
        classes: [],
        schedules: [],
      });
    }
    const holder = grouped.get(key);
    holder.classes.push(`${enrollment.class.level.pole?.name || 'Pôle'} - ${enrollment.class.level.name}`);
    holder.schedules.push(`${enrollment.class.dayOfWeek} ${enrollment.class.startTime}-${enrollment.class.endTime}`);
  }

  return Array.from(grouped.values()).map((student) => {
    const payments = student.family?.payments || [];
    const total = payments.reduce((acc, payment) => acc + toNumber(payment.totalAmount), 0);
    const paid = payments.reduce((acc, payment) => acc + toNumber(payment.paidAmount), 0);

    const parentsSummary = (student.family?.parents || [])
      .map((p) => `${p.firstName} ${p.lastName} (${p.phone}${p.email ? ` / ${p.email}` : ''})`)
      .join(' | ');

    const medicalSummary = [student.allergies, student.currentTreatments, student.emergencyContactName, student.emergencyContactPhone]
      .filter(Boolean)
      .join(' | ');

    return {
      ...student,
      classesSummary: [...new Set(student.classes)].join(' ; '),
      schedulesSummary: [...new Set(student.schedules)].join(' ; '),
      parentsSummary,
      medicalSummary,
      paymentSummary: `${formatCurrency(paid)} / ${formatCurrency(total)} (${Math.max(total - paid, 0).toFixed(2)}€ impayés)`,
    };
  });
}

async function exportStudents(req, res) {
  try {
    const { schoolYearId, poleId, levelId, classId, columns } = req.body || {};
    const format = parseFormat(req.body?.format, ['excel', 'pdf']);

    const rowsData = await buildStudentExportData({ schoolYearId, poleId, levelId, classId });
    const selectedColumns = getStudentColumns(columns);
    const headers = selectedColumns.map((column) => STUDENT_COLUMN_LABELS[column]);
    const rows = rowsData.map((student) => selectedColumns.map((column) => studentValueByColumn(student, column)));

    await exportTabular(res, {
      format,
      filename: `liste-eleves-${Date.now()}`,
      title: 'Liste des élèves',
      worksheetName: 'Élèves',
      headers,
      rows,
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_EXPORT_STUDENTS',
      entityType: 'Student',
      details: { format, filters: { schoolYearId, poleId, levelId, classId }, columns: selectedColumns, count: rowsData.length },
    });
  } catch (error) {
    console.error('Erreur exportStudents:', error);
    res.status(400).json({ error: error.message || 'Erreur export liste élèves' });
  }
}

function getDatesBetween(startDate, endDate) {
  const dates = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

async function exportAttendanceSheet(req, res) {
  try {
    const { classId, startDate, endDate } = req.body || {};
    if (!classId || !startDate || !endDate) {
      return res.status(400).json({ error: 'classId, startDate et endDate sont requis' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ error: 'Période invalide' });
    }

    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        level: { include: { pole: true } },
        schoolYear: true,
        enrollments: {
          where: { status: { in: ['PENDING', 'CONFIRMED'] } },
          include: { student: true },
          orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
        },
      },
    });

    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });

    const dayMap = {
      DIMANCHE: 0,
      LUNDI: 1,
      MARDI: 2,
      MERCREDI: 3,
      JEUDI: 4,
      VENDREDI: 5,
      SAMEDI: 6,
    };
    const classWeekday = dayMap[cls.dayOfWeek] ?? null;
    const dates = getDatesBetween(start, end)
      .filter((date) => classWeekday === null || date.getDay() === classWeekday)
      .slice(0, 20);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="feuille-presence-${classId}.pdf"`);

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    const titleColor = '#1D4F91';
    const headerBg = '#0E3A6C';
    const headerText = '#FFFFFF';
    const rowBg1 = '#F4F8FF';
    const rowBg2 = '#FFFFFF';
    const borderColor = '#CED9EB';
    const textColor = '#212B3A';

    doc.fontSize(16).fillColor(titleColor).text('Feuille de présence');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#5A677D').text(`Classe: ${cls.level.pole?.name || '-'} - ${cls.level.name}`);
    doc.text(`Année scolaire: ${cls.schoolYear?.label || '-'}`);
    doc.text(`Créneau: ${cls.dayOfWeek} ${cls.startTime}-${cls.endTime}`);
    doc.text(`Période: ${start.toLocaleDateString('fr-FR')} → ${end.toLocaleDateString('fr-FR')}`);
    doc.moveDown(0.6);

    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const pageWidth = pageRight - pageLeft;
    const rowHeight = 24;
    const nameWidth = 180;
    const dateWidth = Math.max(42, Math.floor((pageWidth - nameWidth) / Math.max(dates.length, 1)));

    let y = doc.y;
    let page = 1;

    function drawHeaderRow() {
      let x = pageLeft;
      doc.save();
      doc.fillColor(headerBg).rect(x, y, nameWidth, rowHeight).fill();
      doc.restore();
      doc.strokeColor(borderColor).lineWidth(0.5).rect(x, y, nameWidth, rowHeight).stroke();
      doc.fillColor(headerText).fontSize(8).text('Élève', x + 6, y + 7, { width: nameWidth - 12, align: 'left' });

      dates.forEach((date, index) => {
        const xDate = x + nameWidth + index * dateWidth;
        doc.save();
        doc.fillColor(headerBg).rect(xDate, y, dateWidth, rowHeight).fill();
        doc.restore();
        doc.strokeColor(borderColor).lineWidth(0.5).rect(xDate, y, dateWidth, rowHeight).stroke();
        doc.fillColor(headerText).fontSize(7).text(date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), xDate + 4, y + 7, { width: dateWidth - 8, align: 'center' });
      });

      y += rowHeight;
    }

    function addRow(enrollment, rowIndex) {
      let x = pageLeft;
      const rowBg = rowIndex % 2 === 0 ? rowBg1 : rowBg2;
      doc.save();
      doc.fillColor(rowBg).rect(x, y, nameWidth, rowHeight).fill();
      doc.restore();
      doc.strokeColor(borderColor).lineWidth(0.5).rect(x, y, nameWidth, rowHeight).stroke();
      doc.fillColor(textColor).fontSize(8).text(`${enrollment.student.lastName} ${enrollment.student.firstName}`, x + 6, y + 7, { width: nameWidth - 12, align: 'left' });

      dates.forEach((_, index) => {
        const xDate = x + nameWidth + index * dateWidth;
        doc.save();
        doc.fillColor(rowBg).rect(xDate, y, dateWidth, rowHeight).fill();
        doc.restore();
        doc.strokeColor(borderColor).lineWidth(0.5).rect(xDate, y, dateWidth, rowHeight).stroke();
      });

      y += rowHeight;
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.y;
        page += 1;
        drawHeaderRow();
      }
    }

    drawHeaderRow();
    cls.enrollments.forEach((enrollment, index) => addRow(enrollment, index));

    doc.end();

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_EXPORT_ATTENDANCE_SHEET',
      entityType: 'Class',
      entityId: classId,
      details: { startDate: toIsoDate(startDate), endDate: toIsoDate(endDate), students: cls.enrollments.length, dates: dates.length },
    });
  } catch (error) {
    console.error('Erreur exportAttendanceSheet:', error);
    res.status(500).json({ error: 'Erreur export feuille de présence' });
  }
}

function parseTime(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map((item) => Number(item));
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
}

function getPlanningColor(key) {
  const palette = ['#AEDFF7', '#C4F0A9', '#F7C9C9', '#F7E8A9', '#D9C4F7', '#F7D9A9', '#B8F7D0', '#D0B8F7', '#F7B8D0', '#C4F7B8'];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % palette.length;
  }
  return palette[hash];
}

function buildPlanningLabel(cls, type) {
  const baseClass = `${cls.level?.pole?.name || 'Pôle'} - ${cls.level?.name || 'Niveau'}`;
  const teacher = cls.teacher?.lastName ? `${cls.teacher.firstName || ''} ${cls.teacher.lastName}`.trim() : cls.teacherName || 'Professeur non défini';
  const room = cls.room || cls.roomRef?.name || 'Salle non définie';

  if (type === 'teacher') {
    return `${baseClass} • ${room}`;
  }
  if (type === 'room') {
    return `${baseClass} • ${teacher}`;
  }
  return `${baseClass} • ${teacher} • ${room}`;
}

function getPlanningGroupKey(cls, type) {
  if (type === 'room') {
    return cls.room || cls.roomRef?.name || 'Salle non définie';
  }
  if (type === 'teacher') {
    return cls.teacher?.lastName ? `${cls.teacher.firstName || ''} ${cls.teacher.lastName}`.trim() : cls.teacherName || 'Professeur non défini';
  }
  return `${cls.level?.pole?.name || 'Pôle'} - ${cls.level?.name || 'Niveau'}`;
}

function getClassDay(cls) {
  return cls.dayOfWeek || cls.timeSlot?.dayOfWeek || 'INDEFINI';
}

function getClassStartTime(cls) {
  return cls.startTime || cls.timeSlot?.startTime || '??:??';
}

function getClassEndTime(cls) {
  return cls.endTime || cls.timeSlot?.endTime || '??:??';
}

function getClassTeacherName(cls) {
  if (cls.teacher?.lastName) return `${cls.teacher.firstName || ''} ${cls.teacher.lastName}`.trim();
  if (cls.teacherName) return cls.teacherName;
  return 'Professeur non défini';
}

function getClassRoomName(cls) {
  return cls.room || cls.roomRef?.name || cls.timeSlot?.room?.name || 'Salle non définie';
}

async function exportPlanning(req, res) {
  try {
    const { type, poleId, roomId, teacherId, classId, format: requestedFormat } = req.body || {};
    const validTypes = ['global', 'pole', 'class', 'room', 'teacher'];
    const format = requestedFormat ? parseFormat(requestedFormat, ['excel', 'pdf']) : 'pdf';
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Type de planning invalide' });
    }

    if (type === 'pole' && !poleId) {
      return res.status(400).json({ error: 'Pôle requis pour l\'export par pôle' });
    }

    if (type === 'class' && !classId) {
      return res.status(400).json({ error: 'Classe requise pour l\'export par classe' });
    }

    if (type === 'room' && !roomId) {
      return res.status(400).json({ error: 'Salle requise pour l\'export par salle' });
    }

    if (type === 'teacher' && !teacherId) {
      return res.status(400).json({ error: 'Professeur requis pour l\'export par professeur' });
    }

    const schoolYearId = await getTargetSchoolYearId(null);
    if (!schoolYearId) {
      return res.status(400).json({ error: 'Année scolaire en cours introuvable' });
    }

    const [currentYear, pole, selectedClass, selectedRoom, selectedTeacher] = await Promise.all([
      prisma.schoolYear.findUnique({ where: { id: schoolYearId } }),
      poleId ? prisma.pole.findUnique({ where: { id: poleId } }) : null,
      type === 'class' && classId ? prisma.class.findUnique({ where: { id: classId }, include: { level: { include: { pole: true } }, pole: true, roomRef: true, teacher: true } }) : null,
      type === 'room' && roomId ? prisma.room.findUnique({ where: { id: roomId } }) : null,
      type === 'teacher' && teacherId ? prisma.teacher.findUnique({ where: { id: teacherId } }) : null,
    ]);

    const classes = await prisma.class.findMany({
      where: {
        schoolYearId,
        ...(type === 'pole' ? { poleId } : {}),
        ...(type === 'class' ? { id: classId } : {}),
        ...(type === 'room' ? { roomId } : {}),
        ...(type === 'teacher' ? { teacherId } : {}),
        ...(type === 'global' && poleId ? { poleId } : {}),
      },
      include: {
        level: { include: { pole: true } },
        pole: true,
        roomRef: true,
        teacher: true,
        timeSlot: { include: { room: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    const days = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
    const uniquePeriods = Array.from(
      classes.reduce((map, cls) => {
        const startTime = getClassStartTime(cls);
        const endTime = getClassEndTime(cls);
        const key = `${startTime}-${endTime}`;
        if (!map.has(key)) {
          map.set(key, { startTime, endTime });
        }
        return map;
      }, new Map()).values(),
    ).sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime) || parseTime(a.endTime) - parseTime(b.endTime));

    const schedule = days.reduce((acc, day) => ({ ...acc, [day]: {} }), {});
    classes.forEach((cls) => {
      const day = getClassDay(cls);
      if (!days.includes(day)) return;
      const periodKey = `${getClassStartTime(cls)}-${getClassEndTime(cls)}`;
      schedule[day][periodKey] = schedule[day][periodKey] || [];
      schedule[day][periodKey].push(cls);
    });

    if (format === 'excel') {
      await sendPlanningExcel(res, `planning-${type}-${Date.now()}`, days, uniquePeriods, schedule);
      await createActivityLog({
        userId: req.user?.id,
        action: 'ADMIN_EXPORT_PLANNING',
        entityType: 'Schedule',
        details: { type, poleId, classId, roomId, teacherId, format, classes: classes.length },
      });
      return;
    }

    const doc = new PDFDocument({ margin: 24, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="planning-${type}-${Date.now()}.pdf"`);
    doc.pipe(res);

    const titleColor = '#1D4F91';
    const headerColor = '#0E3A6C';
    const accentColor = '#E8F1FA';

    doc.fontSize(18).fillColor(titleColor).text('Planning hebdomadaire');
    doc.moveDown(0.2);
    const planningLabel = type === 'global'
      ? 'Planning global'
      : type === 'pole'
        ? 'Planning par pôle'
        : type === 'class'
          ? 'Planning par classe'
          : type === 'room'
            ? 'Planning par salle'
            : 'Planning par professeur';
    doc.fontSize(10).fillColor(headerColor).text(`Type: ${planningLabel}`);
    if (type === 'pole') {
      doc.text(`Pôle: ${pole?.name || 'Pôle non défini'}`);
    }
    if (type === 'class') {
      const classLabel = selectedClass ? `${selectedClass.level?.pole?.name || ''} - ${selectedClass.level?.name || selectedClass.name || selectedClass.id}`.trim() : 'Classe non définie';
      doc.text(`Classe: ${classLabel}`);
    }
    if (type === 'room') {
      doc.text(`Salle: ${selectedRoom?.name || 'Salle non définie'}`);
    }
    if (type === 'teacher') {
      const teacherName = selectedTeacher ? `${selectedTeacher.firstName || ''} ${selectedTeacher.lastName || ''}`.trim() : 'Professeur non défini';
      doc.text(`Professeur: ${teacherName}`);
    }
    if (type === 'global' && pole?.name) {
      doc.text(`Pôle: ${pole?.name}`);
    }
    doc.text(`Année scolaire: ${currentYear?.label || 'Actuelle'}`);
    doc.moveDown(0.4);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const timeColWidth = 80;
    const dayColWidth = Math.floor((pageWidth - timeColWidth) / days.length);
    const headerHeight = 24;
    const startX = doc.x;
    let y = doc.y;

    function drawTableHeader() {
      doc.save();
      doc.fillColor(accentColor).rect(startX, y, timeColWidth, headerHeight).fill();
      days.forEach((day, index) => {
        const x = startX + timeColWidth + index * dayColWidth;
        doc.rect(x, y, dayColWidth, headerHeight).fill();
      });
      doc.restore();

      doc.fontSize(8).fillColor(headerColor);
      doc.rect(startX, y, timeColWidth, headerHeight).stroke();
      doc.text('Horaire', startX + 4, y + 6, { width: timeColWidth - 8, align: 'left' });

      days.forEach((day, index) => {
        const x = startX + timeColWidth + index * dayColWidth;
        doc.rect(x, y, dayColWidth, headerHeight).stroke();
        doc.text(day, x + 4, y + 6, { width: dayColWidth - 8, align: 'center' });
      });
      y += headerHeight;
    }

    drawTableHeader();

    uniquePeriods.forEach((period) => {
      const classesByDay = days.map((day) => schedule[day][`${period.startTime}-${period.endTime}`] || []);
      const maxRows = Math.max(1, ...classesByDay.map((list) => Math.min(list.length, 4)));
      const rowHeight = Math.max(64, maxRows * 52 + 12);

      if (y + rowHeight > doc.page.height - 60) {
        doc.addPage();
        y = doc.page.margins.top;
        drawTableHeader();
      }

      doc.rect(startX, y, timeColWidth, rowHeight).stroke();
      doc.fontSize(8).fillColor('#000000').text(`${period.startTime} - ${period.endTime}`, startX + 4, y + 6, { width: timeColWidth - 8 });

      days.forEach((day, dayIndex) => {
        const x = startX + timeColWidth + dayIndex * dayColWidth;
        doc.rect(x, y, dayColWidth, rowHeight).stroke();
        const cellClasses = schedule[day][`${period.startTime}-${period.endTime}`] || [];

        if (cellClasses.length === 0) {
          doc.fontSize(7).fillColor('#555555').text('-', x + 4, y + 6, { width: dayColWidth - 8, align: 'left' });
          return;
        }

        let lineY = y + 8;
        cellClasses.slice(0, 4).forEach((cls) => {
          const teacherName = cls.teacher?.lastName
            ? `${cls.teacher.firstName || ''} ${cls.teacher.lastName}`.trim()
            : cls.teacherName || 'Professeur non défini';
          const roomName = cls.room || cls.roomRef?.name || 'Salle non définie';
          const levelName = `${cls.level?.pole?.name || 'Pôle'} • ${cls.level?.name || 'Niveau'}`;
          const slotColor = getPlanningColor(`${levelName}-${teacherName}-${roomName}`);
          const blockHeight = 40;

          doc.save();
          doc.fillColor(slotColor).roundedRect(x + 3, lineY - 4, dayColWidth - 6, blockHeight, 8).fill();
          doc.restore();

          doc.fontSize(8).fillColor('#0B3D91').text(levelName, x + 8, lineY, { width: dayColWidth - 16, align: 'left' });
          lineY += 10;
          doc.fontSize(7).fillColor('#1F2937').text(`Salle: ${roomName}`, x + 8, lineY, { width: dayColWidth - 16, align: 'left' });
          lineY += 9;
          doc.fontSize(7).fillColor('#1F2937').text(`Prof: ${teacherName}`, x + 8, lineY, { width: dayColWidth - 16, align: 'left' });
          lineY += 12;

          if (cls !== cellClasses[cellClasses.length - 1] && lineY + 2 < y + rowHeight) {
            doc.save().strokeColor('#E5E7EB').moveTo(x + 4, lineY).lineTo(x + dayColWidth - 4, lineY).stroke().restore();
            lineY += 4;
          }
        });

        if (cellClasses.length > 4) {
          const remaining = cellClasses.length - 4;
          doc.fillColor('#555555').fontSize(7).text(`+ ${remaining} autre(s)`, x + 4, lineY, { width: dayColWidth - 8, continued: false });
        }
      });

      y += rowHeight;
    });

    doc.end();

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_EXPORT_PLANNING',
      entityType: 'Schedule',
      details: { type, poleId, classId, roomId, teacherId, classes: classes.length },
    });
  } catch (error) {
    console.error('Erreur exportPlanning:', error);
    res.status(500).json({ error: 'Erreur export planning' });
  }
}

async function getAccountingDataset(kind, schoolYearId) {
  if (kind === 'payments') {
    const payments = await prisma.payment.findMany({
      where: schoolYearId ? { schoolYearId } : {},
      include: { family: true, schoolYear: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      title: 'Synthèse des paiements',
      headers: ['Date', 'Année', 'Famille', 'Montant total', 'Montant payé', 'Reste', 'Statut', 'Méthode', 'Nombre échéances prélèvement', 'Date début prélèvement', 'Jour prélèvement', 'IBAN', 'SWIFT', 'Nombre de chèques', 'Date dépôt chèque', 'Jour dépôt chèque'],
      rows: payments.map((p) => {
        const metadata = p.metadata || {};
        const bankDebit = getBankDebitExportFields(metadata);
        const cheque = getChequeExportFields(metadata);
        return [
          new Date(p.createdAt).toLocaleDateString('fr-FR'),
          p.schoolYear?.label || '-',
          p.family?.familyName || '-',
          formatCurrency(p.totalAmount),
          formatCurrency(p.paidAmount),
          formatCurrency(Math.max(toNumber(p.totalAmount) - toNumber(p.paidAmount), 0)),
          formatExportPaymentStatus(p.status),
          formatExportPaymentMethod(p.paymentMethod, metadata),
          bankDebit.installmentsCount,
          bankDebit.firstPaymentDate,
          bankDebit.scheduleDay,
          bankDebit.iban,
          bankDebit.swift,
          cheque.installmentsCount,
          cheque.depositDate,
          cheque.depositDay,
        ];
      }),
    };
  }

  if (kind === 'unpaid') {
    const payments = await prisma.payment.findMany({
      where: {
        ...(schoolYearId ? { schoolYearId } : {}),
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      },
      include: { family: true, schoolYear: true },
      orderBy: { createdAt: 'desc' },
    }).then((rows) => rows.filter((p) => toNumber(p.paidAmount) < toNumber(p.totalAmount)));

    return {
      title: 'Liste des impayés',
      headers: ['Famille', 'Année', 'Montant total', 'Montant payé', 'Impayé', 'Statut', 'Dernière mise à jour'],
      rows: payments.map((p) => [
        p.family?.familyName || '-',
        p.schoolYear?.label || '-',
        formatCurrency(p.totalAmount),
        formatCurrency(p.paidAmount),
        formatCurrency(Math.max(toNumber(p.totalAmount) - toNumber(p.paidAmount), 0)),
        formatExportPaymentStatus(p.status),
        new Date(p.updatedAt).toLocaleDateString('fr-FR'),
      ]),
    };
  }

  if (kind === 'transactions') {
    const transactions = await prisma.paymentTransaction.findMany({
      where: schoolYearId ? { payment: { schoolYearId } } : {},
      include: {
        payment: {
          include: {
            family: true,
            schoolYear: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      title: 'Historique des transactions',
      headers: ['Date', 'Famille', 'Année', 'Type', 'Provider', 'Méthode', 'Montant', 'Statut', 'Référence', 'Nombre échéances prélèvement', 'Date début prélèvement', 'Jour prélèvement', 'IBAN', 'SWIFT', 'Nombre de chèques', 'Date dépôt chèque', 'Jour dépôt chèque'],
      rows: transactions.map((t) => {
        const paymentMetadata = t.payment?.metadata || {};
        const bankDebit = getBankDebitExportFields(paymentMetadata);
        const cheque = getChequeExportFields(paymentMetadata);
        return [
          new Date(t.createdAt).toLocaleString('fr-FR'),
          t.payment?.family?.familyName || '-',
          t.payment?.schoolYear?.label || '-',
          t.type,
          t.provider,
          formatExportPaymentMethod(t.method, paymentMetadata),
          formatCurrency(t.amount),
          formatExportPaymentStatus(t.status),
          t.externalRef || '-',
          bankDebit.installmentsCount,
          bankDebit.firstPaymentDate,
          bankDebit.scheduleDay,
          bankDebit.iban,
          bankDebit.swift,
          cheque.installmentsCount,
          cheque.depositDate,
          cheque.depositDay,
        ];
      }),
    };
  }

  const yearId = schoolYearId || (await getTargetSchoolYearId(null));
  const [year, payments, transactions] = await Promise.all([
    yearId ? prisma.schoolYear.findUnique({ where: { id: yearId } }) : null,
    prisma.payment.findMany({ where: yearId ? { schoolYearId: yearId } : {}, include: { family: true } }),
    prisma.paymentTransaction.findMany({ where: yearId ? { payment: { schoolYearId: yearId } } : {} }),
  ]);

  const revenue = payments.reduce((acc, p) => acc + toNumber(p.paidAmount), 0);
  const expected = payments.reduce((acc, p) => acc + toNumber(p.totalAmount), 0);
  const unpaid = Math.max(expected - revenue, 0);

  const byMethod = transactions.reduce((acc, tx) => {
    const key = tx.method || 'INCONNU';
    acc[key] = (acc[key] || 0) + toNumber(tx.amount);
    return acc;
  }, {});

  const familyRows = payments.map((p) => ({
    family: p.family?.familyName || '-',
    total: toNumber(p.totalAmount),
    paid: toNumber(p.paidAmount),
    unpaid: Math.max(toNumber(p.totalAmount) - toNumber(p.paidAmount), 0),
  }));

  return {
    title: 'Bilan annuel comptable',
    headers: ['Rubrique', 'Valeur'],
    rows: [
      ['Année scolaire', year?.label || 'Toutes'],
      ['Chiffre encaissé', formatCurrency(revenue)],
      ['Montant attendu', formatCurrency(expected)],
      ['Montant impayé', formatCurrency(unpaid)],
      ...Object.entries(byMethod).map(([method, amount]) => [`Paiements ${method}`, formatCurrency(amount)]),
      ...familyRows.map((line) => [`Famille ${line.family}`, `${formatCurrency(line.paid)} / ${formatCurrency(line.total)} (reste ${formatCurrency(line.unpaid)})`]),
    ],
  };
}

function createAccountingExportHandler(kind) {
  return async function accountingExport(req, res) {
    try {
      const format = parseFormat(req.query.format, kind === 'annual-summary' ? ['excel', 'pdf'] : ['excel', 'csv', 'pdf']);
      const schoolYearId = req.query.schoolYearId || null;

      const dataset = await getAccountingDataset(kind, schoolYearId);
      await exportTabular(res, {
        format,
        filename: `compta-${kind}-${Date.now()}`,
        title: dataset.title,
        worksheetName: 'Compta',
        headers: dataset.headers,
        rows: dataset.rows,
      });

      await createActivityLog({
        userId: req.user?.id,
        action: `ADMIN_EXPORT_ACCOUNTING_${kind.toUpperCase().replace(/-/g, '_')}`,
        entityType: 'Accounting',
        details: { format, schoolYearId, kind, rows: dataset.rows.length },
      });
    } catch (error) {
      console.error(`Erreur accounting export ${kind}:`, error);
      res.status(400).json({ error: error.message || 'Erreur export comptable' });
    }
  };
}

async function getEnrollmentEvolution(req, res) {
  try {
    const years = await prisma.schoolYear.findMany({
      include: {
        _count: { select: { enrollments: true, classes: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    const data = years.map((year) => ({
      schoolYearId: year.id,
      label: year.label,
      enrollments: year._count.enrollments,
      classes: year._count.classes,
    }));

    res.json({ data });
  } catch (error) {
    console.error('Erreur getEnrollmentEvolution:', error);
    res.status(500).json({ error: 'Erreur statistiques inscriptions' });
  }
}

async function getDistribution(req, res) {
  try {
    const schoolYearId = await getTargetSchoolYearId(req.query.schoolYearId);
    const enrollments = await prisma.enrollment.findMany({
      where: schoolYearId ? { schoolYearId, status: { in: ['PENDING', 'CONFIRMED'] } } : { status: { in: ['PENDING', 'CONFIRMED'] } },
      include: {
        class: {
          include: {
            pole: true,
            level: true,
          },
        },
      },
    });

    const byPole = {};
    const byLevel = {};
    enrollments.forEach((enrollment) => {
      const pole = enrollment.class.pole?.name || 'Non défini';
      const level = enrollment.class.level?.name || 'Non défini';
      byPole[pole] = (byPole[pole] || 0) + 1;
      byLevel[level] = (byLevel[level] || 0) + 1;
    });

    res.json({
      schoolYearId,
      byPole: Object.entries(byPole).map(([name, count]) => ({ name, count })),
      byLevel: Object.entries(byLevel).map(([name, count]) => ({ name, count })),
    });
  } catch (error) {
    console.error('Erreur getDistribution:', error);
    res.status(500).json({ error: 'Erreur distribution élèves' });
  }
}

async function getFillRate(req, res) {
  try {
    const schoolYearId = await getTargetSchoolYearId(req.query.schoolYearId);
    const classes = await prisma.class.findMany({
      where: schoolYearId ? { schoolYearId } : {},
      include: { level: { include: { pole: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    const data = classes.map((cls) => {
      const capacity = Math.max(cls.capacity || 0, 1);
      const fillRate = Number(((toNumber(cls.enrolledCount) / capacity) * 100).toFixed(2));
      return {
        classId: cls.id,
        classLabel: `${cls.level?.pole?.name || 'Pôle'} - ${cls.level?.name || 'Niveau'} (${cls.dayOfWeek} ${cls.startTime})`,
        enrolled: cls.enrolledCount,
        capacity: cls.capacity,
        fillRate,
        status: cls.status,
      };
    });

    res.json({ schoolYearId, data });
  } catch (error) {
    console.error('Erreur getFillRate:', error);
    res.status(500).json({ error: 'Erreur taux de remplissage' });
  }
}

async function getFinancialStatistics(req, res) {
  try {
    const schoolYearId = await getTargetSchoolYearId(req.query.schoolYearId);

    const [payments, monthlyPayments] = await Promise.all([
      prisma.payment.findMany({ where: schoolYearId ? { schoolYearId } : {} }),
      prisma.paymentTransaction.findMany({
        where: schoolYearId ? { payment: { schoolYearId } } : {},
        select: { amount: true, createdAt: true, status: true },
      }),
    ]);

    const total = payments.reduce((acc, p) => acc + toNumber(p.totalAmount), 0);
    const paid = payments.reduce((acc, p) => acc + toNumber(p.paidAmount), 0);
    const unpaid = Math.max(total - paid, 0);

    const overdueFamilies = new Set(
      payments
        .filter((p) => ['OVERDUE', 'PARTIAL', 'PENDING'].includes(p.status) || toNumber(p.paidAmount) < toNumber(p.totalAmount))
        .map((p) => p.familyId),
    );

    const unpaidTrend = monthlyPayments.reduce((acc, tx) => {
      const key = new Date(tx.createdAt).toISOString().slice(0, 7);
      if (!acc[key]) acc[key] = { month: key, succeeded: 0, failed: 0 };
      if (tx.status === 'SUCCEEDED') acc[key].succeeded += toNumber(tx.amount);
      else if (tx.status === 'FAILED') acc[key].failed += toNumber(tx.amount);
      return acc;
    }, {});

    res.json({
      schoolYearId,
      summary: {
        totalExpected: total,
        totalPaid: paid,
        totalUnpaid: unpaid,
        paymentRate: total > 0 ? Number(((paid / total) * 100).toFixed(2)) : 0,
        familiesWithUnpaid: overdueFamilies.size,
      },
      unpaidTrend: Object.values(unpaidTrend).sort((a, b) => a.month.localeCompare(b.month)),
    });
  } catch (error) {
    console.error('Erreur getFinancialStatistics:', error);
    res.status(500).json({ error: 'Erreur statistiques financières' });
  }
}

async function duplicateSchoolYear(req, res) {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, includeTeachers = false } = req.body || {};

    const sourceYear = await prisma.schoolYear.findUnique({ where: { id } });
    if (!sourceYear) return res.status(404).json({ error: 'Année source introuvable' });

    if (!name || !startDate || !endDate) {
      return res.status(400).json({ error: 'name, startDate et endDate sont requis' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'Période invalide pour la nouvelle année' });
    }

    const sourceClasses = await prisma.class.findMany({ where: { schoolYearId: id } });

    const created = await prisma.$transaction(async (tx) => {
      const newYear = await tx.schoolYear.create({
        data: {
          label: String(name).trim(),
          startDate: start,
          endDate: end,
          status: 'UPCOMING',
          isCurrent: false,
        },
      });

      if (sourceClasses.length > 0) {
        for (const cls of sourceClasses) {
          await tx.class.create({
            data: {
              schoolYearId: newYear.id,
              poleId: cls.poleId,
              levelId: cls.levelId,
              timeSlotId: cls.timeSlotId,
              roomId: cls.roomId,
              teacherId: includeTeachers ? cls.teacherId : null,
              teacherUserId: includeTeachers ? cls.teacherUserId : null,
              teacherName: includeTeachers ? cls.teacherName : null,
              dayOfWeek: cls.dayOfWeek,
              startTime: cls.startTime,
              endTime: cls.endTime,
              room: cls.room,
              capacity: cls.capacity,
              enrolledCount: 0,
              status: 'OPEN',
            },
          });
        }
      }

      return newYear;
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'SCHOOL_YEAR_DUPLICATED',
      entityType: 'SchoolYear',
      entityId: created.id,
      details: {
        sourceSchoolYearId: id,
        includeTeachers: !!includeTeachers,
        copiedClasses: sourceClasses.length,
      },
    });

    res.status(201).json({
      message: 'Année scolaire dupliquée avec succès',
      schoolYearId: created.id,
      copiedClasses: sourceClasses.length,
    });
  } catch (error) {
    console.error('Erreur duplicateSchoolYear:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Une année scolaire avec ce nom existe déjà' });
    }
    res.status(500).json({ error: 'Erreur duplication année scolaire' });
  }
}

async function listEmailTemplates(_req, res) {
  try {
    const templates = await prisma.emailTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
    res.json({ templates });
  } catch (error) {
    console.error('Erreur listEmailTemplates:', error);
    res.status(500).json({ error: 'Erreur chargement templates' });
  }
}

async function createEmailTemplate(req, res) {
  try {
    const { name, subject, body, variables } = req.body || {};
    if (!name || !subject || !body) {
      return res.status(400).json({ error: 'name, subject et body sont requis' });
    }

    const template = await prisma.emailTemplate.create({
      data: {
        name: String(name).trim(),
        subject: String(subject),
        body: String(body),
        variables: Array.isArray(variables) ? variables : variables || [],
      },
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'EMAIL_TEMPLATE_CREATED',
      entityType: 'EmailTemplate',
      entityId: template.id,
      details: { name: template.name },
    });

    res.status(201).json({ template });
  } catch (error) {
    console.error('Erreur createEmailTemplate:', error);
    if (error.code === 'P2002') return res.status(409).json({ error: 'Un template avec ce nom existe déjà' });
    res.status(500).json({ error: 'Erreur création template' });
  }
}

async function updateEmailTemplate(req, res) {
  try {
    const { id } = req.params;
    const { name, subject, body, variables } = req.body || {};

    const template = await prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(subject !== undefined ? { subject: String(subject) } : {}),
        ...(body !== undefined ? { body: String(body) } : {}),
        ...(variables !== undefined ? { variables: Array.isArray(variables) ? variables : variables || [] } : {}),
      },
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'EMAIL_TEMPLATE_UPDATED',
      entityType: 'EmailTemplate',
      entityId: id,
      details: { name: template.name },
    });

    res.json({ template });
  } catch (error) {
    console.error('Erreur updateEmailTemplate:', error);
    res.status(500).json({ error: 'Erreur mise à jour template' });
  }
}

async function deleteEmailTemplate(req, res) {
  try {
    const { id } = req.params;
    await prisma.emailTemplate.delete({ where: { id } });

    await createActivityLog({
      userId: req.user?.id,
      action: 'EMAIL_TEMPLATE_DELETED',
      entityType: 'EmailTemplate',
      entityId: id,
    });

    res.json({ message: 'Template supprimé' });
  } catch (error) {
    console.error('Erreur deleteEmailTemplate:', error);
    res.status(500).json({ error: 'Erreur suppression template' });
  }
}

async function resolveRecipients(recipientType, recipientIds = []) {
  if (recipientType === 'ALL_FAMILIES') {
    const families = await prisma.family.findMany({ include: { user: true } });
    return families.map((f) => ({ familyId: f.id, email: f.user?.email, label: f.familyName })).filter((f) => f.email);
  }

  if (recipientType === 'SPECIFIC_CLASS') {
    const classIds = (Array.isArray(recipientIds) ? recipientIds : []).filter(Boolean);
    if (classIds.length === 0) return [];

    const enrollments = await prisma.enrollment.findMany({
      where: {
        classId: { in: classIds },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        class: { include: { level: true } },
        student: {
          include: {
            family: {
              include: { user: true },
            },
          },
        },
      },
    });

    const map = new Map();
    enrollments.forEach((item) => {
      const family = item.student.family;
      const email = family?.user?.email;
      if (!family?.id || !email) return;
      map.set(family.id, {
        familyId: family.id,
        email,
        label: `${family.familyName} (${item.class?.level?.name || 'Classe'})`,
      });
    });

    return Array.from(map.values());
  }

  if (recipientType === 'SPECIFIC_FAMILIES') {
    const familyIds = (Array.isArray(recipientIds) ? recipientIds : []).filter(Boolean);
    if (familyIds.length === 0) return [];

    const families = await prisma.family.findMany({
      where: { id: { in: familyIds } },
      include: { user: true },
    });

    return families.map((f) => ({ familyId: f.id, email: f.user?.email, label: f.familyName })).filter((f) => f.email);
  }

  return [];
}

async function sendMessage(req, res) {
  try {
    const { subject, body, recipientType, recipientIds = [], templateId } = req.body || {};
    if (!recipientType || !['ALL_FAMILIES', 'SPECIFIC_CLASS', 'SPECIFIC_FAMILIES'].includes(recipientType)) {
      return res.status(400).json({ error: 'recipientType invalide' });
    }

    let finalSubject = subject;
    let finalBody = body;

    if (templateId) {
      const template = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
      if (!template) return res.status(404).json({ error: 'Template introuvable' });
      finalSubject = finalSubject || template.subject;
      finalBody = finalBody || template.body;
    }

    if (!finalSubject || !finalBody) {
      return res.status(400).json({ error: 'subject et body sont requis (ou templateId valide)' });
    }

    const recipients = await resolveRecipients(recipientType, recipientIds);
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'Aucun destinataire trouvé avec cette sélection' });
    }

    const deliveries = [];
    for (const recipient of recipients) {
      try {
        await sendMail({
          to: recipient.email,
          subject: finalSubject,
          html: finalBody,
        });
        deliveries.push({ ...recipient, status: 'SENT' });
      } catch (error) {
        deliveries.push({ ...recipient, status: 'FAILED', error: error.message });
      }
    }

    const successCount = deliveries.filter((d) => d.status === 'SENT').length;
    const failedCount = deliveries.length - successCount;
    const status = successCount === 0 ? 'FAILED' : failedCount > 0 ? 'PARTIAL' : 'SENT';

    const message = await prisma.message.create({
      data: {
        subject: finalSubject,
        body: finalBody,
        sentById: req.user?.id || null,
        sentAt: new Date(),
        recipientType,
        recipientIds,
        status,
        deliveryReport: {
          total: deliveries.length,
          sent: successCount,
          failed: failedCount,
          recipients: deliveries,
          templateId: templateId || null,
        },
      },
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_MESSAGE_SENT',
      entityType: 'Message',
      entityId: message.id,
      details: {
        recipientType,
        recipients: deliveries.length,
        successCount,
        failedCount,
      },
    });

    res.status(201).json({
      message: 'Message traité',
      result: {
        messageId: message.id,
        recipients: deliveries.length,
        successCount,
        failedCount,
        status,
      },
    });
  } catch (error) {
    console.error('Erreur sendMessage:', error);
    res.status(500).json({ error: 'Erreur envoi message' });
  }
}

async function getMessages(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sentBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.message.count(),
    ]);

    const normalized = messages.map((message) => ({
      ...message,
      recipientsCount: toNumber(message.deliveryReport?.total),
      successCount: toNumber(message.deliveryReport?.sent),
      failedCount: toNumber(message.deliveryReport?.failed),
    }));

    res.json({ messages: normalized, page, limit, total });
  } catch (error) {
    console.error('Erreur getMessages:', error);
    res.status(500).json({ error: 'Erreur chargement messages' });
  }
}

async function getMessageDetails(req, res) {
  try {
    const { id } = req.params;
    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        sentBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!message) return res.status(404).json({ error: 'Message introuvable' });

    res.json({ message });
  } catch (error) {
    console.error('Erreur getMessageDetails:', error);
    res.status(500).json({ error: 'Erreur détail message' });
  }
}

async function computeDashboardAlerts() {
  const now = new Date();
  const olderThan14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [paymentsRaw, classesRaw, unassignedTeachers, recentEnrollments] = await Promise.all([
    prisma.payment.findMany({
      where: {
        createdAt: { lte: olderThan14 },
        status: { in: ['OVERDUE', 'PENDING', 'PARTIAL'] },
      },
      select: { familyId: true, paidAmount: true, totalAmount: true },
    }),
    prisma.class.findMany({
      include: { level: { include: { pole: true } } },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.class.count({
      where: {
        teacherId: null,
        status: { in: ['OPEN', 'FULL'] },
      },
    }),
    prisma.enrollment.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] } },
      include: {
        student: true,
        class: { include: { level: { include: { pole: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const payments = paymentsRaw.filter((payment) => toNumber(payment.paidAmount) < toNumber(payment.totalAmount));
  const fullClasses = classesRaw.filter((cls) => cls.status === 'FULL' || toNumber(cls.enrolledCount) >= toNumber(cls.capacity));
  const familyIds = [...new Set(payments.map((payment) => payment.familyId))];

  return {
    unpaidOver14Days: {
      count: familyIds.length,
      familyIds,
    },
    fullClasses: {
      count: fullClasses.length,
      classes: fullClasses.map((cls) => ({
        id: cls.id,
        name: `${cls.level?.pole?.name || 'Pôle'} - ${cls.level?.name || 'Niveau'} (${cls.enrolledCount}/${cls.capacity})`,
      })),
    },
    unassignedTeachers: {
      count: unassignedTeachers,
    },
    recentRegistrations: recentEnrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      studentName: `${enrollment.student.lastName} ${enrollment.student.firstName}`,
      classId: enrollment.classId,
      className: `${enrollment.class.level?.pole?.name || 'Pôle'} - ${enrollment.class.level?.name || 'Niveau'}`,
      createdAt: enrollment.createdAt,
    })),
  };
}

async function getDashboardAlerts(_req, res) {
  try {
    const alerts = await computeDashboardAlerts();
    res.json({ alerts });
  } catch (error) {
    console.error('Erreur getDashboardAlerts:', error);
    res.status(500).json({ error: 'Erreur chargement alertes' });
  }
}

module.exports = {
  exportStudents,
  exportAttendanceSheet,
  exportPlanning,
  exportAccountingPayments: createAccountingExportHandler('payments'),
  exportAccountingUnpaid: createAccountingExportHandler('unpaid'),
  exportAccountingTransactions: createAccountingExportHandler('transactions'),
  exportAccountingAnnualSummary: createAccountingExportHandler('annual-summary'),
  getEnrollmentEvolution,
  getDistribution,
  getFillRate,
  getFinancialStatistics,
  duplicateSchoolYear,
  listEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  sendMessage,
  getMessages,
  getMessageDetails,
  computeDashboardAlerts,
  getDashboardAlerts,
};