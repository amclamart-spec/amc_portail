// Données mockées réalistes pour le tableau de bord
export const mockEnrollmentData = {
  header: {
    title: "Tableau de Bord — Inscriptions",
    subtitle: "Année scolaire 2024-2025",
    lastUpdated: new Date().toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  },

  // KPI Cards
  kpis: [
    {
      id: 'total',
      label: 'Total des inscrits',
      value: 1247,
      trend: 12,
      color: 'blue',
      icon: 'FiUsers',
      details: '+142 vs année précédente',
    },
    {
      id: 'validated',
      label: 'Inscriptions validées',
      value: 985,
      trend: 8,
      color: 'green',
      icon: 'FiCheckCircle',
      details: 'Prêtes pour la rentrée',
    },
    {
      id: 'pending',
      label: 'Inscriptions en attente',
      value: 186,
      trend: -5,
      color: 'orange',
      icon: 'FiClock',
      details: 'En cours de validation',
    },
    {
      id: 'test',
      label: 'Test de niveau requis',
      value: 76,
      trend: 3,
      color: 'purple',
      icon: 'FiClipboard',
      details: 'À programmer',
    },
  ],

  // Vue générale - Distribution par statut
  enrollmentByStatus: [
    { name: 'Validées', value: 985, fill: '#22c55e' },
    { name: 'En attente', value: 186, fill: '#f59e0b' },
    { name: 'En cours', value: 45, fill: '#3b82f6' },
    { name: 'Annulées', value: 22, fill: '#6b7280' },
    { name: 'Refusées', value: 9, fill: '#ef4444' },
  ],

  // Distribution Test/Sans test
  levelTestDistribution: [
    { name: 'Test requis', value: 76, fill: '#8b5cf6' },
    { name: 'Sans test', value: 1171, fill: '#d1d5db' },
  ],

  // Evolution sur les 12 dernières semaines
  enrollmentTrend: [
    { week: 'S1', inscrits: 65, week_num: 1 },
    { week: 'S2', inscrits: 78, week_num: 2 },
    { week: 'S3', inscrits: 92, week_num: 3 },
    { week: 'S4', inscrits: 105, week_num: 4 },
    { week: 'S5', inscrits: 118, week_num: 5 },
    { week: 'S6', inscrits: 142, week_num: 6 },
    { week: 'S7', inscrits: 156, week_num: 7 },
    { week: 'S8', inscrits: 168, week_num: 8 },
    { week: 'S9', inscrits: 179, week_num: 9 },
    { week: 'S10', inscrits: 185, week_num: 10 },
    { week: 'S11', inscrits: 192, week_num: 11 },
    { week: 'S12', inscrits: 205, week_num: 12 },
  ],

  // Inscriptions par semaine toute l'année
  enrollmentByWeek: [
    { week: 'S1', inscriptions: 65, maxInscriptions: 85, avg: 72 },
    { week: 'S2', inscriptions: 13, maxInscriptions: 85, avg: 72 },
    { week: 'S3', inscriptions: 14, maxInscriptions: 85, avg: 72 },
    { week: 'S4', inscriptions: 13, maxInscriptions: 85, avg: 72 },
    { week: 'S5', inscriptions: 13, maxInscriptions: 85, avg: 72 },
    { week: 'S6', inscriptions: 24, maxInscriptions: 85, avg: 72 },
    { week: 'S7', inscriptions: 14, maxInscriptions: 85, avg: 72 },
    { week: 'S8', inscriptions: 12, maxInscriptions: 85, avg: 72 },
    { week: 'S9', inscriptions: 11, maxInscriptions: 85, avg: 72 },
    { week: 'S10', inscriptions: 6, maxInscriptions: 85, avg: 72 },
    { week: 'S11', inscriptions: 7, maxInscriptions: 85, avg: 72 },
    { week: 'S12', inscriptions: 13, maxInscriptions: 85, avg: 72 },
    { week: 'S13', inscriptions: 45, maxInscriptions: 85, avg: 72 },
    { week: 'S14', inscriptions: 38, maxInscriptions: 85, avg: 72 },
    { week: 'S15', inscriptions: 42, maxInscriptions: 85, avg: 72 },
    { week: 'S16', inscriptions: 51, maxInscriptions: 85, avg: 72 },
    { week: 'S17', inscriptions: 63, maxInscriptions: 85, avg: 72 },
    { week: 'S18', inscriptions: 78, maxInscriptions: 85, avg: 72 },
    { week: 'S19', inscriptions: 85, maxInscriptions: 85, avg: 72 },
    { week: 'S20', inscriptions: 92, maxInscriptions: 95, avg: 72 },
    { week: 'S21', inscriptions: 75, maxInscriptions: 95, avg: 72 },
    { week: 'S22', inscriptions: 68, maxInscriptions: 95, avg: 72 },
    { week: 'S23', inscriptions: 45, maxInscriptions: 85, avg: 72 },
    { week: 'S24', inscriptions: 38, maxInscriptions: 85, avg: 72 },
    { week: 'S25', inscriptions: 35, maxInscriptions: 85, avg: 72 },
    { week: 'S26', inscriptions: 28, maxInscriptions: 85, avg: 72 },
    { week: 'S27', inscriptions: 22, maxInscriptions: 85, avg: 72 },
    { week: 'S28', inscriptions: 18, maxInscriptions: 85, avg: 72 },
    { week: 'S29', inscriptions: 15, maxInscriptions: 85, avg: 72 },
    { week: 'S30', inscriptions: 12, maxInscriptions: 85, avg: 72 },
    { week: 'S31', inscriptions: 10, maxInscriptions: 85, avg: 72 },
    { week: 'S32', inscriptions: 8, maxInscriptions: 85, avg: 72 },
    { week: 'S33', inscriptions: 6, maxInscriptions: 85, avg: 72 },
    { week: 'S34', inscriptions: 5, maxInscriptions: 85, avg: 72 },
    { week: 'S35', inscriptions: 4, maxInscriptions: 85, avg: 72 },
    { week: 'S36', inscriptions: 3, maxInscriptions: 85, avg: 72 },
  ],

  // Classes
  classes: [
    {
      id: 'A1.1',
      name: 'A1.1',
      enrolled: 28,
      capacity: 30,
      teacher: 'Marie Dupont',
      level: 'Débutant',
    },
    {
      id: 'A1.2',
      name: 'A1.2',
      enrolled: 29,
      capacity: 30,
      teacher: 'Jean Martin',
      level: 'Débutant',
    },
    {
      id: 'A2',
      name: 'A2',
      enrolled: 25,
      capacity: 30,
      teacher: 'Sophie Bernard',
      level: 'Élémentaire 1',
    },
    {
      id: 'B1',
      name: 'B1',
      enrolled: 22,
      capacity: 25,
      teacher: 'Pierre Lefevre',
      level: 'Élémentaire 2',
    },
    {
      id: 'B2',
      name: 'B2',
      enrolled: 24,
      capacity: 25,
      teacher: 'Isabelle Rousseau',
      level: 'Élémentaire 2',
    },
    {
      id: 'C1',
      name: 'C1',
      enrolled: 18,
      capacity: 20,
      teacher: 'Marc Petit',
      level: 'Intermédiaire',
    },
    {
      id: 'C2',
      name: 'C2',
      enrolled: 19,
      capacity: 20,
      teacher: 'Valérie Laurent',
      level: 'Intermédiaire',
    },
    {
      id: 'D1',
      name: 'D1',
      enrolled: 15,
      capacity: 20,
      teacher: 'Thomas Blanc',
      level: 'Avancé',
    },
  ],

  // Périodes pour les filtres
  periods: [
    { id: '2024-09', label: 'Septembre 2024' },
    { id: '2024-10', label: 'Octobre 2024' },
    { id: '2024-11', label: 'Novembre 2024' },
    { id: '2024-12', label: 'Décembre 2024' },
    { id: '2025-01', label: 'Janvier 2025' },
  ],

  // Années scolaires
  schoolYears: [
    { id: '2024-2025', label: '2024-2025' },
    { id: '2023-2024', label: '2023-2024' },
    { id: '2022-2023', label: '2022-2023' },
  ],
};

