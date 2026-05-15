const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createActivityLog({ userId, action, entityType, entityId, details }) {
  if (!action || !entityType) return null;

  try {
    return await prisma.activityLog.create({
      data: {
        userId: userId || null,
        action,
        entityType,
        entityId: entityId || null,
        details: details || null,
      },
    });
  } catch (error) {
    console.error('Erreur createActivityLog:', error);
    return null;
  }
}

module.exports = {
  createActivityLog,
};
