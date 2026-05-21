# 🧪 Tests Mailing — Guide pour développeurs

## Prérequis locaux

1. Backend et Frontend lancés
2. Base de données avec données de test
3. Configuration SMTP dans `.env`

## Configuration SMTP pour tests

### Option 1 : Gmail (simple pour tests)

```env
# .env (backend)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASS=votre-app-password  # NOT votre mot de passe Gmail
```

**Générer App Password Gmail :**
1. Activer 2FA sur votre compte Google
2. Aller à https://myaccount.google.com/apppasswords
3. Sélectionner Mail + Windows/Linux
4. Copier le password généré

### Option 2 : MailHog (local, pas besoin de compte)

```bash
# Télécharger et lancer MailHog
# https://github.com/mailhog/MailHog/releases

./mailhog  # Lance sur 1025 (SMTP) et 8025 (Web UI)
```

```env
# .env
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_USER=test
SMTP_PASS=test
```

Interface web : http://localhost:8025

### Option 3 : Abacus (production-like)

```env
EMAIL_PROVIDER=ABACUS
ABACUS_API_KEY=votre-clé
ABACUS_EMAIL_API_BASE_URL=https://apps.abacus.ai
ABACUS_EMAIL_API_ENDPOINT=/api/v0/send-email
```

## Données de test

### Créer des familles et élèves

```bash
# Backend
cd backend
npm run prisma:seed  # Crée admin + données de base
```

Ou manuellement via Prisma Studio :
```bash
npm run prisma:studio
```

Puis créer quelques:
- 3-5 familles (avec elèves)
- 2-3 classes (avec students inscrits)
- 2 professeurs

### Vérifier les données

```bash
# Dans Prisma Studio (http://localhost:5555)
- Vérifier "families" avec "students"
- Vérifier "enrollments" liés aux classes
- Vérifier "teachers" avec status ACTIVE
```

## Tests manuels

### 1. Accès à la page

1. Se connecter comme ADMIN
2. Aller à `/admin/mailing`
3. Vérifier que le formulaire charge (pas d'erreur console)

### 2. Charge de la structure

1. Ouvrir Dev Tools → Network
2. Actualiser la page
3. Chercher `GET /admin/mailing/structure`
4. Vérifier qu'elle retourne les pôles/niveaux/classes

### 3. Aperçu (sans destinataire)

**Test :** Toutes les familles

```
Type: "Toutes les familles inscrites"
Sujet: "Test mailing"
Contenu: "<p>Ceci est un test</p>"
→ Cliquer "Générer aperçu"
```

✅ Expected:
- Affiche le nombre de familles
- Liste les premiers destinataires
- Affiche l'aperçu du mail

### 4. Aperçu avec sélection

**Test :** Une classe spécifique

```
Type: "Familles d'une classe"
Pôle: Sélectionner un pôle
Niveau: Sélectionner un niveau
Classe: Sélectionner une classe
Sujet: "Test classe"
Contenu: "<p>Message pour cette classe</p>"
→ Cliquer "Générer aperçu"
```

✅ Expected:
- Affiche "Classe: [Pôle] - [Niveau]"
- Affiche le nombre de familles de cette classe
- Affiche l'aperçu

### 5. Envoi réel

```
→ Cliquer "Envoyer le mail"
→ Confirmer dans la popup
```

✅ Expected:
- Toast "Mail envoyé!"
- Affiche le résumé (succès/échecs)
- Formulaire réinitialisé

### 6. Vérifier les mails reçus

**Avec Gmail :** Vérifier votre inbox (peut être en spam)

**Avec MailHog :** http://localhost:8025
- Voir les mails dans l'interface
- Cliquer sur un mail pour voir le rendu HTML

## Tests API (curl/Postman)

### Authentification

```bash
# 1. Login et récupérer token
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@musulmansdeclamart.fr","password":"Admin2025!"}'

# Copier le token dans Authorization: Bearer <token>
```

### GET /admin/mailing/structure

```bash
curl http://localhost:4000/api/admin/mailing/structure \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Réponse attendue:
```json
{
  "success": true,
  "structure": [
    {
      "id": "pole-1",
      "name": "Arabe",
      "levels": [...]
    }
  ]
}
```

### POST /admin/mailing/preview

```bash
curl -X POST http://localhost:4000/api/admin/mailing/preview \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "recipientType": "ALL_FAMILIES",
    "subject": "Test"
  }'
```

Réponse attendue:
```json
{
  "success": true,
  "preview": {
    "recipientInfo": "Toutes les familles inscrites (5)",
    "recipientCount": 5,
    "recipients": [
      {"email": "famille1@test.com", "name": "Famille 1"}
    ],
    "hasMore": false,
    "totalRecipients": 5
  }
}
```

### POST /admin/mailing/send

```bash
curl -X POST http://localhost:4000/api/admin/mailing/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "recipientType": "ALL_FAMILIES",
    "subject": "Test mailing",
    "content": "<p>Ceci est un test</p>"
  }'
```

Réponse attendue:
```json
{
  "success": true,
  "result": {
    "totalRecipients": 5,
    "successCount": 5,
    "failedCount": 0,
    "errors": []
  }
}
```

## Tests unitaires (optionnel)

Fichier de test recommandé : `backend/src/services/__tests__/mailService.test.js`

```javascript
const { getRecipients, sendBulkMail } = require('../mailService');

describe('mailService', () => {
  describe('getRecipients', () => {
    test('ALL_FAMILIES retourne les familles inscrites', async () => {
      const recipients = await getRecipients('ALL_FAMILIES');
      expect(Array.isArray(recipients)).toBe(true);
      expect(recipients.length).toBeGreaterThan(0);
    });

    test('TEACHERS retourne les professeurs', async () => {
      const recipients = await getRecipients('TEACHERS');
      expect(Array.isArray(recipients)).toBe(true);
    });
  });

  describe('sendBulkMail', () => {
    test('Envoie les mails et retourne le résumé', async () => {
      const result = await sendBulkMail({
        recipientType: 'ALL_FAMILIES',
        subject: 'Test',
        content: '<p>Test</p>',
      });

      expect(result).toHaveProperty('successCount');
      expect(result).toHaveProperty('failedCount');
      expect(result).toHaveProperty('errors');
    });
  });
});
```

Lancer les tests :
```bash
npm test -- mailService.test.js
```

## Logs à vérifier

**Console backend :**
```
[MAIL] Début envoi: type=ALL_FAMILIES, subject="Mon sujet"
[MAIL] 5 destinataires trouvés
[MAIL] Envoi à famille1@test.com...
[MAIL] Envoi à famille2@test.com...
...
[MAIL] Envoi terminé: 5 réussis, 0 échoués
```

**Dev Tools (frontend) :**
- Vérifier requête POST `/admin/mailing/send`
- Vérifier réponse avec successCount/failedCount
- Pas d'erreur 5xx

## Checklist final

- [ ] Structure charge sans erreur
- [ ] Aperçu affiche les destinataires corrects
- [ ] Mail s'envoie avec succès
- [ ] Mail reçu avec bon design (logo + couleurs)
- [ ] Résumé affiche succès/échecs
- [ ] Tests API fonctionnent
- [ ] Pas d'erreurs console ou réseau
- [ ] Gestion d'erreur : mail invalide → failedCount +1

---

**Questions ?** Consulter `MAILING_FEATURE.md` ou les logs console.
