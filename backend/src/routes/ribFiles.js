const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize } = require('../middleware/auth');

const prisma = new PrismaClient();
const router = Router();

// Téléchargement d'un RIB (données bancaires) : réservé aux rôles qui consultent
// le détail des paiements.
router.get('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN', 'TRESORIER'), async (req, res) => {
  try {
    const ribFile = await prisma.ribFile.findUnique({ where: { id: req.params.id } });
    if (!ribFile) return res.status(404).json({ error: 'RIB introuvable' });

    const asciiName = ribFile.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    res.setHeader('Content-Type', ribFile.mimeType);
    res.setHeader('Content-Length', ribFile.size);
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(ribFile.fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(Buffer.from(ribFile.data));
  } catch (error) {
    console.error('Erreur téléchargement RIB:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
