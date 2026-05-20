# 🔧 Guide Avancé - Exemples de Customisation

## 1. Ajouter des graphiques personnalisés

### Exemple: Graphique radar pour profil des classes

```jsx
// Ajouter dans tabs.jsx
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

const classProfileData = [
  { aspect: 'Taux occupation', A11: 93, A12: 97, A2: 83, B1: 88, B2: 96 },
  { aspect: 'Assiduité', A11: 85, A12: 82, A2: 88, B1: 79, B2: 90 },
  { aspect: 'Progression', A11: 92, A12: 88, A2: 87, B1: 84, B2: 91 },
  { aspect: 'Engagament', A11: 89, A12: 86, A2: 85, B1: 81, B2: 88 },
];

export const ClassProfileChart = () => (
  <Card title="Profil des classes">
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={classProfileData}>
        <PolarGrid />
        <PolarAngleAxis dataKey="aspect" />
        <PolarRadiusAxis />
        <Radar name="A1.1" dataKey="A11" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.25} />
        <Radar name="A1.2" dataKey="A12" stroke="#22c55e" fill="#22c55e" fillOpacity={0.25} />
        <Legend />
      </RadarChart>
    </ResponsiveContainer>
  </Card>
);
```

## 2. Implémenter des filtres avancés

### Exemple: Filtrer par classe et statut

```jsx
// Ajouter dans index.jsx
import { useState, useMemo } from 'react';

export const EnrollmentDashboard = () => {
  const [selectedClasses, setSelectedClasses] = useState(['A1.1', 'A1.2']);
  const [selectedStatuses, setSelectedStatuses] = useState(['validated', 'pending']);

  // Données filtrées
  const filteredData = useMemo(() => {
    return mockEnrollmentData.enrollmentByStatus.filter(item => 
      selectedStatuses.includes(item.name.toLowerCase())
    );
  }, [selectedStatuses]);

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex gap-4 flex-wrap">
        {/* Sélecteur classes */}
        <select
          multiple
          value={selectedClasses}
          onChange={(e) => setSelectedClasses(Array.from(e.target.selectedOptions, opt => opt.value))}
          className="px-3 py-2 border rounded-lg"
        >
          {mockEnrollmentData.classes.map(cls => (
            <option key={cls.id} value={cls.id}>{cls.name}</option>
          ))}
        </select>

        {/* Sélecteur statuts */}
        <select
          multiple
          value={selectedStatuses}
          onChange={(e) => setSelectedStatuses(Array.from(e.target.selectedOptions, opt => opt.value))}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="validated">Validées</option>
          <option value="pending">En attente</option>
          <option value="processing">En cours</option>
          <option value="cancelled">Annulées</option>
          <option value="rejected">Refusées</option>
        </select>
      </div>

      {/* Graphique utilisant les données filtrées */}
      {/* ... */}
    </div>
  );
};
```

## 3. Ajouter des notifications/alertes

### Exemple: Alerter quand une classe est pleine

```jsx
// Ajouter dans components.jsx
import toast from 'react-hot-toast';

export const ClassAlert = ({ classes }) => {
  useEffect(() => {
    classes.forEach(cls => {
      const percentage = (cls.enrolled / cls.capacity) * 100;
      
      if (percentage >= 100) {
        toast.error(`Classe ${cls.name} est pleine!`, { duration: 5000 });
      } else if (percentage >= 95) {
        toast.custom((t) => (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <p className="font-semibold text-orange-900">⚠️ Classe ${cls.name} presque pleine!</p>
            <p className="text-sm text-orange-700">{percentage.toFixed(0)}% remplie</p>
          </div>
        ), { duration: 10000 });
      }
    });
  }, [classes]);
};
```

## 4. Ajouter un système de couleurs personnalisé par statut

### Exemple: Statuts avec couleurs dynamiques

```jsx
// Ajouter dans mockData.js
export const getStatusColor = (status) => {
  const colors = {
    validated: { bg: 'bg-green-100', text: 'text-green-800', badge: '✅' },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', badge: '⏳' },
    processing: { bg: 'bg-blue-100', text: 'text-blue-800', badge: '⚙️' },
    cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', badge: '❌' },
    rejected: { bg: 'bg-red-100', text: 'text-red-800', badge: '🚫' },
  };
  return colors[status] || colors.pending;
};

// Utilisation
export const EnrollmentStatus = ({ status, count }) => {
  const colors = getStatusColor(status);
  return (
    <div className={`px-4 py-2 rounded-lg ${colors.bg}`}>
      <p className={`font-semibold ${colors.text}`}>
        {colors.badge} {count}
      </p>
    </div>
  );
};
```

## 5. Implémenter un système de cache avec React Query

