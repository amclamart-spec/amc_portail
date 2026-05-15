# Configuration Google SSO — AMC Portail

Ce document explique comment activer la connexion Google OAuth2 (SSO) en **complément** de la connexion Email/Mot de passe.

## 1) Prérequis

- Un compte Google (organisation ou personnel) avec accès à [Google Cloud Console](https://console.cloud.google.com/)
- Backend AMC Portail configuré (variables `.env`)
- Frontend AMC Portail en local ou en production

## 2) Créer un projet Google Cloud

1. Ouvrir [Google Cloud Console](https://console.cloud.google.com/)
2. Cliquer sur le sélecteur de projet (barre du haut)
3. Cliquer sur **Nouveau projet**
4. Donner un nom (ex: `AMC Portail Auth`)
5. Créer le projet puis le sélectionner

## 3) Configurer l’écran de consentement OAuth

1. Menu de gauche → **APIs & Services** → **OAuth consent screen**
2. Choisir le type d’utilisateur (External en général)
3. Compléter au minimum :
   - App name
   - User support email
   - Developer contact information
4. En phase de test, ajouter les utilisateurs de test (emails autorisés)
5. Enregistrer

## 4) Activer les APIs nécessaires

Pour la stratégie standard Google OAuth2 (profile/email), il n’y a pas de scope API métier obligatoire.

Recommandé :
1. Aller dans **APIs & Services** → **Library**
2. Vérifier que les APIs d’identité Google OAuth sont disponibles pour le projet

## 5) Créer les identifiants OAuth 2.0

1. Aller dans **APIs & Services** → **Credentials**
2. Cliquer **Create Credentials** → **OAuth client ID**
3. Type d’application : **Web application**
4. Renseigner :
   - **Authorized JavaScript origins** (local):
     - `http://localhost:5173`
   - **Authorized redirect URIs** (local):
     - `http://localhost:4000/auth/google/callback`
     - (optionnel compat API prefix) `http://localhost:4000/api/auth/google/callback`
5. Créer puis copier :
   - Client ID
   - Client Secret

## 6) Copier les clés dans le backend

Dans `backend/.env` :

```env
GOOGLE_CLIENT_ID="1012916983417-rlq7lbcltg5khseqtqua29mf3e950fla.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="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"
GOOGLE_CALLBACK_URL="http://localhost:4000/auth/google/callback"
```

> Le backend accepte aussi le callback `/api/auth/google/callback` via alias de routes.

## 7) Vérifier la configuration frontend

Le bouton Google redirige vers `${VITE_API_URL}/auth/google`.

En local, avec `frontend/.env`:

```env
VITE_API_URL=/api
```

Vite proxy redirige alors vers le backend (`http://localhost:4000`).

## 8) Démarrer l’application

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Tester ensuite :
1. Aller sur `/login`
2. Cliquer **Se connecter avec Google**
3. Accepter la connexion
4. Vérifier la redirection vers `/auth/google/callback` côté frontend

## 9) Comportement métier implémenté

- Si l’utilisateur Google n’existe pas : création automatique avec :
  - `role=FAMILLE`
  - `validationStatus=PENDING`
  - `emailVerified=true`
  - `provider=google`
- Si un compte existe avec le même email : liaison automatique (`googleId` ajouté)
- Si le compte local possède un mot de passe : la connexion email/mot de passe continue de fonctionner

## 10) Sécurité implémentée

- **Validation OAuth Google** via `passport-google-oauth20` (échange de code côté serveur)
- **Protection CSRF OAuth** via paramètre `state` + cookie HTTP-only de vérification
- **Vérification email Google** : seuls les emails Google vérifiés sont acceptés
- **Gestion d’erreurs OAuth** : redirection frontend avec message explicite
- **JWT interne AMC** : après succès OAuth, émission de `accessToken` et `refreshToken` comme l’auth classique

## 11) Dépannage rapide

### Erreur `redirect_uri_mismatch`
- Vérifier que `GOOGLE_CALLBACK_URL` correspond exactement à une URI autorisée dans Google Cloud.

### Bouton Google renvoie 503
- Variables OAuth manquantes dans `.env` backend.

### L’auth marche mais pas la connexion API ensuite
- Vérifier la présence des tokens en query params (`accessToken`, `refreshToken`)
- Vérifier le stockage local (`amc_access_token`, `amc_refresh_token`)
- Vérifier la route `/auth/me`
