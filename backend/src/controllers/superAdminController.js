const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getAdmins(req, res) {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'TRESORIER', 'PROFESSEUR'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        validationStatus: true,
        createdAt: true,
      },
    });

    res.json({ users });
  } catch (error) {
    console.error('Erreur getAdmins:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateUserRole(req, res) {
  try {
    const { role } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    res.json({ user, message: 'Rôle utilisateur mis à jour' });
  } catch (error) {
    console.error('Erreur updateUserRole:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getAdmins,
  updateUserRole,
};
