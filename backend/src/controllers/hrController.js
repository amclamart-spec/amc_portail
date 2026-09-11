const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { applyNameCasing } = require('../lib/prismaNameMiddleware');
const { savePayslipFile, deletePayslipFile } = require('../utils/payslipUtils');
const { saveContractFile, deleteContractFile } = require('../utils/contractUtils');
const { sendAccountApprovedEmail, sendAccountRejectedEmail, sendAccountInvitationEmail, sendEmployeeRoleAddedEmail } = require('../services/emailService');

const prisma = applyNameCasing(new PrismaClient());

const CONTRACT_TYPES = ['CDI', 'CDD', 'INTERIM', 'ALTERNANCE', 'STAGE', 'AUTRE'];
const LEAVE_TYPES = ['CONGES_PAYES', 'MALADIE', 'AUTRE'];

const USER_PUBLIC_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  validationStatus: true,
  isActive: true,
  createdAt: true,
};

const EMPLOYEE_SELECT = {
  id: true,
  position: true,
  hireDate: true,
  contractType: true,
  contractFileUrl: true,
  contractFileName: true,
  leaveBalanceDays: true,
  observations: true,
  createdAt: true,
  updatedAt: true,
};

function fmtEmployee(user) {
  const { employeeProfile, ...rest } = user;
  return { ...rest, employee: employeeProfile || null };
}

async function ensureEmployeeProfile(userId) {
  return prisma.employee.upsert({ where: { userId }, create: { userId }, update: {} });
}

// Décompte en jours ouvrés (lun-ven), bornes incluses.
function countBusinessDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

