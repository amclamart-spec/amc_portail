# 📋 Guide de structure des données

## Format des données attendues

Le dashboard utilise une structure de données spécifique. Cette documentation explique comment adapter le format des données reçues de l'API.

## 1. Structure KPI

```js
// Format attendu
{
  id: 'total',              // Identifiant unique
  label: 'Total des inscrits', // Label affiché
  value: 1247,              // Chiffre principal
  trend: 12,                // Tendance en % (+/-)
  color: 'blue',            // Couleur: blue, green, orange, purple
  icon: 'FiUsers',          // Icône React Icons
  details: '+142 vs année précédente' // Détails supplémentaires
}
```

### Exemple de conversion depuis API

```js
// API retourne
const apiData = {
  totalEnrollments: 1247,
  validatedEnrollments: 985,
  enrollmentsTrend: 0.12, // 12%
};

// Convertir au format du dashboard
const kpis = [
  {
    id: 'total',
    label: 'Total des inscrits',
    value: apiData.totalEnrollments,
    trend: Math.round(apiData.enrollmentsTrend * 100),
    color: 'blue',
    icon: 'FiUsers',
    details: `+${apiData.totalEnrollments - 1105} vs année précédente`,
  },
  // ... autres KPIs
];
```

## 2. Structure des graphiques Pie/Donut

```js
// Format attendu
[
  { name: 'Validées', value: 985, fill: '#22c55e' },
  { name: 'En attente', value: 186, fill: '#f59e0b' },
  { name: 'En cours', value: 45, fill: '#3b82f6' },
  { name: 'Annulées', value: 22, fill: '#6b7280' },
  { name: 'Refusées', value: 9, fill: '#ef4444' },
]
```

### Exemple de conversion

```js
// API retourne les statuts
const statuses = {
  VALIDATED: 985,
  PENDING: 186,
  PROCESSING: 45,
  CANCELLED: 22,
  REJECTED: 9,
};

// Mapper avec couleurs
const enrollmentByStatus = [
  { name: 'Validées', value: statuses.VALIDATED, fill: '#22c55e' },
  { name: 'En attente', value: statuses.PENDING, fill: '#f59e0b' },
  { name: 'En cours', value: statuses.PROCESSING, fill: '#3b82f6' },
  { name: 'Annulées', value: statuses.CANCELLED, fill: '#6b7280' },
  { name: 'Refusées', value: statuses.REJECTED, fill: '#ef4444' },
];
```

## 3. Structure du LineChart (Evolution)

```js
// Format attendu
[
  { week: 'S1', inscrits: 65, week_num: 1 },
  { week: 'S2', inscrits: 78, week_num: 2 },
  { week: 'S3', inscrits: 92, week_num: 3 },
  // ... 12 semaines
]
```

### Exemple de conversion

```js
// API retourne par dates
const enrollmentsByDate = [
  { date: '2024-09-02', count: 65 },
  { date: '2024-09-09', count: 13 },
  { date: '2024-09-16', count: 14 },
  // ...
];

// Convertir en semaines cumulatives
const enrollmentTrend = enrollmentsByDate.reduce((acc, item, index) => {
  const cumulative = acc.length ? acc[acc.length - 1].inscrits + item.count : item.count;
  return [...acc, {
    week: `S${index + 1}`,
    inscrits: cumulative,
    week_num: index + 1,
  }];
}, []);
```

## 4. Structure du BarChart (Hebdomadaire)

```js
// Format attendu
[
  { week: 'S1', inscriptions: 65, maxInscriptions: 85, avg: 72 },
  { week: 'S2', inscriptions: 13, maxInscriptions: 85, avg: 72 },
  // ... 36 semaines
]
```

### Exemple de conversion

```js
// API retourne les inscriptions par semaine
const weeklyData = [
  { week: 1, count: 65 },
  { week: 2, count: 13 },
  // ...
];

// Calculer la moyenne et max
const totalInscriptions = weeklyData.reduce((sum, item) => sum + item.count, 0);
const avgPerWeek = Math.round(totalInscriptions / weeklyData.length);
const maxInscriptions = Math.max(...weeklyData.map(item => item.count));

const enrollmentByWeek = weeklyData.map(item => ({
  week: `S${item.week}`,
  inscriptions: item.count,
  maxInscriptions: maxInscriptions,
  avg: avgPerWeek,
}));
```

## 5. Structure des classes

```js
// Format attendu
{
  id: 'A1.1',           // Identifiant unique
  name: 'A1.1',         // Nom affiché
  enrolled: 28,         // Nombre inscrits
  capacity: 30,         // Capacité max
  teacher: 'Marie Dupont', // Nom enseignant
  level: 'Débutant',    // Niveau
}
```

### Exemple de conversion

```js
// API retourne les classes avec effectifs
const classesData = [
  {
    id: 1,
    code: 'A1.1',
    maxStudents: 30,
    enrollments: [...],
    teacher: { name: 'Marie Dupont', id: 5 },
  },
  // ...
];

// Convertir au format du dashboard
const classes = classesData.map(cls => ({
  id: cls.code,
  name: cls.code,
  enrolled: cls.enrollments.length,
  capacity: cls.maxStudents,
  teacher: cls.teacher.name,
  level: cls.code.startsWith('A') ? 'Débutant' : 
         cls.code.startsWith('B') ? 'Élémentaire 2' : 
         'Avancé',
}));
```

## 6. Structure des statuts d'inscription