```jsx
// Ajouter dans hooks/useEnrollmentData.js
import { useQuery } from '@tanstack/react-query';

export const useEnrollmentData = (schoolYear) => {
  return useQuery({
    queryKey: ['enrollment', schoolYear],
    queryFn: () => fetchEnrollmentData(schoolYear),
    staleTime: 1000 * 60 * 5, // 5 minutes
    cacheTime: 1000 * 60 * 10, // 10 minutes
    refetchOnWindowFocus: false,
  });
};
```

## 6. Créer un rapport PDF exportable

```jsx
// Installer: npm install jspdf html2canvas

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const exportToPDF = async (elementId, filename) => {
  const element = document.getElementById(elementId);
  const canvas = await html2canvas(element);
  const image = canvas.toDataURL('image/png');
  
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const imgWidth = 280;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  
  pdf.addImage(image, 'PNG', 10, 10, imgWidth, imgHeight);
  pdf.save(filename);
};

// Utilisation
<button
  onClick={() => exportToPDF('dashboard-content', `dashboard-${schoolYear}.pdf`)}
  className="px-4 py-2 bg-red-600 text-white rounded-lg"
>
  📄 Exporter PDF
</button>
```

## 7. Ajouter un dashboard temps réel avec WebSocket

```jsx
// hooks/useRealtimeEnrollment.js
import { useEffect, useState } from 'react';

export const useRealtimeEnrollment = (schoolYear) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/api/enrollment/${schoolYear}`);

    ws.onmessage = (event) => {
      const newData = JSON.parse(event.data);
      setData(newData);
    };

    return () => ws.close();
  }, [schoolYear]);

  return data;
};
```

## 8. Ajouter des graphiques de comparaison année sur année

```jsx
// Ajouter dans tabs.jsx
import { ComposedChart } from 'recharts';

const yearComparison = [
  { week: 'S1', year2024: 65, year2023: 58, year2022: 52 },
  { week: 'S2', year2024: 78, year2023: 71, year2022: 64 },
  // ... autres semaines
];

export const YearComparisonChart = () => (
  <Card title="Comparaison année sur année">
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={yearComparison}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line dataKey="year2024" stroke="#0ea5e9" name="2024-2025" />
        <Line dataKey="year2023" stroke="#64748b" name="2023-2024" />
        <Line dataKey="year2022" stroke="#cbd5e1" name="2022-2023" />
      </LineChart>
    </ResponsiveContainer>
  </Card>
);
```

## 9. Créer un système de tableaux de bord personnalisés

```jsx
// hooks/useDashboardSettings.js
export const useDashboardSettings = (userId) => {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem(`dashboard-${userId}`);
    return saved ? JSON.parse(saved) : {
      visibleCharts: ['overview', 'weekly', 'classes'],
      chartSize: 'medium',
      theme: 'light',
    };
  });

  const updateSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem(`dashboard-${userId}`, JSON.stringify(newSettings));
  };

  return { settings, updateSettings };
};
```

## 10. Ajouter un système de métriques personnalisées

```jsx
// Ajouter dans mockData.js
export const calculateMetric = (type, data) => {
  switch (type) {
    case 'conversionRate':
      return ((data.validated / data.total) * 100).toFixed(1);
    
    case 'avgTimeToValidation':
      return Math.round(Math.random() * 14 + 1); // jours
    
    case 'dropoutRate':
      return ((data.cancelled / data.total) * 100).toFixed(1);
    
    case 'testRequiredRate':
      return ((data.test / data.total) * 100).toFixed(1);
    
    default:
      return 0;
  }
};

// Utilisation
const conversionRate = calculateMetric('conversionRate', {
  total: 1247,
  validated: 985,
});
```

## 11. Ajouter un système de notifications push

```jsx
// hooks/useNotifications.js
import { useEffect } from 'react';

export const useNotifications = () => {
  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  const notify = (title, options = {}) => {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        icon: '/logo.png',
        ...options,
      });
    }
  };

  return { notify };
};
```

## 12. Implémenter l'accessibilité ARIA

```jsx
// Ajouter à tous les composants interactifs
<div
  role="region"
  aria-label="KPI Cards Section"
  aria-live="polite"
  aria-atomic="false"
>
  <h2 id="kpi-heading" className="sr-only">Indicateurs clés de performance</h2>
  <div aria-describedby="kpi-heading">
    {/* KPI Cards */}
  </div>
</div>
```

---

Pour plus de détails, consultez:
- [Documentation React](https://react.dev)
- [Documentation Recharts](https://recharts.org)
- [Documentation Tailwind CSS](https://tailwindcss.com)
- [Documentation React Query](https://tanstack.com/query/latest)
