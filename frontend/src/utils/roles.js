export const ROLE_HOME = {
  SUPER_ADMIN: '/super-admin',
  ADMIN: '/admin',
  TRESORIER: '/tresorier',
  PROFESSEUR: '/professeur',
  FAMILLE: '/famille',
};

export const ROLE_LABEL = {
  SUPER_ADMIN: 'Super Administration',
  ADMIN: 'Administration',
  TRESORIER: 'Trésorerie',
  PROFESSEUR: 'Espace Professeur',
  FAMILLE: 'Espace Famille',
};

export function getHomeForRole(role) {
  return ROLE_HOME[role] || '/login';
}
