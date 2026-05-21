# 📚 AMC — Portail d'Inscription Scolaire

**Association Partage et des Musulmans de Clamart (AMC)**  
École de Langue Arabe et Sciences Islamiques

---

## 📋 Description

Portail web complet de gestion des inscriptions scolaires pour l'école AMC. Le système permet :

- ✅ **Dématérialisation** totale du processus d'inscription
- ✅ **Gestion centralisée** des dossiers familles et élèves
- ✅ **3 profils** : Administrateur, Responsable Famille, Élève
- ✅ **Inscription scolaire** en ligne (3 pôles : Arabe, Coran, Sciences Islamiques)
- ✅ **Validation admin** des comptes utilisateurs
- ✅ **Notifications email** automatiques
- ✅ **Calcul tarifaire** automatique avec tarifs dégressifs

---

## 🏗️ Architecture

```
amc_portail/
├── backend/          # API Node.js / Express
│   ├── prisma/        # Schéma BDD & migrations
│   └── src/
│       ├── config/        # Configuration
│       ├── controllers/   # Logique métier
│       ├── middleware/    # Auth JWT, rôles
│       ├── routes/        # Endpoints API
│       ├── services/      # Email, tarification
│       └── utils/         # JWT helpers
├── frontend/         # React / Vite
│   └── src/
│       ├── api/          # Client Axios
│       ├── components/   # Layout, PrivateRoute
│       ├── context/      # AuthContext
│       └── pages/        # Pages par profil
├── render.yaml        # Configuration Render
└── README.md
```

### Stack technique

| Couche | Technologie |
|--------|-------------|
| **Frontend** | React 18, Vite, React Router 6, Axios |
| **Backend** | Node.js, Express, Prisma ORM |
| **Base de données** | PostgreSQL |
| **Authentification** | JWT (access + refresh tokens) |
| **Email** | Nodemailer (SMTP) |
| **Déploiement** | Render (Blueprint) |

---

## 🚀 Installation locale

### Prérequis

- **Node.js** v18+ et **npm** v9+
- **PostgreSQL** 14+ (local ou distant)
- **Git**

### 1. Cloner le repo

```bash
git clone https://github.com/ighandri1/amc_portail.git
cd amc_portail
```

### 2. Configuration Backend

```bash
cd backend
npm install

# Copier et configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos credentials PostgreSQL et JWT secrets
```

**Variables d'environnement backend (`.env`) :**

| Variable | Description | Exemple |
|----------|-------------|---------|
| `PORT` | Port du serveur | `4000` |
| `DATABASE_URL` | URL PostgreSQL | `postgresql://user:pass@localhost:5432/amc_portail` |
| `JWT_SECRET` | Secret JWT (min 32 car.) | `votre-secret-jwt-long` |
| `JWT_REFRESH_SECRET` | Secret refresh token | `votre-refresh-secret` |
| `JWT_EXPIRES_IN` | Durée du token | `2h` |
| `JWT_REFRESH_EXPIRES_IN` | Durée du refresh | `7d` |
| `SMTP_HOST` | Serveur SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Port SMTP | `587` |
| `SMTP_USER` | Email SMTP | `votre@email.com` |
| `SMTP_PASS` | Mot de passe app | `xxxx-xxxx-xxxx` |
| `FRONTEND_URL` | URL du frontend | `http://localhost:5173` |
| `CORS_ORIGIN` | Origine CORS | `http://localhost:5173` |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe test | `sk_test_xxxxxxx` |
| `STRIPE_PUBLIC_KEY` | Clé publique Stripe test | `pk_test_xxxxxxx` |
| `STRIPE_WEBHOOK_SECRET` | Secret webhook Stripe en mode test | `whsec_xxxxxxx` |

### 3. Paiement par carte bancaire (Stripe) en local

Pour tester le paiement par carte bancaire via Stripe :

1. Créez un compte Stripe ou connectez-vous à `https://dashboard.stripe.com/test`.
2. Copiez les clés de test et ajoutez-les dans `backend/.env` :
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLIC_KEY`
   - `STRIPE_WEBHOOK_SECRET`
3. Pour les webhooks locaux, utilisez `stripe listen --forward-to localhost:4000/api/payments/webhooks/stripe`.
4. Dans l’interface Stripe, utilisez la carte de test suivante :
   - Numéro : `4242 4242 4242 4242`
   - Date d’expiration : n’importe quelle date future
   - CVC : `123`
   - Code postal : `75001`

> En mode test, Stripe n’effectue pas de transactions réelles.

### 4. Migration de la base de données

```bash
# Créer la base de données PostgreSQL
createdb amc_portail

# Générer le client Prisma
npx prisma generate

# Lancer les migrations
npx prisma migrate dev --name init

# (Optionnel) Seed avec données d'exemple
node prisma/seed.js
```

> 💡 Le seed crée : 1 admin (`admin@musulmansdeclamart.fr` / `Admin2025!`), l'année 2025-2026, les 3 pôles, les niveaux et quelques classes d'exemple.

### 4. Configuration Frontend

```bash
cd ../frontend
npm install

# (Optionnel) Copier le .env
cp .env.example .env.local
```

### 5. Lancer en développement

```bash
# Terminal 1 — Backend
cd backend
npm run dev
# → API sur http://localhost:4000

