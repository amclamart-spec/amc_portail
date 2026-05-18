# 📧 Fonctionnalité Mailing — Guide d'utilisation

## Vue d'ensemble

La fonctionnalité **Mailing** permet aux administrateurs d'envoyer des emails en masse à plusieurs groupes de destinataires :
- ✅ Toutes les familles inscrites
- ✅ Tous les professeurs
- ✅ Familles d'un pôle, d'un niveau, ou d'une classe spécifique

## Accès

**Menu Admin → Communication → Mailing**

Ou directement : `/admin/mailing`

**Permission requise** : `CLASSES_MANAGE` (rôle : ADMIN ou SUPER_ADMIN)

---

## Interface

### 1️⃣ Sélection des destinataires

**Type de destinataires :**
- **Toutes les familles inscrites** : Envoie à toutes les familles ayant des élèves inscrits
- **Tous les professeurs** : Envoie à tous les professeurs actifs
- **Familles d'un pôle** : Sélectionner le pôle → les familles du pôle reçoivent le mail
- **Familles d'un niveau** : Sélectionner pôle → niveau → les familles de ce niveau
- **Familles d'une classe** : Sélectionner pôle → niveau → classe → les familles de cette classe

### 2️⃣ Rédaction du mail

**Champs :**
- **Objet** : Titre du mail (ex: "Informations importantes pour les inscriptions")
- **Contenu** : Texte en HTML (mise en forme, liens, etc.)

**Conseil :** Utilisez du HTML basique :
```html
<p>Bonjour,</p>
<p>Voici un message important.</p>
<p><strong>Points clés :</strong></p>
<ul>
  <li>Point 1</li>
  <li>Point 2</li>
</ul>
<p><a href="https://exemple.com">Cliquez ici</a></p>
```

### 3️⃣ Aperçu avant envoi

Avant d'envoyer :
1. **Remplir** objet et contenu
2. **Cliquer** "Générer aperçu"
3. **Vérifier** :
   - Nombre de destinataires
   - Liste des premiers destinataires
   - Aperçu du mail rendu

### 4️⃣ Envoi

1. **Confirmer** dans la popup
2. **Patienter** le traitement
3. **Voir le résumé** : nombre de succès / échecs

---

## Détails techniques

### Template du mail

Chaque mail est automatiquement rendu avec :
- **En-tête** : Logo AMC, couleur institutionnelle (#213B88)
- **Contenu** : Votre HTML personnalisé
- **Pied de page** : Informations association

### Destinataires récupérés

- **ALL_FAMILIES** : Familles ayant au moins 1 élève inscrit
- **TEACHERS** : Professeurs avec status = ACTIVE
- **CLASS_FAMILIES** : Familles des élèves de la classe (sans doublon)
- **LEVEL_FAMILIES** : Familles des élèves du niveau (sans doublon)
- **POLE_FAMILIES** : Familles des élèves du pôle (sans doublon)

### Envoi

- Service SMTP ou Abacus (selon config)
- Logs en console
- Résumé succès/échecs

---

## Exemples

### Exemple 1 : Annonce générale

**Type :** Toutes les familles inscrites  
**Objet :** "Dates importantes année 2025-2026"  
**Contenu :**
```html
<p>Chères familles,</p>
<p>Nous vous communiquons les dates importantes de cette année :</p>
<p>
  <strong>Rentrée :</strong> 15 septembre 2025<br/>
  <strong>Vacances Toussaint :</strong> 2-20 octobre
</p>
<p>Cordialement,<br/>L'équipe AMC</p>
```

### Exemple 2 : Spécifique à une classe

**Type :** Familles d'une classe  
**Sélection :** Pôle "Arabe" → Niveau "Arabe 1" → Classe "Mercredi 14h"  
**Objet :** "Changement de salle pour votre classe"  
**Contenu :**
```html
<p>Chères familles,</p>
<p>Suite à une refonte du planning, votre classe passe de la salle 3 à la salle 5.</p>
<p><strong>Nouveau créneau :</strong> Mercredi 14h-16h, Salle 5</p>
<p>Merci de votre compréhension.</p>
```

---

## Résolution des problèmes

### ❌ Aucun destinataire trouvé
- Vérifier qu'il y a bien des élèves inscrits à cette classe/niveau/pôle
- Pour "Toutes les familles" : vérifier qu'il existe au moins 1 inscription

### ❌ Mail ne s'envoie pas
- Vérifier la config SMTP/Abacus dans `.env`
- Consulter les logs backend pour les détails d'erreur
- Essayer avec moins de destinataires

### ✅ Vérifier l'envoi
- L'aperçu montre le nombre exact de destinataires
- Le résumé d'envoi affiche succès/échecs
- Consulter les logs applicatif

---

## Améliorations futures

- 📎 Support pièces jointes
- 📅 Planification d'envoi différé
- 🗂️ Historique des mailings
- 💾 Templates de mail sauvegardés
- 📊 Statistiques ouverture/clic

---

## API Endpoints

### GET `/admin/mailing/structure`
Récupère la hiérarchie pôles/niveaux/classes

**Réponse :**
```json
{
  "success": true,
  "structure": [
    {
      "id": "pole-1",
      "name": "Arabe",
      "levels": [
        {
          "id": "level-1",
          "name": "Arabe 1",
          "classes": [
            {
              "id": "class-1",
              "label": "Mercredi 14h-16h (12/30 élèves)"
            }
          ]
        }
      ]
    }
  ]
}
```

### POST `/admin/mailing/preview`
Prévisualise les destinataires

**Body :**
```json
{
  "recipientType": "CLASS_FAMILIES",
  "poleId": "pole-1",
  "levelId": "level-1",
  "classId": "class-1",
  "subject": "Mon sujet"
}
```

**Réponse :**
```json
{
  "success": true,
  "preview": {
    "recipientInfo": "Classe: Arabe - Arabe 1 (5 familles)",
    "recipientCount": 5,
    "recipients": [
      { "email": "famille1@example.com", "name": "Famille Ahmed" },
      ...
    ],
    "hasMore": false,
    "totalRecipients": 5
  }
}
```

### POST `/admin/mailing/send`
Envoie le mail en masse

**Body :**
```json
{
  "recipientType": "CLASS_FAMILIES",
  "poleId": "pole-1",
  "levelId": "level-1",
  "classId": "class-1",
  "subject": "Mon sujet",
  "content": "<p>Contenu HTML</p>"
}
```

**Réponse :**
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

---

**Questions ?** Contactez l'équipe administrateur.
