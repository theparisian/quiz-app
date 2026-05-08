# MIGRATION PLAN — Réécriture from-scratch du Quiz App Cinéma

> **Version :** 1.0 — Mai 2026
> **Statut :** Plan d'exécution. Document vivant, mis à jour au fur et à mesure.
> **À lire avant :** `PROJECT_REFERENCE.md` (architecture cible) et `CURRENT_STATE.md` (existant à remplacer).

---

## Contexte de la décision

L'audit du code existant (`CURRENT_STATE.md`) a montré :
- Architecture monolithique (`server.js` ~968 lignes).
- Aucun framework front (HTML statique + JS vanilla + Bootstrap).
- Schéma DB sous-dimensionné pour la cible (4 tables, mono-session, pas de notion de cinéma/salle/NUC).
- Pas de TypeScript, pas de tests, pas de Prisma.
- Plusieurs zones de dette identifiée (events Socket.io dupliqués, code mort, double émissions).

**Décision :** réécriture from-scratch dans un nouveau dossier, en parallèle de l'existant. L'ancien code reste accessible pour référence fonctionnelle pendant toute la phase de réécriture, puis sera archivé une fois le pilote validé sur la nouvelle stack.

---

## Stratégie de réécriture

### Principe directeur
**Une PR = une fonctionnalité complète, testable, et déployable indépendamment** (au moins en local).

On évite les big-bang. Chaque PR doit pouvoir être mergée sans tout casser. À la fin de chaque PR, on a quelque chose qui tourne, même si toutes les features ne sont pas encore là.

### Branches et sécurité
- Branche principale : `main` (ce qui tourne en prod, donc pour l'instant l'ancien code).
- Branche de réécriture : `rewrite/v2` (long-lived, mergée dans `main` uniquement quand le nouveau projet est complet et validé en pilote).
- Chaque PR : `rewrite/v2/pr-N-description-courte`, mergée dans `rewrite/v2` après review.

### Workflow Cursor recommandé
- **Une nouvelle conversation Cursor par PR**, pour ne pas saturer la mémoire.
- Coller en début de chaque conv le `PROJECT_REFERENCE.md` ET le prompt spécifique de la PR.
- À la fin de chaque PR : commit, push, mise à jour du `CONVERSATION_HANDOFF.md` avec ce qui a été fait.
- Si Cursor coince ou déraille : revenir vers Anzio (et éventuellement vers Claude.ai en discussion produit), pas tenter de débloquer en force dans la même conversation.

### Test de validation par PR
Chaque PR a un **critère de complétude clair et testable**. Tant qu'il n'est pas atteint, on ne passe pas à la suivante.

---

## Découpage des PRs

> Chaque PR ci-dessous est résumée. Le prompt Cursor détaillé est rédigé séparément (`CURSOR_REWRITE_PROMPT_PR1.md`, etc.) au moment où on l'attaque.

### PR1 — Fondations du monorepo

**Objectif :** poser le squelette technique vide mais fonctionnel.

**Contenu :**
- Init monorepo Turborepo à la racine (nouveau dossier `app/` ou directement à la racine, à trancher).
- 4 apps Next.js vides mais qui démarrent : `apps/player`, `apps/mobile`, `apps/console`, `apps/admin`.
- Packages : `packages/ui`, `packages/socket-client`, `packages/types`, `packages/validation`, `packages/design-tokens`.
- Backend Node + Express dans `api/`, structure modulaire conforme section 6.1 du REFERENCE.
- Prisma initialisé avec le schéma complet (section 5 du REFERENCE), 1ère migration générée mais pas appliquée à la prod.
- TypeScript strict, ESLint, Prettier, Husky, lint-staged.
- Tailwind CSS configuré dans les 4 apps avec preset partagé.
- Socket.io setup avec les 4 namespaces (`/player`, `/mobile`, `/console`, `/admin`), une room d'exemple, 1 event de test typé via Zod.
- Healthcheck endpoint backend (`GET /health`).
- Page d'accueil simple dans chaque app avec un "Hello [interface name]" et un appel WebSocket de test.
- README à jour expliquant la nouvelle structure et comment démarrer en dev.
- GitHub Actions : workflow `ci.yml` qui fait `pnpm install && pnpm typecheck && pnpm lint`.