// Utilititaire pour calculer le pourcentage de remplissage
export const getClassFillPercentage = (enrolled, capacity) => {
  return Math.round((enrolled / capacity) * 100);
};

// Utilité pour obtenir la couleur basée sur le pourcentage
export const getClassFillColor = (percentage) => {
  if (percentage >= 90) return 'bg-green-500';
  if (percentage >= 70) return 'bg-orange-500';
  return 'bg-red-500';
};

// Utilité pour obtenir la couleur de badge
export const getClassFillBadgeColor = (percentage) => {
  if (percentage >= 90) return 'bg-green-100 text-green-800';
  if (percentage >= 70) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
};

// Utilité pour formater les chiffres
export const formatNumber = (num) => {
  return new Intl.NumberFormat('fr-FR').format(num);
};

// Utilité pour exporter les données en CSV
export const exportToCSV = (data, filename) => {
  const csv = convertToCSV(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (navigator.msSaveBlob) {
    navigator.msSaveBlob(blob, filename);
  } else {
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }
};

const convertToCSV = (data) => {
  if (!data || data.length === 0) return '';

  const keys = Object.keys(data[0]);
  const csv = [keys.join(',')];

  data.forEach((item) => {
    const values = keys.map((key) => {
      const value = item[key];
      return typeof value === 'string' && value.includes(',')
        ? `"${value}"`
        : value;
    });
    csv.push(values.join(','));
  });

  return csv.join('\n');
};
