const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { POLE_ROLE_TO_NAME } = require('../middleware/poleManagerDelegation');
const { teacherHasClassAccess } = require('../utils/classAccessUtils');

const prisma = new PrismaClient();
const router = Router();

// Accès à un justificatif d'absence : la famille de l'élève, l'administration, le
// responsable du pôle de la classe, ou un professeur de la classe.
async function canAccess(user, document) {
  const roles = user.roles || [user.role];
  const evaluation = document.evaluation;
  const cls = evaluation.lesson.class;

  if (roles.includes('ADMIN') || roles.includes('SUPER_ADMIN')) return true;
  if (roles.includes('FAMILLE') && evaluation.student.family?.userId === user.id) return true;

  const classPole = (cls.level?.pole?.name || '').toLowerCase();
  if (roles.some((r) => POLE_ROLE_TO_NAME[r] && POLE_ROLE_TO_NAME[r].toLowerCase() === classPole)) return true;

  if (roles.includes('PROFESSEUR')) {
    const teacher = await prisma.teacher.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (teacher && teacherHasClassAccess(cls, teacher.id)) return true;
  }
  return false;
}

router.get('/:id', authenticate, async (req, res) => {
  try {
    const document = await prisma.absenceJustificationDocument.findUnique({
      where: { id: req.params.id },
      include: {
        file: true,
        evaluation: {
          include: {
            student: { include: { family: { select: { userId: true } } } },
            lesson: { include: { class: { include: { level: { include: { pole: true } }, classTeachers: true } } } },
          },
        },
      },
    });
    if (!document) return res.status(404).json({ error: 'Document introuvable' });
    if (!(await canAccess(req.user, document))) return res.status(403).json({ error: 'Accès non autorisé à ce document' });
    if (!document.file) return res.status(404).json({ error: 'Le fichier de ce document n\'est plus disponible' });

    const { file } = document;
    const asciiName = document.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(document.fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(Buffer.from(file.data));
  } catch (error) {
    console.error('Erreur téléchargement justificatif d\'absence:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