**Critère de complétude :**
- `pnpm dev` à la racine démarre les 4 apps Next.js + le backend simultanément.
- Chaque app affiche son "Hello" et établit une connexion WebSocket sans erreur console.
- `pnpm typecheck` passe sans erreur.
- `pnpm lint` passe sans erreur.
- La CI GitHub Actions passe sur la PR.

**Hors périmètre :** auth, modules métier, UI léchée, données réelles.

---

### PR2 — Auth, users et entités structurelles

**Objectif :** pouvoir se connecter en super-admin et voir/gérer les cinémas, salles, NUCs.

**Contenu :**
- Module `users` complet : modèle Prisma, services, routes, validation Zod.
- Auth : magic link via SMTP OVH (Nodemailer), JWT pour les sessions longues, bcrypt pour les comptes locaux (super-admin et projectionnistes).
- OAuth Google et Apple : structure prête mais activation conditionnelle (env vars). Si les clés ne sont pas fournies, les boutons OAuth sont masqués.
- Modules `cinemas`, `screens`, `nucs` : modèles, services, routes, validation, CRUD.
- Système de rôles + middleware d'autorisation (super_admin, cinema_admin, projectionist, player).
- Interface D (super-admin) :
  - Page login (email → magic link → entrée).
  - Dashboard avec liste des cinémas.
  - Vue cinéma : ses salles, ses NUCs.
  - CRUD cinéma, CRUD salle, création/suppression NUC.
  - Affichage du `nuc_uid` et instruction d'install pour Anzio.
- Génération du `nuc_uid` au moment de la création (server-side, format nanoid).
- Compte super-admin seed via une commande Prisma (pour bootstrap).

**Critère de complétude :**
- Anzio peut se créer un compte super-admin via la commande seed.
- Anzio peut se connecter via magic link (email reçu sur son adresse).
- Anzio peut créer un cinéma, ajouter des salles, créer des NUCs.
- Anzio peut désactiver / supprimer ces entités.
- Tests d'intégration sur les routes principales (auth, CRUD cinéma).

**Hors périmètre :** quizz, sessions, NUC physique réel.

---

### PR3 — Création et gestion de quizz

**Objectif :** pouvoir créer un quizz manuellement de A à Z dans l'interface super-admin.

**Contenu :**
- Modules `quizzes`, `questions`, `answers` : modèles Prisma, services, routes, validation Zod.
- Logique de versioning légère (un quizz publié ne peut plus être modifié, on duplique pour faire une nouvelle version) — à confirmer avec Anzio dans le prompt.
- Interface D :
  - Liste des quizz avec filtre par statut (draft / published / archived) et type (standard / sponsored).
  - Éditeur de quizz : titre, description, langue, type, branding (couleurs custom, logo si sponsorisé).
  - Éditeur de questions : ajout/suppression/réordonnancement, image optionnelle, 4 options éditables, choix de la bonne réponse, explication, time limit, points max/floor.
  - Preview du quizz avant publication.
  - Actions : enregistrer brouillon, publier, archiver, dupliquer.
- Module `sponsors` minimal (CRUD basique pour rattacher un sponsor à un quizz).
- Upload des images de questions et logos sponsors (stockage local sur le VPS, structure prête pour migration S3 plus tard).
- Validation Zod stricte sur les inputs (titre min/max, bonne réponse obligatoire, etc.).

**Critère de complétude :**
- Anzio peut créer un quizz de bout en bout (titre, 5+ questions, images, branding).
- Anzio peut publier le quizz et le voir passer en statut "published".
- Anzio peut dupliquer un quizz.
- Tests sur la validation et les transitions de statut.

**Hors périmètre :** lancement de session, IA génération.

---

### PR4 — Génération IA de quizz

