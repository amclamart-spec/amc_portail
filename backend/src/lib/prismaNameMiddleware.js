const { formatLastName, formatFirstName } = require('../utils/nameCase');

// Modèles du portail portant des champs Nom/Prénom saisis par un utilisateur, quel que
// soit son profil (famille, professeur, admin, bénévole, RH, bénéficiaire social...).
const NAME_MODELS = new Set(['User', 'Parent', 'Student', 'Teacher', 'EmergencyContact', 'SocialBeneficiary']);
const WRITE_ACTIONS = new Set(['create', 'update', 'upsert', 'createMany', 'updateMany']);

function normalizeDataObject(data) {
  if (!data || typeof data !== 'object') return;
  if (data.lastName !== undefined) data.lastName = formatLastName(data.lastName);
  if (data.firstName !== undefined) data.firstName = formatFirstName(data.firstName);
}

// Applique la casse Nom/Prénom à chaque écriture (create/update/upsert/createMany/
// updateMany), y compris dans les transactions interactives ($transaction), sans
// toucher aux autres champs (email, téléphone, etc.) ni aux recherches/filtres (read).
function applyNameCasing(prisma) {
  prisma.$use(async (params, next) => {
    if (NAME_MODELS.has(params.model) && WRITE_ACTIONS.has(params.action)) {
      const args = params.args || {};
      if (params.action === 'upsert') {
        normalizeDataObject(args.create);
        normalizeDataObject(args.update);
      } else if (params.action === 'createMany') {
        if (Array.isArray(args.data)) args.data.forEach(normalizeDataObject);
      } else {
        normalizeDataObject(args.data);
      }
    }
    return next(params);
  });
  return prisma;
}

module.exports = { applyNameCasing };