# Terminal 2 — Frontend
cd frontend
npm run dev
# → App sur http://localhost:5173
```

> Le proxy Vite redirige automatiquement `/api` vers `localhost:4000`.

---

## 📊 Schéma de base de données

### Tables principales

| Table | Description |
|-------|-------------|
| `users` | Comptes utilisateurs (auth, rôles, validation) |
| `families` | Dossiers familles (adresse, contacts) |
| `parents` | Parents/tuteurs (1-4 par famille) |
| `students` | Élèves (infos perso, médical) |
| `school_years` | Années scolaires |
| `poles` | Pôles de formation (Arabe, Coran, Sciences) |
| `levels` | Niveaux par pôle |
| `classes` | Classes (créneau, salle, prof, capacité) |
| `enrollments` | Inscriptions élèves aux classes |
| `payments` | Paiements famille |
| `installments` | Échéancier de paiement |

### Visualiser le schéma

```bash
cd backend
npx prisma studio
# → Interface web sur http://localhost:5555
```

---

## 🔐 API Endpoints

### Authentification (`/api/auth`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/register` | Inscription |
| POST | `/login` | Connexion |
| POST | `/refresh` | Renouveler le token |
| GET | `/verify-email/:token` | Vérifier l'email |
| GET | `/me` | Profil utilisateur connecté |
| POST | `/logout` | Déconnexion |

### Admin (`/api/admin`) — Rôle ADMIN requis

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/stats` | Statistiques générales |
| GET | `/users` | Liste des utilisateurs |
| GET | `/users/pending` | Comptes en attente |
| PUT | `/users/:id/approve` | Valider un compte |
| PUT | `/users/:id/reject` | Refuser un compte |
| GET/POST | `/school-years` | Années scolaires |
| GET/POST | `/poles` | Pôles |
| POST | `/levels` | Niveaux |
| GET/POST | `/classes` | Classes |
| GET | `/enrollments` | Inscriptions |

### Famille (`/api/family`) — Rôle RESPONSABLE_FAMILLE

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/dashboard` | Tableau de bord |
| GET/POST | `/profile` | Profil famille |
| POST | `/parents` | Ajouter parent |
| PUT/DELETE | `/parents/:id` | Gérer parent |

### Élèves (`/api/students`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Liste des élèves |
| POST | `/` | Ajouter un élève |
| PUT | `/:id` | Modifier |
| DELETE | `/:id` | Supprimer |

### Inscriptions (`/api/enrollments`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/poles` | Pôles et niveaux |
| GET | `/classes` | Classes disponibles |
| POST | `/` | Inscrire un élève |
| GET | `/summary` | Récapitulatif tarifs |
| DELETE | `/:id` | Annuler inscription |

---

## ☁️ Déploiement sur Render

### Méthode 1 : Blueprint (recommandé)

1. Connecter votre repo GitHub à [Render](https://render.com)
2. Cliquer **"New" → "Blueprint"**
3. Sélectionner le repo `amc_portail`
4. Render détecte automatiquement le fichier `render.yaml`
5. Configurer les variables d'environnement manquantes :
   - `DATABASE_URL` : URL de votre base PostgreSQL (Render, Supabase, Neon, etc.)
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` : Paramètres email
6. Déployer !

### Méthode 2 : Manuelle

#### Backend (Web Service)
- **Root Directory** : `backend`
- **Build Command** : `npm install && npx prisma generate`
- **Start Command** : `npm start`
- **Health Check** : `/api/health`

#### Frontend (Static Site)
- **Root Directory** : `frontend`
- **Build Command** : `npm install && npm run build`
- **Publish Directory** : `dist`
- **Rewrite Rule** : `/* → /index.html`

### Base de données PostgreSQL

Options recommandées :
- **Render PostgreSQL** (intégré)
- **Supabase** (gratuit, généreux)
- **Neon** (serverless, gratuit)

Après création de la BDD, exécuter les migrations :
```bash
DATABASE_URL="votre-url" npx prisma migrate deploy
DATABASE_URL="votre-url" node prisma/seed.js
```

---

## 🛠️ Commandes utiles

```bash
# Backend
cd backend
npm run dev              # Développement avec hot-reload
npm start                # Production
npm run prisma:studio    # Interface BDD visuelle
npm run prisma:migrate:dev  # Créer une migration
npm run prisma:seed      # Peupler la BDD

# Frontend
cd frontend
npm run dev              # Développement
npm run build            # Build production
npm run preview          # Prévisualiser le build
```

---

## 🎨 Identité visuelle

| Élément | Valeur |
|---------|--------|
| **Couleur principale** | `#213B88` (Bleu institutionnel) |
| **Couleur CTA** | `#0088CC` (Bleu bouton) |
| **Gris anthracite** | `#37373F` (Footer, top bar) |
| **Police** | PT Sans (Google Fonts) |
| **Border radius** | 5px |

---

## 📄 Grille tarifaire (2025-2026)

### Frais d'inscription : 10€ / famille / an

### Tarif Arabe (dégressif)

| Nb élèves | Total |
|-----------|-------|
| 1 | 310€ |
| 2 | 570€ |
| 3 | 750€ |
| 4 | 900€ |
| 5 | 1 050€ |
| 6+ | 1 050€ + 150€/élève suppl. |

### Tarifs individuels

| Cours | Tarif |
|-------|-------|
| Coran Enfant | 220€ |
| Coran Adulte Homme | 300€ |
| Coran Adulte Femme | 250€ |
| Sciences Islamiques | 300€ |

---

## 📝 Licence

Projet privé — Association Partage et des Musulmans de Clamart (AMC)  
Tous droits réservés © 2025-2026
