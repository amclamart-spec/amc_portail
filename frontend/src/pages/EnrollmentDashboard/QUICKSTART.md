# 🚀 Quick Start - Démarrage rapide

## ⚡ 5 minutes pour démarrer

### 1️⃣ Installation (1 min)

```bash
cd frontend
npm install
```

### 2️⃣ Vérifier la configuration (1 min)

Les fichiers suivants ont été créés automatiquement:
- ✅ `tailwind.config.js`
- ✅ `postcss.config.js`
- ✅ `src/pages/EnrollmentDashboard/`

### 3️⃣ Lancer le serveur (1 min)

```bash
npm run dev
```

Accès: `http://localhost:5173`

### 4️⃣ Naviguer vers le dashboard (1 min)

1. Se connecter avec compte ADMIN
2. URL: `/admin/tableau-inscriptions`
3. Ou depuis le menu d'admin (si implémenté)

### 5️⃣ Explorer! (1 min)

- Voir les 4 KPI cards
- Cliquer sur les onglets
- Tester le dark mode (lune en haut)
- Cliquer "Exporter" pour CSV
- Tester sur mobile

---

## 📁 Fichiers clés

| Fichier | Rôle |
|---------|------|
| `src/pages/EnrollmentDashboard/index.jsx` | Composant principal |
| `src/pages/EnrollmentDashboard/tabs.jsx` | Contenu des 3 onglets |
| `src/pages/EnrollmentDashboard/components.jsx` | Composants réutilisables |
| `src/pages/EnrollmentDashboard/mockData.js` | Données d'exemple |
| `tailwind.config.js` | Configuration Tailwind |
| `src/App.jsx` | Route ajoutée |

---

## 🎯 Fonctionnalités principales

### Immédiatement disponibles ✅

```
📊 4 KPI Cards               ✅ Onglets (3)           ✅
📈 Graphiques Recharts       ✅ Dark mode             ✅
📥 Export CSV                ✅ Responsive mobile     ✅
🎨 Design moderne            ✅ Animations fluides    ✅
```

### Menu du dashboard

```
📊 Vue générale
├─ Pie chart: Distribution par statut
├─ Pie chart: Test de niveau
├─ Line chart: Evolution 12 semaines
└─ Stats: Pic, moyenne, total

📈 Inscriptions par semaine
├─ Bar chart: S1-S36
├─ Stats clés
└─ Tableau détaillé

👥 Classes
├─ Horizontal bar chart: Capacité
├─ Cartes de remplissage (avec %)
└─ Tableau complet
```

---

## 🎨 Thèmes disponibles

### Mode clair (défaut)
- Fond blanc
- Texte sombre
- Cartes grises claires

### Mode sombre
- Clic sur lune 🌙 en haut
- Fond gris-noir
- Texte clair
- Tous les graphiques adaptés

---

## 📊 Données d'exemple

```
Total inscrits:           1247
Validées:                 985
En attente:               186
Test requis:              76
Classes:                  8
Semaines:                 36
Pic d'inscrits:           92/semaine
Moyenne:                  ~35/semaine
```

---

## 🔧 Modification rapide des données

Éditer `src/pages/EnrollmentDashboard/mockData.js`:

```js
// Changer les KPI
kpis: [
  {
    label: 'Total des inscrits',
    value: 1247,  // ← Modifier ici
    trend: 12,    // ← Ou ici
    // ...
  }
]

// Changer les classes
classes: [
  {
    name: 'A1.1',
    enrolled: 28,  // ← Nombre d'inscrits
    capacity: 30,  // ← Capacité totale
    // ...
  }
]
```

Puis relancer le serveur pour voir les changements.

---

## 📱 Tester la responsivité

### Avec Chrome DevTools (F12)

1. Ouvrir le dashboard
2. Presser `F12`
3. Clic sur `📱 Toggle device toolbar`
4. Choisir appareils:
   - iPhone SE (375px)
   - iPhone 12 (390px)
   - iPad (768px)
   - Desktop (1920px)

### Points de rupture

```
Mobile:   < 768px
Tablet:   768px - 1024px
Desktop:  > 1024px
```

---

## 🎯 Tâches courantes

### Changer le titre

`src/pages/EnrollmentDashboard/mockData.js`:
```js
header: {
  title: "Tableau de Bord — Inscriptions",  // ← Ici
  subtitle: "Année scolaire 2024-2025",
  // ...
}
```

### Ajouter une nouvelle classe

`mockData.js`:
```js
classes: [
  // ...
  {
    id: 'D2',
    name: 'D2',
    enrolled: 12,
    capacity: 20,
    teacher: 'Nouveau Prof',
    level: 'Avancé',
  },
]
```

### Changer les couleurs KPI

`components.jsx`:
```js
const colorClasses = {
  blue: 'bg-blue-50 ...',     // ← Classes Tailwind
  green: 'bg-green-50 ...',
  orange: 'bg-orange-50 ...',
  purple: 'bg-purple-50 ...',
}
```

### Modifier les graphiques

`tabs.jsx`: Chercher `<LineChart>`, `<PieChart>`, `<BarChart>` etc.

---

## 🚀 Deploiement

### Build production

```bash
npm run build
```

Génère le dossier `dist/` prêt pour production.

### Servir

```bash
npm run preview
```

Ou déployer le dossier `dist/` sur votre serveur.

---

## ❓ Questions fréquentes

### Q: Les données ne se mettent pas à jour?
A: Relancer le serveur avec `npm run dev`

### Q: Les styles Tailwind ne fonctionnent pas?
A: Vérifier que `@tailwind` est dans `src/index.css`

### Q: Comment ajouter un graphique?
A: Voir [ADVANCED.md](./ADVANCED.md) pour exemples

### Q: Comment connecter une API?
A: Voir [DATA_STRUCTURE.md](./DATA_STRUCTURE.md#-migration-depuis-les-données-mockées-vers-laapi)

### Q: Peut-on personnaliser les couleurs?
A: Oui! Éditer `tailwind.config.js` et `components.jsx`

---

## 📚 Documentation complète

- 📖 [README.md](./README.md) - Guide complet
- 📦 [INSTALLATION.md](./INSTALLATION.md) - Installation détaillée
- 🔧 [ADVANCED.md](./ADVANCED.md) - Exemples avancés
- 📊 [DATA_STRUCTURE.md](./DATA_STRUCTURE.md) - Format des données
- ✨ [FEATURES.md](./FEATURES.md) - Liste complète des fonctionnalités
- 🚀 [QUICKSTART.md](./QUICKSTART.md) - Ce fichier

---

## 🎓 Ressources

- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Recharts](https://recharts.org)
- [React Icons](https://react-icons.github.io/react-icons)

---

## ✅ Prochaines étapes

- [ ] Tester sur mobile
- [ ] Tester dark mode
- [ ] Explorer les 3 onglets
- [ ] Essayer export CSV
- [ ] Lire la documentation complète
- [ ] Customiser les données
- [ ] Ajouter une vraie API
- [ ] Déployer en production

---

**Vous êtes prêt! Bon développement! 🎉**

Pour l'aide: Consulter [README.md](./README.md)
