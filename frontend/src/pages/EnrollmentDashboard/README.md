# Tableau de Bord des Inscriptions 📊

Un tableau de bord moderne et responsive pour la gestion des inscriptions d'un établissement scolaire/centre de formation.

## 🎯 Caractéristiques principales

### 1. **Header avec informations clés**
- Titre et sous-titre du dashboard
- Date de dernière mise à jour en temps réel
- Sélecteur d'année scolaire
- Bouton d'export CSV
- Toggle mode sombre/clair
- Menu mobile responsive

### 2. **KPI Cards (4 cartes)**
Affichage des métriques principales avec:
- **Total des inscrits**: 1247 (tendance +12%)
- **Inscriptions validées**: 985 (tendance +8%)
- **Inscriptions en attente**: 186 (tendance -5%)
- **Test de niveau requis**: 76 (tendance +3%)

Chaque carte inclut:
- Couleurs distinctives (bleu, vert, orange, violet)
- Icônes représentatives
- Indicateurs de tendance (positif/négatif)
- Détails supplémentaires

### 3. **Onglet: Vue générale**

#### A. Graphique Donut - Répartition par statut
- Validées (vert)
- En attente (orange)
- En cours (bleu)
- Annulées (gris)
- Refusées (rouge)

#### B. Graphique Donut - Test de niveau
- Test requis vs Sans test

#### C. Graphique LineChart - Évolution 12 semaines
- Courbe cumulative des inscriptions
- Pic maximal, moyenne, total affichés

### 4. **Onglet: Inscriptions par semaine**

- **BarChart** montrant les inscriptions par semaine (S1-S36)
- **Statistiques clés**: Total annuel, pic maximal, moyenne hebdomadaire
- **Tableau détaillé** avec % de la moyenne
- Visualisation des tendances hebdomadaires

### 5. **Onglet: Classes**

#### A. Graphique horizontal - Capacité vs Inscrits
- 8 classes (A1.1, A1.2, A2, B1, B2, C1, C2, D1)
- Comparaison visuelle des places utilisées

#### B. Cartes de remplissage
- Pourcentage et barre de progression
- Code couleur:
  - 🟢 Vert: ≥ 90% (complet)
  - 🟠 Orange: 70-89% (bientôt complet)
  - 🔴 Rouge: < 70% (places disponibles)
- Infos: Enseignant, Niveau

#### C. Tableau détaillé par classe
- Vue d'ensemble de tous les taux de remplissage

## 🎨 Design et UX

### Style moderne inspiré par:
- Notion
- Stripe Dashboard
- Linear
- Tailwind Admin Panels

### Caractéristiques visuelles:
- Cartes blanches arrondies avec ombres douces
- Spacing généreux et cohérent
- Typographie moderne et hiérarchisée
- Animations hover fluides
- Transitions smooth (300-500ms)
- Design fully responsive (mobile, tablet, desktop)

### Thèmes supportés:
- **Mode clair** (par défaut)
- **Mode sombre** avec toggle en header

## 🛠️ Technologies utilisées

```json
{
  "react": "^18.3.1",
  "tailwindcss": "^3.3.0",
  "recharts": "^2.10.0",
  "react-icons": "^5.3.0",
  "date-fns": "^2.30.0",
  "papaparse": "^5.4.1"
}
```

## 📁 Structure des fichiers

```
src/pages/EnrollmentDashboard/
├── index.jsx              # Composant principal + layout
├── mockData.js            # Données mockées réalistes
├── components.jsx         # Composants réutilisables
└── tabs.jsx              # Onglets (Overview, Weekly, Classes)
```

## 🚀 Utilisation

### Route
```
/admin/tableau-inscriptions
```

### Import
```jsx
import EnrollmentDashboard from './pages/EnrollmentDashboard';
```

### Accès
- Rôles autorisés: `ADMIN`, `SUPER_ADMIN`
- Protection: `PrivateRoute` avec Layout

## 💡 Fonctionnalités bonus

### ✅ Implémentées
- [x] **Dark Mode**: Toggle via bouton moon/sun
- [x] **Export CSV**: Télécharger les KPI en fichier CSV
- [x] **Filtres**: Par période, par année scolaire
- [x] **Sélecteur année**: Dropdown pour changer d'année scolaire
- [x] **Menu mobile**: Navigation responsive pour petits écrans
- [x] **Animations**: Fade-in et slide-up sur chargement
- [x] **Tooltips personnalisés**: Sur tous les graphiques Recharts
- [x] **Badges de statut**: Colorés pour les classes
- [x] **Responsive**: Grille adaptative (mobile, tablet, desktop)

### 🔄 Potentiels évolutions futures
- Connexion à une vraie API backend
- Rechargement des données en temps réel
- Filtres avancés (par classe, par enseignant)
- Export en PDF ou Excel
- Graphiques de comparaison année sur année
- Notifications de seuils atteints
- Historique des modifications
- Permissions granulaires

## 📊 Données mockées

Les données sont entièrement mockées et réalistes:
- 1247 inscrits totaux
- 8 classes avec différents taux de remplissage
- 36 semaines de l'année scolaire
- Tendances réalistes (+/-%)
- Distribution réaliste par statut

Pour connecter une vraie API, modifier `mockData.js` et les appels API dans les composants.

## 🎯 Accessibilité

- Contraste WCAG AA minimum
- Navigation au clavier supportée
- Labels semantiques
- Icônes avec contexte textuel
- Structure hiérarchique HTML propre

## 🔧 Configuration Tailwind

Le dashboard utilise une configuration Tailwind personnalisée:
- Couleurs primaires personnalisées
- Animations custom (fade-in, slide-up)
- Ombres douces
- Support dark mode automatique

Voir `tailwind.config.js` pour les détails.

## 📝 Notes de développement

- Tous les composants utilisent les hooks React modernes
- Code modulaire et réutilisable
- Pas de dépendances externes inutiles
- Performance optimisée (ResponsiveContainer)
- Gestion d'état simple avec useState

## 🐛 Troubleshooting

### Problème: Les graphiques ne s'affichent pas
- Vérifier que Recharts est installé: `npm install recharts`
- Vérifier que le composant est wrappé avec Layout

### Problème: Les styles Tailwind ne fonctionnent pas
- Vérifier que `@tailwind` directives sont dans index.css
- Relancer le serveur de développement
- Vérifier le chemin `content` dans tailwind.config.js

### Problème: Dark mode ne fonctionne pas
- S'assurer que `darkMode: 'class'` est dans tailwind.config.js
- Vérifier la classe `.dark` sur l'élément root

## 📄 Licence

© 2024 AMC Portail - Tous droits réservés.

---

**Créé avec ❤️ pour une gestion scolaire moderne et efficace**