async function getDashboard(req, res) {
  try {
    const isEmployee = { OR: [{ role: 'SALARIE' }, { additionalRoles: { some: { role: 'SALARIE' } } }] };
    const [pendingCount, activeCount, pendingLeavesCount] = await Promise.all([
      prisma.user.count({ where: { role: 'SALARIE', validationStatus: 'PENDING' } }),
      prisma.user.count({ where: { AND: [isEmployee, { validationStatus: 'APPROVED' }] } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return res.json({ pendingCount, activeCount, pendingLeavesCount });
  } catch (error) {
    console.error('Erreur getDashboard (hr):', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── SALARIÉS (gestion, responsable RH) ────────────────────────────────────────

async function getPendingEmployees(req, res) {
  try {
    const employees = await prisma.user.findMany({
      where: { role: 'SALARIE', validationStatus: 'PENDING' },
      select: USER_PUBLIC_FIELDS,
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ employees });
  } catch (error) {
    console.error('Erreur getPendingEmployees:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getEmployees(req, res) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const isEmployee = { OR: [{ role: 'SALARIE' }, { additionalRoles: { some: { role: 'SALARIE' } } }] };
    const where = {
      AND: [
        isEmployee,
        { validationStatus: 'APPROVED' },
        ...(search ? [{
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }] : []),
      ],
    };
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { ...USER_PUBLIC_FIELDS, employeeProfile: { select: EMPLOYEE_SELECT } },
        skip,
        take: Number(limit),
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);
    return res.json({ employees: users.map(fmtEmployee), total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) || 1 });
  } catch (error) {
    console.error('Erreur getEmployees:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function approveEmployee(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'SALARIE') return res.status(404).json({ error: 'Salarié introuvable' });

    const updated = await prisma.user.update({ where: { id }, data: { validationStatus: 'APPROVED' } });
    await ensureEmployeeProfile(id);
    await sendAccountApprovedEmail(updated);
    return res.json({ employee: { id: updated.id, validationStatus: updated.validationStatus } });
  } catch (error) {
    console.error('Erreur approveEmployee:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function rejectEmployee(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'SALARIE') return res.status(404).json({ error: 'Salarié introuvable' });

    const updated = await prisma.user.update({ where: { id }, data: { validationStatus: 'REJECTED' } });
    await sendAccountRejectedEmail(updated, reason);
    return res.json({ employee: { id: updated.id, validationStatus: updated.validationStatus } });
  } catch (error) {
    console.error('Erreur rejectEmployee:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createEmployee(req, res) {
  try {
    const { firstName, lastName, email, phone } = req.body;
    if (!firstName || !lastName || !email) return res.status(400).json({ error: 'Prénom, nom et email sont requis' });

    const existing = await prisma.user.findUnique({ where: { email }, include: { additionalRoles: { select: { role: true } } } });

    if (existing) {
      const alreadyEmployee = existing.role === 'SALARIE' || existing.additionalRoles.some((r) => r.role === 'SALARIE');
      if (alreadyEmployee) return res.status(409).json({ error: 'Ce compte est déjà salarié' });

      await prisma.userRole.create({ data: { userId: existing.id, role: 'SALARIE' } });
      await ensureEmployeeProfile(existing.id);

      try {
        await sendEmployeeRoleAddedEmail(existing);
      } catch (emailError) {
        console.error('Erreur envoi email ajout rôle salarié:', emailError);
      }

      return res.status(200).json({
        employee: { id: existing.id, email: existing.email, firstName: existing.firstName, lastName: existing.lastName },
        addedToExistingAccount: true,
      });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    const user = await prisma.user.create({
      data: {
        email,
        provider: 'local',
        firstName,
        lastName,
        phone: phone || null,
        role: 'SALARIE',
        validationStatus: 'APPROVED',
        emailVerified: true,
        resetPasswordToken: token,
        resetPasswordExpires: expires,
      },
    });
    await ensureEmployeeProfile(user.id);

    try {
      await sendAccountInvitationEmail(user, token);
    } catch (emailError) {
      console.error('Erreur envoi email invitation salarié:', emailError);
    }

    return res.status(201).json({ employee: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } });
  } catch (error) {
    console.error('Erreur createEmployee:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateEmployeeDetails(req, res) {
  try {
    const { id } = req.params; // user id
    const { firstName, lastName, email, phone } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'SALARIE') return res.status(404).json({ error: 'Salarié introuvable' });

    if (email && email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
      },
      select: USER_PUBLIC_FIELDS,
    });
    return res.json({ employee: updated });
  } catch (error) {
    console.error('Erreur updateEmployeeDetails:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function generateEmployeePassword(req, res) {
  try {
    const { id } = req.params; // user id
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'SALARIE') return res.status(404).json({ error: 'Salarié introuvable' });

    const temporaryPassword = `AMC-${crypto.randomBytes(5).toString('hex')}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await prisma.user.update({ where: { id }, data: { passwordHash, resetPasswordToken: null, resetPasswordExpires: null } });
    return res.json({ password: temporaryPassword });
  } catch (error) {
    console.error('Erreur generateEmployeePassword:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function toggleEmployeeActive(req, res) {
  try {
    const { id } = req.params; // user id
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive doit être un booléen' });

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'SALARIE') return res.status(404).json({ error: 'Salarié introuvable' });
    if (req.user.id === id && !isActive) return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });

    const updated = await prisma.user.update({ where: { id }, data: { isActive } });
    return res.json({ employee: { id: updated.id, isActive: updated.isActive } });
  } catch (error) {
    console.error('Erreur toggleEmployeeActive:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateEmployeeInfo(req, res) {
  try {
    const { id } = req.params; // employee id (Employee.id)
    const { position, hireDate, contractType, observations } = req.body;

    if (contractType !== undefined && contractType !== null && !CONTRACT_TYPES.includes(contractType)) {
      return res.status(400).json({ error: 'Type de contrat invalide' });
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...(position !== undefined && { position }),
        ...(hireDate !== undefined && { hireDate: hireDate ? new Date(hireDate) : null }),
        ...(contractType !== undefined && { contractType: contractType || null }),
        ...(observations !== undefined && { observations }),
      },
      select: EMPLOYEE_SELECT,
    });
    return res.json({ employee });
  } catch (error) {
    console.error('Erreur updateEmployeeInfo:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateLeaveBalance(req, res) {
  try {
    const { id } = req.params; // employee id
    const { leaveBalanceDays } = req.body;
    if (typeof leaveBalanceDays !== 'number' || Number.isNaN(leaveBalanceDays)) {
      return res.status(400).json({ error: 'Solde invalide' });
    }
    const employee = await prisma.employee.update({ where: { id }, data: { leaveBalanceDays }, select: EMPLOYEE_SELECT });
    return res.json({ employee });
  } catch (error) {
    console.error('Erreur updateLeaveBalance:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── CONGÉS (gestion, responsable RH) ──────────────────────────────────────────

async function getPendingLeaves(req, res) {
  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ leaves });
  } catch (error) {
    console.error('Erreur getPendingLeaves:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getEmployeeLeaves(req, res) {
  try {
    const { id } = req.params; // employee id
    const leaves = await prisma.leaveRequest.findMany({ where: { employeeId: id }, orderBy: { startDate: 'desc' } });
    return res.json({ leaves });
  } catch (error) {
    console.error('Erreur getEmployeeLeaves:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function decideLeaveRequest(req, res) {
  try {
    const { leaveId } = req.params;
    const { status, rejectionReason } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });

    const leave = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!leave) return res.status(404).json({ error: 'Demande introuvable' });
    if (leave.status !== 'PENDING') return res.status(400).json({ error: 'Cette demande a déjà été traitée' });

    const updated = await prisma.$transaction(async (tx) => {
      const decided = await tx.leaveRequest.update({
        where: { id: leaveId },
        data: {
          status,
          rejectionReason: status === 'REJECTED' ? (rejectionReason || null) : null,
          decidedBy: req.user.id,
          decidedAt: new Date(),
        },
      });
      if (status === 'APPROVED' && leave.type === 'CONGES_PAYES') {
        const employee = await tx.employee.findUnique({ where: { id: leave.employeeId } });
        const currentBalance = employee.leaveBalanceDays ?? 0;
        await tx.employee.update({ where: { id: leave.employeeId }, data: { leaveBalanceDays: currentBalance - leave.daysCount } });
      }
      return decided;
    });
    return res.json({ leave: updated });
  } catch (error) {
    console.error('Erreur decideLeaveRequest:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function uploadContract(req, res) {
  try {
    const { id } = req.params; // employee id
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) return res.status(404).json({ error: 'Salarié introuvable' });

    if (employee.contractFileUrl) deleteContractFile(employee.contractFileUrl);

    const fileInfo = saveContractFile(id, req.file);
    const updated = await prisma.employee.update({
      where: { id },
      data: { contractFileUrl: fileInfo.relativePath, contractFileName: fileInfo.fileName },
      select: EMPLOYEE_SELECT,
    });
    return res.status(201).json({ employee: updated });
  } catch (error) {
    console.error('Erreur uploadContract:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── PROFIL PERSONNEL (salarié) ────────────────────────────────────────────────

async function getMyProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { ...USER_PUBLIC_FIELDS, employeeProfile: { select: EMPLOYEE_SELECT } },
    });
    if (!user) return res.status(404).json({ error: 'Profil introuvable' });
    return res.json({ employee: fmtEmployee(user) });
  } catch (error) {
    console.error('Erreur getMyProfile (hr):', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateMyProfile(req, res) {
  try {
    const { firstName, lastName, phone } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Prénom et nom requis' });

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { firstName, lastName, phone: phone || null },
      select: { ...USER_PUBLIC_FIELDS, employeeProfile: { select: EMPLOYEE_SELECT } },
    });
    return res.json({ employee: fmtEmployee(updated) });
  } catch (error) {
    console.error('Erreur updateMyProfile (hr):', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── CONGÉS (salarié) ───────────────────────────────────────────────────────────

async function getMyLeaves(req, res) {
  try {
    const employee = await prisma.employee.findUnique({ where: { userId: req.user.id } });
    if (!employee) return res.json({ leaves: [], balance: null });
    const leaves = await prisma.leaveRequest.findMany({ where: { employeeId: employee.id }, orderBy: { startDate: 'desc' } });
    return res.json({ leaves, balance: employee.leaveBalanceDays });
  } catch (error) {
    console.error('Erreur getMyLeaves:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createMyLeaveRequest(req, res) {
  try {
    const { type, startDate, endDate, reason } = req.body;
    if (!LEAVE_TYPES.includes(type)) return res.status(400).json({ error: 'Type de congé invalide' });
    if (!startDate || !endDate) return res.status(400).json({ error: 'Dates de début et de fin requises' });

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ error: 'Période invalide' });
    }

    const employee = await ensureEmployeeProfile(req.user.id);
    const daysCount = countBusinessDays(start, end);
    const leave = await prisma.leaveRequest.create({
      data: { employeeId: employee.id, type, startDate: start, endDate: end, daysCount, reason: reason || null },
    });
    return res.status(201).json({ leave });
  } catch (error) {
    console.error('Erreur createMyLeaveRequest:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function cancelMyLeaveRequest(req, res) {
  try {
    const { leaveId } = req.params;
    const employee = await prisma.employee.findUnique({ where: { userId: req.user.id } });
    const leave = employee ? await prisma.leaveRequest.findUnique({ where: { id: leaveId } }) : null;
    if (!leave || leave.employeeId !== employee.id) return res.status(404).json({ error: 'Demande introuvable' });
    if (leave.status !== 'PENDING') return res.status(400).json({ error: 'Seule une demande en attente peut être annulée' });

    await prisma.leaveRequest.delete({ where: { id: leaveId } });
    return res.status(204).send();
  } catch (error) {
    console.error('Erreur cancelMyLeaveRequest:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── FICHES DE PAIE ─────────────────────────────────────────────────────────────

async function getEmployeePayslips(req, res) {
  try {
    const { id } = req.params; // employee id
    const payslips = await prisma.payslip.findMany({ where: { employeeId: id }, orderBy: { period: 'desc' } });
    return res.json({ payslips });
  } catch (error) {
    console.error('Erreur getEmployeePayslips:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function uploadPayslip(req, res) {
  try {
    const { id } = req.params; // employee id
    const { period } = req.body;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: 'Période invalide (format attendu AAAA-MM)' });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) return res.status(404).json({ error: 'Salarié introuvable' });

    const existing = await prisma.payslip.findUnique({ where: { employeeId_period: { employeeId: id, period } } });
    if (existing) deletePayslipFile(existing.fileUrl);

    const fileInfo = savePayslipFile(id, period, req.file);
    const payslip = await prisma.payslip.upsert({
      where: { employeeId_period: { employeeId: id, period } },
      create: { employeeId: id, period, fileUrl: fileInfo.relativePath, fileName: fileInfo.fileName, uploadedBy: req.user.id },
      update: { fileUrl: fileInfo.relativePath, fileName: fileInfo.fileName, uploadedBy: req.user.id },
    });
    return res.status(201).json({ payslip });
  } catch (error) {
    console.error('Erreur uploadPayslip:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deletePayslip(req, res) {
  try {
    const { payslipId } = req.params;
    const payslip = await prisma.payslip.findUnique({ where: { id: payslipId } });
    if (!payslip) return res.status(404).json({ error: 'Fiche de paie introuvable' });

    await prisma.payslip.delete({ where: { id: payslipId } });
    deletePayslipFile(payslip.fileUrl);
    return res.status(204).send();
  } catch (error) {
    console.error('Erreur deletePayslip:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getMyPayslips(req, res) {
  try {
    const employee = await prisma.employee.findUnique({ where: { userId: req.user.id } });
    if (!employee) return res.json({ payslips: [] });
    const payslips = await prisma.payslip.findMany({ where: { employeeId: employee.id }, orderBy: { period: 'desc' } });
    return res.json({ payslips });
  } catch (error) {
    console.error('Erreur getMyPayslips:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getDashboard,
  getPendingEmployees, getEmployees, approveEmployee, rejectEmployee, createEmployee, updateEmployeeInfo,
  updateEmployeeDetails, generateEmployeePassword, toggleEmployeeActive,
  uploadContract,
  updateLeaveBalance, getPendingLeaves, getEmployeeLeaves, decideLeaveRequest,
  getMyProfile, updateMyProfile,
  getMyLeaves, createMyLeaveRequest, cancelMyLeaveRequest,
  getEmployeePayslips, uploadPayslip, deletePayslip, getMyPayslips,
};
