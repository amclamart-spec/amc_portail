export const ROLE_HOME = {
  SUPER_ADMIN: '/admin',
  ADMIN: '/admin',
  TRESORIER: '/tresorier',
  PROFESSEUR: '/professeur',
  FAMILLE: '/famille',
  RESPONSABLE_POLE_CORAN:      '/admin',
  RESPONSABLE_POLE_ARABE:      '/admin',
  RESPONSABLE_POLE_SOUTIEN_SCO: '/admin',
  RESPONSABLE_POLE_SCIENCE_IS:  '/admin',
};

export const ROLE_LABEL = {
  SUPER_ADMIN: 'Super Administration',
  ADMIN: 'Administration',
  TRESORIER: 'Trésorerie',
  PROFESSEUR: 'Espace Professeur',
  FAMILLE: 'Espace Famille',
  RESPONSABLE_POLE_CORAN:       'Responsable Pôle Coran',
  RESPONSABLE_POLE_ARABE:       'Responsable Pôle Arabe',
  RESPONSABLE_POLE_SOUTIEN_SCO: 'Responsable Pôle Soutien Scolaire',
  RESPONSABLE_POLE_SCIENCE_IS:  'Responsable Pôle Sciences Islamiques',
};

export const RESPONSABLE_POLE_ROLES = [
  'RESPONSABLE_POLE_CORAN',
  'RESPONSABLE_POLE_ARABE',
  'RESPONSABLE_POLE_SOUTIEN_SCO',
  'RESPONSABLE_POLE_SCIENCE_IS',
];

export function getHomeForRole(role) {
  return ROLE_HOME[role] || '/login';
}