**Objectif :** pouvoir générer un quizz à partir d'assets via une popin dans l'éditeur.

**Contenu :**
- Module `ai` backend : intégration de l'API Anthropic (Claude), prompt système contraint, schéma JSON de sortie strict (Zod).
- Endpoint POST `/api/ai/generate-quiz` qui prend en entrée :
  - Texte source (libre).
  - Métadonnées : nombre de questions, difficulté, ton, langue.
  - Optionnel : URL d'images uploadées.
- Réponse : JSON conforme au schéma Quizz, prêt à être inséré dans l'éditeur (mais pas encore persisté).
- Interface D :
  - Bouton "Générer avec IA" dans l'éditeur de quizz.
  - Popin avec champ texte (paste de scénario, synopsis, etc.) + upload d'images + paramètres (slider nombre de questions, sélecteurs difficulté/ton/langue).
  - Loader pendant la génération (peut prendre 10-30s).
  - Affichage du résultat dans l'éditeur, modifiable, validable.
- Audit en DB (`ai_generations`) : qui, quand, combien de tokens, quel coût estimé, quel quizz résultant.
- Rate limiting strict sur cet endpoint (max 5 générations/heure par user).
- Gestion d'erreur claire : timeout API, échec parsing JSON, contenu inapproprié → message utilisateur sans dévoiler les détails techniques.

