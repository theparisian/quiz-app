# ROADMAP — Shh!

> Priorités et backlog du produit. La réécriture v2 (PR1 → PR10) est livrée et mergée sur master ; l'historique détaillé est dans `docs/archive/`. Ce document est la source d'autorité pour ce qui reste à faire.

---

## 1. Avant pilote terrain

Checklist bloquante avant la première installation en salle réelle :

- [ ] Tests bout-en-bout en conditions réelles : envoi email SMTP réel + scan QR depuis un vrai téléphone, scénario de résilience (crash serveur en cours de session). Partiellement à rejouer manuellement.
- [ ] Provisionnement d'un NUC physique réel + installation chez le cinéma pilote.
- [ ] Compléter les `[À COMPLÉTER]` de la doc : cinéma pilote, URL/instance d'hébergement prod, contacts du runbook (`docs/runbook-cinema.md`).
- [ ] Configuration des secrets prod : SMTP, Sentry DSN, `PRIZE_HMAC_SECRET`, etc.

---

## 2. Backlog produit priorisé

Liste ordonnée. Chaque item est traité dans l'ordre sauf arbitrage explicite d'Anzio.

### 1) Affichage sponsor sur player + mobile

Le sponsor existe déjà en base (`sponsors`, `quizzes.sponsor_id`, branding) et est présent dans le payload de session, mais il n'est **rendu nulle part côté spectateur** (ni sur le grand écran player, ni sur le mobile). C'est bloquant pour vendre du brand content : sans affichage visible du sponsor, il n'y a pas d'inventaire commercialisable. Rendre le logo/branding sponsor aux moments clés (lobby, question, résultats).

### 2) Rapport de session visuel côté super-admin

Restituer visuellement le déroulé et les stats d'une session terminée (participation, scores, réponses par question, gagnants/lots) dans l'interface admin. **En cours, PR dédiée.**

### 3) Fiabilisation du déploiement

Extraire la logique de `.github/workflows/deploy.yml` vers un `scripts/deploy.sh` versionné, ajouter un **health-check** post-déploiement et un **rollback** automatique en cas d'échec. Objectif : rendre le déploiement reproductible, testable localement et sûr.

### 4) Factorisation des `lib/` dupliquées

Les 4 apps (player, mobile, console, admin) dupliquent du code `lib/` (notamment `lib/socket.ts`). Consolider dans les packages partagés (`packages/socket-client`) et **propager le backoff socket du player** (reconnexion avec backoff exponentiel) vers mobile et console, qui ne l'ont pas encore.

### 5) Lot de consolation systématique

Le champ `isConsolation` existe déjà sur `prizes` mais n'est pas exploité par défaut. Activer un lot de consolation systématique pour tous les joueurs : c'est un **pont vers la confiserie du cinéma** (chaque spectateur repart avec un bon), donc un argument de vente direct pour l'exploitant.

### 6) Mode session automatique

Positionnement "avant-séance sans personnel" : lobby minuté, enchaînement automatique des questions, clôture automatique de la session, sans intervention du projectionniste. Permet de tourner en salle même quand personne n'est en cabine.

### 7) Catalogue de quiz hebdomadaire

Quiz générés par IA puis validés manuellement, publiés en catalogue hebdomadaire, **sélectionnables par les cinémas** eux-mêmes. Résout le problème de production de contenu à l'échelle.

### 8) Join zéro-saisie + classement du mois

Jonction sans friction : pseudo auto attribué immédiatement (éditable ensuite), pour maximiser le taux de participation. Ajouter un **classement du mois** par cinéma pour créer de la rétention multi-séances.

---

## 3. Questions ouvertes business

Points non tranchés, les plus utiles à challenger d'un point de vue produit/business.

### Business

- **Modèle de facturation cinéma** : abonnement mensuel ? au nombre de séances ? freemium + commission sur lots ? Non décidé.
- **Monétisation sponsors** : piste de revenu principale envisagée, mais le go-to-market (acquisition annonceurs, pricing, constitution d'un réseau de salles) est entièrement à construire.
- **Proposition de valeur pour le cinéma** : engagement du public, données d'audience, upsell confiserie via les lots, image moderne ? Quel est l'argument qui déclenche l'achat ?

### Produit

- **Lots & rétention** : au-delà du lot de consolation et du classement du mois (backlog), faut-il un compte joueur récurrent ? une vraie mécanique de fidélité multi-séances ?
- **Contenu à l'échelle** : au-delà du catalogue IA hebdomadaire (backlog), faut-il une marketplace de quiz ? des quiz brandés produits par les distributeurs de films ?
- **Mineurs** : l'exclusion actuelle (majeurs uniquement) limite l'audience cinéma (familles). À réévaluer après le pilote.

### Technique / scalabilité

- **Multi-langues** : hors périmètre aujourd'hui mais structurant en cas d'expansion.
- **Stockage médias** : disque VPS aujourd'hui, S3/Scaleway prévu — à déclencher selon la volumétrie.
- **App native** : web/PWA aujourd'hui ; une app native changerait l'acquisition et ouvrirait les notifications push.
- **Analytics avancés** : seules des stats basiques existent (dashboard). Quelles métriques business prioriser ?

---

## 4. Dette / nettoyages

### Doublon REST `POST /api/players/join` vs socket `player:join`

Le client mobile rejoint désormais une session via le socket `player:join` (diffusion `player:joined` temps réel). La route REST `POST /api/players/join` reste en place car :

- elle est couverte par toute la suite `api/tests/players.api.test.ts` ;
- elle sert de fixture de setup dans `players.email.test.ts` et `prizes.pr7.integration.test.ts`.

Plan de retrait propre :

1. réécrire `players.api.test.ts` en client socket.io (comme `session-socket.test.ts`) ;
2. remplacer les setups de `players.email` / `prizes.pr7` par un appel direct à `playersService.join` (ou un helper d'intégration) ;
3. supprimer la route et le schéma associé.

En attendant, les deux chemins (REST + socket) partagent le même helper de diffusion (`api/src/shared/sockets/session-broadcast.ts`), donc aucun chemin "silencieux" ne subsiste.

### Autres chantiers de dette

- Tests unitaires des stores front (`nuc-store`, `live-session-store`).
- Test E2E Playwright du parcours session complet (création → lobby → questions → résultats → lot).
- Balayage au boot des emails de lots non envoyés (rattrapage des `prizes` avec `email_sent_at` null).
- Cron de cleanup des fichiers `ai-input` orphelins.
- Découpage de `quiz-edit-client.tsx` (1251 lignes) avant toute nouvelle feature admin.
