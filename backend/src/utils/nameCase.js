// Casse imposée pour tous les champs Nom/Prénom du portail (User, Parent, Student,
// Teacher, EmergencyContact, SocialBeneficiary) : Nom en majuscules, Prénom avec
// uniquement la première lettre en majuscule. N'affecte aucun autre champ (email, etc.)
// et les recherches/filtres restent insensibles à la casse (voir prismaNameMiddleware.js).

function formatLastName(value) {
  if (value === undefined || value === null) return value;
  const str = String(value).trim();
  if (!str) return str;
  return str.toUpperCase();
}

function formatFirstName(value) {
  if (value === undefined || value === null) return value;
  const str = String(value).trim();
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = { formatLastName, formatFirstName };