**Critère de complétude :**
- Anzio peut coller un texte (ex: synopsis d'un film) dans la popin et obtenir un quizz éditable de N questions.
- Le quizz généré est éditable comme un quizz manuel.
- L'audit en DB enregistre chaque génération.
- Le coût et le compteur de tokens sont visibles dans le dashboard super-admin.

**Hors périmètre :** génération à partir de vidéos, multi-langue automatique, fine-tuning.

---

### PR5 — Sessions live cœur métier

**Objectif :** lancer une session, jouer un quizz du début à la fin avec joueurs réels.

**Contenu :** (la plus grosse PR du projet, à découper éventuellement en sous-PRs si trop volumineuse)
- Module `sessions` : modèle Prisma, machine à états (lobby/running/paused/ended/aborted), services, routes.
- Module `players` : modèle, génération de resume_token à la jonction.
- Module `player_answers` : persistance des réponses + calcul des points serveur.
- Logique de scoring identique à l'existant : `max(round(points_max * timeLeft / totalTime), points_floor)` si correct, 0 sinon.
- Events Socket.io complets (cf. section 7 du REFERENCE).
- Timer côté serveur, broadcast `timer_update` aux clients de la session.
- Interface C (console projectionniste) :
  - Login projectionniste (email + magic link).
  - Vue de sa salle : sessions passées + bouton "Lancer une session".
  - Choix d'un quizz publié → création de session.
  - Console live : code session, joueurs en lobby, contrôles (démarrer, suivante, forcer fin question, terminer, abandonner).
  - Sobriété UI selon principe 2.4 du REFERENCE.
- Interface A (player NUC) :
  - URL avec `nuc_uid` en query string ou stockage local.
  - États : idle (logo cinéma), lobby (QR + pseudos), question, résultat question, résultats finaux.
  - Animations propres entre les états.
  - Audio (sons questions, musique de fond) — port depuis l'existant si compatible.
- Interface B (mobile joueur) :
  - Page d'accueil avec saisie code session ou détection via URL `?s=ABCD42`.
  - Saisie pseudo, écran de pseudonyme respecté.
  - Lobby : "Tu participes, on attend les autres".
  - Question : 4 boutons d'options, timer visuel, retour immédiat après réponse.
  - Résultat question : correct/incorrect, points gagnés, score total.
  - Écran final : classement, position, formulaire email si gagnant.
- Multi-tenant strict : tous les events sont scopés à `session:{id}`, pas de fuite entre cinémas.

**Critère de complétude :**
- Anzio peut, depuis 3 onglets différents (console, NUC simulé, téléphone), faire tourner une session complète de bout en bout.
- Plusieurs téléphones peuvent rejoindre simultanément la même session.
- Le scoring est correct.
- Les états s'enchaînent proprement.
- Tests d'intégration des transitions critiques (lobby → running, run → ended, abort).

**Hors périmètre :** reconnexion (PR6), email gagnant (PR7), monitoring NUC (PR6), génération du QR code (à faire ici, simple).

---

### PR6 — Reconnexion et robustesse

**Objectif :** rendre le système résilient aux coupures réseau et redémarrages.

**Contenu :**
- Implémentation complète du flux `resume` côté joueur :
  - Stockage du `resume_token` en localStorage à la jonction.
  - Émission de `player:resume` à la reconnexion.
  - Récupération du `session:state_snapshot` côté serveur.
  - Reconstitution de l'UI sans interruption visible (question en cours, score, timer restant).
- Implémentation du flux `nuc:resume` : le NUC retrouve sa session active après redémarrage Chromium.
- Implémentation du flux `console:resume` : la console projectionniste retrouve sa session.
- Backoff exponentiel sur les tentatives de reconnexion Socket.io.
- Heartbeat NUC : POST `/api/nuc/heartbeat` toutes les 30s avec `nuc_uid`, version, timestamp, IP.
- Détection serveur du passage online → offline si pas de heartbeat depuis 90s.
- Interface D : indicateur d'état de chaque NUC (online/offline) avec horodatage du dernier heartbeat.
- Watchdog côté NUC (script systemd qui restart Chromium s'il freeze).
- Tests d'intégration des cas critiques :
  - Joueur perd son réseau pendant 10s puis revient (avec et sans question en cours).
  - NUC redémarre pendant une session.
  - Serveur backend redémarre pendant une session (la session doit pouvoir reprendre).

**Critère de complétude :**
- Un joueur peut couper son réseau, attendre 30s, revenir et reprendre la partie sans perdre son contexte.
- Un NUC qui crashe et redémarre retrouve sa session si elle est encore active.
- Le statut online/offline des NUCs est visible en temps réel dans l'interface D.
- Le serveur backend qui redémarre ne perd aucune session (état reconstructible depuis la DB).

**Hors périmètre :** monitoring avancé (Sentry est en PR8).

---

### PR7 — Lots et email transactionnel

**Objectif :** envoyer un lot par email au gagnant, avec un QR code utilisable au cinéma.

**Contenu :**
- Module `prizes` : modèle Prisma, services, routes.
- Configuration des types de lots (par cinéma / par sponsor) :
  - Réduction sur la confiserie (générique).
  - Lot personnalisé (à définir).
- Génération d'un QR code unique côté serveur pour le lot du gagnant (encode un identifiant + signature pour vérification anti-fraude).
- Endpoint de validation du QR au cinéma (futur, scaffolding) : `POST /api/prizes/redeem` avec le code, retourne valide/invalide/déjà utilisé.
- Service email Nodemailer + SMTP OVH :
  - Configuration via env (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
  - Template HTML séparé (pas inline dans le code), avec branding cinéma + sponsor.
  - Envoi asynchrone via une queue simple (BullMQ + Redis OU une queue MySQL maison si on veut éviter Redis pour le pilote).
  - Retry en cas d'échec SMTP.
- Email contient : pseudo, score, classement, image du lot, QR code en pièce jointe ou inline, conditions d'utilisation, lien de désabonnement.
- Flux complet en fin de partie :
  - Le gagnant entre son email sur le mobile (interface B).
  - Le serveur valide qu'il est bien gagnant.
  - Génère le prize, génère le QR, envoie l'email.
  - Confirme côté mobile.

**Critère de complétude :**
- Anzio joue une session en local, gagne, entre son email, reçoit un email avec un QR code valide dans sa boîte.
- L'email rend correctement (Gmail, Apple Mail, Outlook).
- Le module redeem est testable même s'il n'a pas encore d'interface utilisateur.

**Hors périmètre :** interface du cinéma pour scanner les QR (à faire plus tard).

---

### PR8 — Observabilité

**Objectif :** voir ce qui se passe en production et être alerté en cas de problème.

**Contenu :**
- Logs Pino structurés (JSON) sur tous les modules backend.
- Sentry frontend (4 apps) et backend, avec sourcemaps en prod.
- Dashboard de santé dans l'interface D :
  - État de chaque NUC (online/offline, dernier heartbeat, version d'app).
  - Sessions actives en cours dans tous les cinémas.
  - Erreurs récentes (depuis Sentry ou events_log).
  - Stats du jour : nombre de sessions, joueurs, taux de complétion.
- Peuplement systématique de la table `events_log` sur les events critiques (création session, abort, erreur paiement, échec email, NUC offline > 5min, etc.).
- Alertes par email vers Anzio sur les events de niveau `critical`.
- Healthcheck étendu : `GET /health/detailed` qui vérifie DB, SMTP, espace disque, mémoire.

**Critère de complétude :**
- Anzio voit un dashboard temps-réel utile dans l'interface D.
- Une erreur backend provoquée volontairement remonte dans Sentry.
- Une erreur frontend provoquée volontairement remonte dans Sentry.
- Un NUC qui passe offline déclenche une notification visible dans le dashboard.

**Hors périmètre :** logging long-terme (à choisir plus tard : BetterStack, Axiom...).

---

### PR9 — Préparation pilote terrain

**Objectif :** être prêt à installer chez le cinéma pilote.

**Contenu :**
- Script de provisioning du NUC (bash) : install Ubuntu, Chromium, mode kiosque, systemd unit pour relancer Chromium, génération du `nuc_uid`, configuration des credentials.
- Documentation d'install (Markdown) pour le NUC.
- Runbook d'incident (Markdown) à laisser au cinéma : que faire si l'écran est noir, si le QR ne marche pas, comment contacter Anzio.
- Page d'erreur générique côté NUC qui s'affiche si tout part en sucette (logo cinéma + "Reprise dans quelques instants").
- Tests à blanc en local et avec un NUC réel.
- Mise à jour de tous les `[à compléter]` dans le `PROJECT_REFERENCE.md` (cinéma pilote, hébergement, domaine).

**Critère de complétude :**
- Un NUC neuf peut être provisionné en moins de 30 minutes avec le script.
- Le runbook est clair et utilisable par un employé non technique.
- Un test à blanc complet a été réalisé en local avant l'install terrain.

---

## Estimation grossière du temps

À titre indicatif, en travaillant avec Cursor et Claude :

| PR | Temps estimé (Anzio + IA) |
|----|---------------------------|
| PR1 — Fondations | 1 demi-journée |
| PR2 — Auth + entités | 1 journée |
| PR3 — Quizz | 1 journée |
| PR4 — IA génération | 1 demi-journée |
| PR5 — Sessions live | 2-3 journées (la plus grosse) |
| PR6 — Reconnexion | 1 journée |
| PR7 — Lots et email | 1 demi-journée |
| PR8 — Observabilité | 1 demi-journée |
| PR9 — Pilote prep | 1 demi-journée |

**Total :** ~9-10 journées de travail effectif. À étaler sur le calendrier réel d'Anzio.

C'est une estimation optimiste qui suppose que rien ne dérape. Compte +30% pour les imprévus.

---

## Règles transversales pour toutes les PRs

1. **Une seule PR à la fois.** On ne commence pas la suivante avant que l'actuelle soit mergée et validée.
2. **Tests passent ou la PR ne se merge pas.** Pas d'exception.
3. **Le `CONVERSATION_HANDOFF.md` est mis à jour en fin de chaque PR.**
4. **Les secrets ne sont jamais committés.** Variables d'env via `.env` (gitignored) et GitHub Secrets pour la CI.
5. **Le `PROJECT_REFERENCE.md` est la source de vérité.** Si une PR le contredit, on met à jour le doc en premier.
6. **Pas de feature creep dans une PR.** Si une bonne idée surgit, elle va dans une note pour une PR future.

---

*Fin du document.*