```js
// Statuts attendus (constants)
export const ENROLLMENT_STATUSES = {
  VALIDATED: 'validated',
  PENDING: 'pending',
  PROCESSING: 'processing',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
};
```

## 7. Fonction de conversion complète

```js
// utils/enrollmentDataMapper.js
export const mapAPIToChartData = (apiResponse) => {
  const {
    enrollments,
    classes,
    weeklyStats,
    trend,
  } = apiResponse;

  return {
    // KPIs
    kpis: [
      {
        id: 'total',
        label: 'Total des inscrits',
        value: enrollments.total,
        trend: Math.round((enrollments.trend / enrollments.previous) * 100),
        color: 'blue',
        icon: 'FiUsers',
        details: `+${enrollments.total - enrollments.previous} vs année précédente`,
      },
      {
        id: 'validated',
        label: 'Inscriptions validées',
        value: enrollments.validated,
        trend: enrollments.validatedTrend,
        color: 'green',
        icon: 'FiCheckCircle',
        details: 'Prêtes pour la rentrée',
      },
      // ... autres KPIs
    ],

    // Distribution par statut
    enrollmentByStatus: [
      { name: 'Validées', value: enrollments.validated, fill: '#22c55e' },
      { name: 'En attente', value: enrollments.pending, fill: '#f59e0b' },
      { name: 'En cours', value: enrollments.processing, fill: '#3b82f6' },
      { name: 'Annulées', value: enrollments.cancelled, fill: '#6b7280' },
      { name: 'Refusées', value: enrollments.rejected, fill: '#ef4444' },
    ],

    // Distribution test
    levelTestDistribution: [
      { name: 'Test requis', value: enrollments.testRequired, fill: '#8b5cf6' },
      { name: 'Sans test', value: enrollments.total - enrollments.testRequired, fill: '#d1d5db' },
    ],

    // Évolution
    enrollmentTrend: weeklyStats.slice(-12).map((stat, i) => ({
      week: `S${stat.week}`,
      inscrits: stat.cumulative,
      week_num: i + 1,
    })),

    // Données hebdomadaires
    enrollmentByWeek: weeklyStats.map((stat, i) => ({
      week: `S${stat.week}`,
      inscriptions: stat.count,
      maxInscriptions: Math.max(...weeklyStats.map(s => s.count)),
      avg: Math.round(weeklyStats.reduce((sum, s) => sum + s.count, 0) / weeklyStats.length),
    })),

    // Classes
    classes: classes.map(cls => ({
      id: cls.code,
      name: cls.code,
      enrolled: cls.studentCount,
      capacity: cls.maxCapacity,
      teacher: cls.teacherName,
      level: getClassLevel(cls.code),
    })),
  };
};
```

## 8. Migration depuis les données mockées vers l'API

### Étape 1: Créer un service API

```js
// api/enrollmentService.js
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export const enrollmentService = {
  getEnrollmentData: async (schoolYear, period = null) => {
    const params = new URLSearchParams({ schoolYear });
    if (period) params.append('period', period);
    
    const response = await axios.get(
      `${API_BASE}/admin/enrollments/statistics?${params}`
    );
    return response.data;
  },

  getClasses: async (schoolYear) => {
    const response = await axios.get(
      `${API_BASE}/admin/classes?schoolYear=${schoolYear}`
    );
    return response.data;
  },

  exportCSV: async (schoolYear) => {
    const response = await axios.get(
      `${API_BASE}/admin/enrollments/export?schoolYear=${schoolYear}&format=csv`,
      { responseType: 'blob' }
    );
    return response.data;
  },
};
```

### Étape 2: Créer un hook personnalisé

```js
// hooks/useEnrollmentData.js
import { useState, useEffect } from 'react';
import { enrollmentService } from '../api/enrollmentService';
import { mapAPIToChartData } from '../utils/enrollmentDataMapper';

export const useEnrollmentData = (schoolYear, period = null) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const apiResponse = await enrollmentService.getEnrollmentData(schoolYear, period);
        const mappedData = mapAPIToChartData(apiResponse);
        setData(mappedData);
        setError(null);
      } catch (err) {
        setError(err.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [schoolYear, period]);

  return { data, loading, error };
};
```

### Étape 3: Utiliser dans le composant

```js
// pages/EnrollmentDashboard/index.jsx
import { useEnrollmentData } from '../../hooks/useEnrollmentData';

export const EnrollmentDashboard = () => {
  const [schoolYear, setSchoolYear] = useState('2024-2025');
  const [period, setPeriod] = useState(null);
  
  const { data: dashboardData, loading, error } = useEnrollmentData(schoolYear, period);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!dashboardData) return <NoData />;

  return (
    // Utiliser dashboardData au lieu de mockEnrollmentData
  );
};
```

## 9. Format d'erreurs API

Gérer les erreurs de l'API:

```js
// Réponse d'erreur attendue
{
  status: 400,
  error: {
    code: 'INVALID_SCHOOL_YEAR',
    message: 'Invalid school year format',
    details: 'Expected format: YYYY-YYYY',
  }
}
```

## 10. Pagination pour les grandes données

```js
// Pour les données volumineuses
{
  data: [...],
  pagination: {
    page: 1,
    limit: 50,
    total: 1247,
    totalPages: 25,
  }
}

// Gestion côté client
const [page, setPage] = useState(1);
const limit = 50;
const offset = (page - 1) * limit;
```

---

Pour plus d'aide sur l'intégration API, voir [INSTALLATION.md](./INSTALLATION.md#-connexion-à-une-api)
