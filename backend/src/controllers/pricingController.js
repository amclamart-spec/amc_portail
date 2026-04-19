const { PrismaClient } = require('@prisma/client');
const { normalizePricingConfig } = require('../services/pricingService');

const prisma = new PrismaClient();

function mapPayloadToDb(payload = {}) {
  return {
    registrationFee: payload.registrationFee,
    arabicTier1: payload.arabicTier1,
    arabicTier2: payload.arabicTier2,
    arabicTier3: payload.arabicTier3,
    arabicTier4: payload.arabicTier4,
    arabicTier5: payload.arabicTier5,
    arabicExtraPerStudent: payload.arabicExtraPerStudent,
    coranEnfant: payload.coranEnfant,
    coranAdulteHomme: payload.coranAdulteHomme,
    coranAdulteFemme: payload.coranAdulteFemme,
    sciencesIslamiques: payload.sciencesIslamiques,
  };
}

async function getPricingConfig(_req, res) {
  try {
    const active = await prisma.pricingConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!active) {
      return res.json({
        pricingConfig: normalizePricingConfig(null),
        source: 'default',
      });
    }

    return res.json({
      pricingConfig: normalizePricingConfig(active),
      raw: active,
      source: 'database',
    });
  } catch (error) {
    console.error('Erreur getPricingConfig:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updatePricingConfig(req, res) {
  try {
    const payload = mapPayloadToDb(req.body);

    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && (Number.isNaN(Number(value)) || Number(value) < 0)) {
        throw new Error(`Valeur invalide pour ${key}`);
      }
    });

    await prisma.pricingConfig.updateMany({ where: { isActive: true }, data: { isActive: false } });

    const created = await prisma.pricingConfig.create({
      data: {
        ...payload,
        isActive: true,
        createdById: req.user?.id || null,
        updatedById: req.user?.id || null,
      },
    });

    return res.json({
      message: 'Configuration tarifaire mise à jour',
      pricingConfig: normalizePricingConfig(created),
      raw: created,
    });
  } catch (error) {
    console.error('Erreur updatePricingConfig:', error);
    return res.status(400).json({ error: error.message || 'Erreur de validation' });
  }
}

module.exports = {
  getPricingConfig,
  updatePricingConfig,
};
