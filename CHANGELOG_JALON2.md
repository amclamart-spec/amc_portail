# CHANGELOG JALON 2 — Gestion des Familles & Élèves

## Stabilisation JALON 1

- Stabilisation du socle multi-année :
  - `SchoolYearStatus` (`UPCOMING`, `CURRENT`, `ARCHIVED`) ajouté au schéma Prisma.
  - modèle `ActivityLog` ajouté pour la piste d’audit.
  - migration SQL incluse : `backend/prisma/migrations/20260419120000_jalon1_admin_foundations/migration.sql`.
- Nouveaux endpoints Admin JALON 1 branchés et protégés `ADMIN`/`SUPER_ADMIN` :
  - `/api/admin/dashboard/stats`
  - `/api/admin/dashboard/recent-activity`
  - `/api/admin/school-years` (+ update/activate/archive/stats)
- Dashboard admin frontend remplacé par la version KPI + activité récente.
- Page gestion années scolaires modernisée (création, édition, activation, archivage, stats).

## JALON 2 — Backend

### Nouvelles API familles (admin)

Ajout des endpoints (tous protégés `ADMIN`/`SUPER_ADMIN`) :

- `GET /api/admin/families` (liste avec recherche, filtres, pagination)
- `GET /api/admin/families/:id` (fiche famille détaillée)
- `POST /api/admin/families/:id/parents`
- `PUT /api/admin/families/:familyId/parents/:parentId`
- `DELETE /api/admin/families/:familyId/parents/:parentId`
- `POST /api/admin/families/:id/students`
- `PUT /api/admin/families/:familyId/students/:studentId`
- `DELETE /api/admin/families/:familyId/students/:studentId`

### Contrôleur dédié

- Nouveau fichier : `backend/src/controllers/adminFamilyController.js`
  - Liste familles avec `search`, `accountStatus`, `page`, `limit`.
  - Fiche détaillée incluant :
    - infos famille + utilisateur
    - parents
    - élèves + inscriptions
    - paiements + échéances
  - CRUD parents et élèves en contexte admin.

### Logs d’activité

- Traçage des actions suivantes via `createActivityLog` :
  - `ADMIN_FAMILY_VIEWED`
  - `ADMIN_PARENT_CREATED`, `ADMIN_PARENT_UPDATED`, `ADMIN_PARENT_DELETED`
  - `ADMIN_STUDENT_CREATED`, `ADMIN_STUDENT_UPDATED`, `ADMIN_STUDENT_DELETED`

## JALON 2 — Frontend

### Navigation admin

- Menu admin enrichi avec l’entrée **Familles & Élèves** (`/admin/families`).

### Nouvelles pages

- `frontend/src/pages/admin/Families.jsx`
  - liste familles
  - recherche + filtre statut
  - pagination
  - accès à la fiche détail

- `frontend/src/pages/admin/FamilyDetails.jsx`
  - vue complète d’une famille
  - bloc informations générales
  - gestion des parents (ajout / édition / suppression)
  - gestion des élèves (ajout / édition / suppression)
  - vue paiements

### Routing

- Routes ajoutées :
  - `/admin/families`
  - `/admin/families/:id`

## Validation technique effectuée

- Prisma : génération client + validation du schéma (`generate`, `validate`) OK.
- Backend Node : démarrage API OK.
- Frontend : build Vite production OK.
- Contrôle RBAC : endpoint admin familles retourne `401` sans token (protection active).

## Fichiers clés ajoutés/modifiés

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260419120000_jalon1_admin_foundations/migration.sql`
- `backend/prisma/migrations/migration_lock.toml`
- `backend/prisma/seed.js`
- `backend/src/services/activityLogService.js`
- `backend/src/controllers/adminFoundationController.js`
- `backend/src/controllers/adminFamilyController.js`
- `backend/src/routes/admin.js`
- `frontend/src/App.jsx`
- `frontend/src/components/Layout.jsx`
- `frontend/src/pages/admin/Dashboard.jsx`
- `frontend/src/pages/admin/Settings.jsx`
- `frontend/src/pages/admin/Families.jsx`
- `frontend/src/pages/admin/FamilyDetails.jsx`
