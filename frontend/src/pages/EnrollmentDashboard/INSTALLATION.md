# 📦 Guide d'installation - Tableau de Bord des Inscriptions

## ✅ Pré-requis

- Node.js >= 16.0
- npm >= 8.0 ou yarn >= 3.0
- React >= 18.3
- Projet existant avec Vite

## 🚀 Installation rapide

### Étape 1: Installer les dépendances

```bash
cd frontend
npm install
```

### Étape 2: Vérifier les dépendances ajoutées

Les packages suivants ont été ajoutés au `package.json`:

```json
{
  "dependencies": {
    "recharts": "^2.10.0",
    "tailwindcss": "^3.3.0",
    "classnames": "^2.3.2",
    "date-fns": "^2.30.0",
    "papaparse": "^5.4.1"
  },
  "devDependencies": {
    "postcss": "^8.4.31",
    "autoprefixer": "^10.4.16",
    "@tailwindcss/forms": "^0.5.6"
  }
}
```

### Étape 3: Vérifier les fichiers de configuration

Les fichiers suivants ont été créés/modifiés:

- ✅ `tailwind.config.js` - Configuration Tailwind CSS
- ✅ `postcss.config.js` - Configuration PostCSS
- ✅ `src/index.css` - Mise à jour avec directives @tailwind
- ✅ `src/App.jsx` - Route `/admin/tableau-inscriptions` ajoutée

### Étape 4: Vérifier la structure des fichiers

```
frontend/
├── tailwind.config.js          ✅ Créé
├── postcss.config.js           ✅ Créé
├── src/
│   ├── index.css               ✅ Mis à jour
│   ├── App.jsx                 ✅ Mis à jour
│   └── pages/
│       └── EnrollmentDashboard/
│           ├── index.jsx       ✅ Créé
│           ├── mockData.js     ✅ Créé
│           ├── components.jsx  ✅ Créé
│           ├── tabs.jsx        ✅ Créé
│           └── README.md       ✅ Créé
```

## 🏃 Démarrer le projet

### Mode développement

```bash
npm run dev
```

Le serveur Vite démarre sur `http://localhost:5173` (ou port suivant disponible)

### Mode production

```bash
npm run build
npm run preview
```

## 🌐 Accéder au tableau de bord

### 1. Se connecter

- URL: `http://localhost:5173/login`
- Utiliser les identifiants ADMIN

### 2. Accéder au tableau de bord

- URL directe: `http://localhost:5173/admin/tableau-inscriptions`
- Ou via le menu d'administration (selon implémentation du Layout)

### 3. Vérifier les fonctionnalités

- ✅ 4 KPI cards avec tendances
- ✅ 3 onglets (Vue générale, Hebdomadaire, Classes)
- ✅ Graphiques Recharts
- ✅ Filtres et sélecteur année
- ✅ Dark mode (bouton lune en header)
- ✅ Export CSV
- ✅ Design responsive

## 🎨 Personnalisation

### Modifier les couleurs

Éditer `tailwind.config.js`:

```js
colors: {
  primary: {
    50: '#f0f7ff',
    500: '#0ea5e9',
    600: '#0284c7',
    // ... autres variantes
  }
}
```

### Modifier les données mockées

Éditer `src/pages/EnrollmentDashboard/mockData.js`:

```js
export const mockEnrollmentData = {
  kpis: [
    {
      id: 'total',
      label: 'Total des inscrits',
      value: 1247, // Modifier ici
      // ... autres champs
    }
  ],
  // ... autres données
};
```

### Ajouter des animations

Dans `tailwind.config.js`:

```js
animation: {
  'fade-in': 'fadeIn 0.3s ease-in',
  'slide-up': 'slideUp 0.3s ease-out',
  // ... ajouter d'autres animations
}
```

## 🔗 Connexion à une API

Pour remplacer les données mockées par une API réelle:

### 1. Créer un hook useEnrollmentData

```jsx
// src/hooks/useEnrollmentData.js
import { useEffect, useState } from 'react';
import { getEnrollmentData } from '../api/enrollments';

export const useEnrollmentData = (schoolYear) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await getEnrollmentData(schoolYear);
        setData(result);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [schoolYear]);

  return { data, loading, error };
};
```

### 2. Utiliser le hook dans le dashboard

```jsx
import { useEnrollmentData } from '../hooks/useEnrollmentData';

export const EnrollmentDashboard = () => {
  const [schoolYear, setSchoolYear] = useState('2024-2025');
  const { data, loading, error } = useEnrollmentData(schoolYear);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    // ... utiliser data au lieu de mockEnrollmentData
  );
};
```

## 🐛 Dépannage

### Erreur: "Cannot find module 'recharts'"

```bash
npm install recharts
```

### Erreur: Tailwind CSS ne fonctionne pas

1. Vérifier que `@tailwind` directives sont dans `src/index.css`
2. Relancer le serveur: `npm run dev`
3. Nettoyer le cache: `rm -rf node_modules/.vite`

### Erreur: Mode sombre ne fonctionne pas

- Vérifier `darkMode: 'class'` dans `tailwind.config.js`
- Vérifier que le bouton toggle ajoute la classe `.dark` sur `document.documentElement`

### Erreur: Les icônes ne s'affichent pas

```bash
npm install react-icons
```

## 📱 Tester la responsivité

- **Desktop**: Largeur > 1024px
- **Tablet**: 768px - 1024px
- **Mobile**: < 768px

Utiliser les outils de développement du navigateur (F12) pour tester la réactivité.

## 📈 Prochaines étapes

1. **Connecter l'API backend**
   - Récupérer les données réelles de la base de données
   - Implémenter la pagination et les filtres côté serveur

2. **Ajouter des permissions granulaires**
   - Vérifier les droits d'accès par rôle
   - Masquer certaines données selon les permissions

3. **Améliorer les performances**
   - Implémenter la mise en cache
   - Utiliser React.memo pour les composants lourds
   - Optimiser les requêtes API

4. **Étendre les fonctionnalités**
   - Ajouter des filtres avancés
   - Implémentation de la comparaison année sur année
   - Alertes et notifications
   - Export en PDF

5. **Monitoring et analytics**
   - Tracker les actions utilisateur
   - Monitorer les performances
   - Analyser les patterns d'utilisation

## 📞 Support

Pour toute question ou problème:
1. Vérifier la [documentation complète](./README.md)
2. Consulter les logs du serveur: `npm run dev`
3. Vérifier les erreurs dans la console du navigateur (F12)

---

**Installation réussie! 🎉 Le tableau de bord est prêt à être utilisé.**
