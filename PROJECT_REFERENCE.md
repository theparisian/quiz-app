# PROJECT REFERENCE — Quiz App Cinéma

> **Version :** 2.0 — Mai 2026
> **Statut :** Document de référence stable. À charger en début de chaque session IA (Cursor, Claude, etc.) comme contexte partagé.
> **Mise à jour :** uniquement lors de décisions architecturales validées par le porteur du projet.
> **Changelog v2 :** intégration des décisions post-audit (multi-cinéma, multi-salles, NUC entité, persistance complète, reconnexion, IA génération de quizz, SMTP OVH).

---

## 0. À LIRE EN PREMIER (pour toute IA assistant le projet)

Tu vas aider à développer une application de quizz live joué en salle de cinéma avant la séance. Avant d'écrire la moindre ligne de code, tu dois :

1. **Lire ce document en entier.** Il contient toutes les conventions, contraintes et décisions architecturales. Ne réinvente rien qui est déjà décidé ici.
2. **Respecter les principes non négociables** (section 2). Ils priment sur toute considération de "code propre" ou de "best practice générique".
3. **Demander avant de t'écarter.** Si tu vois un cas non couvert, propose au porteur du projet plutôt que d'inventer.
4. **Le code existant est en cours de réécriture from-scratch.** N'essaie pas de le préserver. Le `CURRENT_STATE.md` documente l'existant uniquement comme référence fonctionnelle, pas comme code à conserver.

---

## 1. VISION PRODUIT

### 1.1 En une phrase
Une plateforme multi-cinéma de quizz interactifs joués en direct par le public d'une salle, sur l'écran principal pendant l'attente avant la séance, avec interaction live via les téléphones des spectateurs.

### 1.2 Le déroulé d'une session type
1. Le public entre dans la salle, attend le début de la séance.
2. Sur l'écran de cinéma : un **QR code** s'affiche, invitant à rejoindre le quizz.
3. Les spectateurs scannent le QR avec leur téléphone, arrivent sur une web app, entrent un **pseudo**.
4. Au fur et à mesure des inscriptions, les pseudos apparaissent en lobby sur l'écran principal.
5. Quand un seuil de joueurs est atteint (ou que le projectionniste lance manuellement), le quizz démarre.
6. Chaque question s'affiche sur l'écran ; les joueurs répondent sur leur téléphone (typiquement 4 choix, 1 bonne réponse).
7. Scoring temps-réel basé sur la justesse + la rapidité (modèle type Kahoot).
8. À la fin : tableau récapitulatif sur l'écran, gagnant désigné.
9. Le gagnant reçoit sur son téléphone un message de félicitations et un lot par email (ex : QR code de réduction valable au comptoir confiserie).
10. Possibilité (rare) de finir sur un spot vidéo sponsorisé.

### 1.3 Acteurs et modèle économique
- **Spectateurs** : utilisateurs finaux. Gratuit pour eux, anonyme par défaut.
- **Cinéma exploitant** : héberge l'expérience. Modèle de facturation pas encore tranché.
- **Sponsors / annonceurs** (futur) : paient pour qu'un quizz brandé soit diffusé sur un réseau de salles.
- **Super-admin (le porteur du projet)** : gère les cinémas, débugge, crée les quizz sponsorisés, supervise la plateforme.

### 1.4 Périmètre du MVP pilote
- **1 cinéma indépendant en pilote**, mais l'archi supporte le multi-cinéma + multi-salles dès le départ.
- Fonctionnalités essentielles : sessions de quizz live + lots simples envoyés par email + reconnexion joueur + monitoring NUC + génération IA de quizz.
- **Hors périmètre actuel** : self-service annonceurs, marketplace, multi-langues, app mobile native, paiement Stripe, analytics avancés.

---

## 2. PRINCIPES NON NÉGOCIABLES

### 2.1 Robustesse > tout le reste
Le système ne doit jamais afficher une erreur visible au public en salle. Pas de page blanche, pas de spinner infini, pas de stack trace. En cas de panne : fallback gracieux. Toute erreur loggée et remontée, jamais laissée à l'utilisateur final.

### 2.2 Recovery automatique
- Reconnexion WebSocket avec backoff exponentiel.
- Reconnexion joueur après refresh / coupure : retrouve sa partie, son score, la question en cours.
- Reconnexion écran (NUC) : retrouve l'état de la session et reprend l'affichage.
- Watchdog Chromium côté NUC.
- Source de vérité unique : le serveur. Les clients re-syncent au moindre doute.

### 2.3 Observabilité avant features
Avant d'ajouter une feature, on doit pouvoir savoir si la précédente fonctionne en prod : logs structurés JSON, dashboard de santé super-admin, Sentry, heartbeat NUC.

### 2.4 Le projectionniste ne doit pas être interrompu
Console boring par défaut, puissante en cas de besoin. Pas de notification pendant une session normale. Contrôles avancés accessibles mais discrets.

### 2.5 Cloud-only au stade actuel
Tout passe par le serveur cloud. Pas de broker local sur le NUC. Le mode hybride n'est pas justifié sans données terrain qui le démandent.

### 2.6 Source de vérité = serveur
Le scoring, l'état de la session, le timing : c'est le serveur qui décide. Les clients reçoivent et rendent.

### 2.7 Persistance complète des sessions live
Toute session, tout joueur, toute réponse est persisté en DB en plus de la mémoire pour la performance live. En cas de crash serveur, l'état est reconstructible. Pas de perte, jamais.

### 2.8 Multi-tenant dès le départ
Tout le code est écrit en partant du principe qu'il y a plusieurs cinémas, chacun avec plusieurs salles. **Aucun état global** au niveau serveur. Toute requête / event est scopé à un `cinemaId` + `screenId` ou `sessionId`. L'isolation entre cinémas est stricte.

### 2.9 RGPD by design
Minimum de données collectées par défaut (pseudo seul). Email demandé uniquement si nécessaire. Politique de confidentialité accessible, opt-in explicite, suppression de compte fonctionnelle. Données hébergées dans l'UE.

---

## 3. ARCHITECTURE GLOBALE

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND (VPS UE)                        │
│  Node.js + Express + Socket.io + MySQL + Prisma              │
│  ─────────────────────────────────────────                   │
│  - REST API (CRUD, auth, IA quizz gen)                       │
│  - WebSocket gateway (sessions live multi-tenant)            │
│  - Service emails Nodemailer + SMTP OVH                      │
│  - Worker IA (génération de quizz à partir d'assets)         │
└──────────┬──────────────┬──────────────┬─────────┬──────────┘
           │              │              │         │
   WebSocket+REST   WebSocket+REST   WebSocket+REST  REST
           │              │              │         │
    ┌──────▼──────┐ ┌────▼─────┐  ┌────▼──────┐  ┌─▼────────┐
    │ A. Player   │ │ B. Mobile │  │ C. Console │  │ D. Super │
    │ (NUC, plein │ │ (joueurs) │  │ (projecto) │  │  admin   │
    │  écran)     │ │           │  │            │  │ (porteur)│
    └─────────────┘ └───────────┘  └────────────┘  └──────────┘
```

### 3.2 Les 4 interfaces

| Code | Nom | Public | Device cible | Caractéristique clé |
|------|-----|--------|--------------|---------------------|
| **A** | Player cinéma | Spectateurs | NUC + grand écran | Affichage uniquement, plein écran, robuste à la perte de connexion |
| **B** | Mobile joueur | Spectateurs | Téléphone (web responsive) | Input principal, reconnexion transparente |
| **C** | Console projectionniste | Employé cinéma | Tablette / PC en cabine | Sobriété, scopée à un cinéma |
| **D** | Super-admin | Porteur du projet | Desktop | Multi-cinémas, monitoring NUCs, IA génération |

### 3.3 Multi-tenancy : modèle Cinéma → Salle → NUC

```
Cinéma (ex: Le Quai)
  ├── Salle 1 (capacité 200)
  │     └── NUC #abc-123 (online, IP, last_seen)
  ├── Salle 2 (capacité 80)
  │     └── NUC #def-456 (offline)
  └── Salle 3 (pas encore équipée)
```

Un NUC est rattaché à exactement une salle. Une salle appartient à exactement un cinéma. Une session est créée pour une salle spécifique. Plusieurs sessions peuvent tourner en parallèle dans plusieurs cinémas / salles. Une seule session active par salle à un instant T.

### 3.4 Reconnexion : comment ça marche

Chaque connecté reçoit un **token de session** (`resume_token`) au moment où il rejoint, stocké :
- Téléphone : `localStorage` (clé `quiz_player_token`).
- NUC : filesystem local.
- Console : `localStorage`.

À la reconnexion :
1. Le client se reconnecte au WebSocket.
2. Il émet `resume` avec son token.
3. Le serveur valide le token, retrouve l'état persisté.
4. Le serveur émet `session:state_snapshot` avec tout pour reprendre l'affichage.

Cas de la question en cours pendant la déconnexion :
- Si le joueur n'avait pas encore répondu et que la question est encore active → il peut répondre.
- Si la question s'est terminée pendant sa déco → il rate la question (0 point), reprend à la suivante.
- Si la session est terminée → il voit l'écran de fin avec le classement final.

---

## 4. STACK TECHNIQUE

### 4.1 Backend
- **Runtime :** Node.js (LTS 20+).
- **Framework :** Express.js.
- **Temps-réel :** Socket.io (auto-reconnect, namespaces, rooms).
- **Base de données :** MySQL 8+ (cohérence avec UNION).
- **ORM :** Prisma (typage strict, migrations versionnées).
- **Auth :** JWT pour sessions longues côté joueur, magic link via email, bcrypt pour comptes admin/projectionniste.
- **Email :** Nodemailer + **SMTP OVH** (cohérent avec UNION, pas de dépendance externe).
- **IA génération de quizz :** API Anthropic (Claude) avec schéma JSON strict en sortie.
- **Process manager :** PM2.
- **Logs :** Pino (JSON structuré).
- **Validation :** Zod (schémas partagés backend/frontend).

### 4.2 Frontend
- **Framework :** Next.js (App Router) pour les 4 interfaces.
- **Monorepo :** Turborepo, 4 apps Next.js + packages partagés.
- **Styling :** Tailwind CSS partout. shadcn/ui pour console (C) et super-admin (D). Design custom pour player (A) et mobile (B).
- **State management :** Zustand pour le local complexe, TanStack Query pour le cache serveur.
- **Socket.io client :** hook `useSocket()` partagé dans `packages/socket-client`.

### 4.3 Hébergement et infrastructure
- **VPS :** OVH (cohérent avec UNION) ou Hetzner, UE.
- **Reverse proxy :** Nginx + Let's Encrypt.
- **DNS :** Cloudflare.
- **CI/CD :** GitHub Actions → SSH + PM2 (cohérent avec UNION).
- **SMTP :** OVH (compte mail dédié type `quiz@tondomaine.fr`).
- **Stockage médias :** disque VPS au début, S3-compatible (Scaleway UE) plus tard.
- **Backups DB :** dump MySQL quotidien, archivé hors VPS.

### 4.4 Le NUC (player)
- **Hardware :** Intel NUC, Linux Ubuntu LTS minimal.
- **Mode kiosque :** Chromium en `--kiosk` au démarrage.
- **Identification :** chaque NUC a un `nuc_uid` unique généré côté serveur lors de la création dans le super-admin (`POST /screens/:screenId/nucs`). Valeur reflétée en cabine sous `/etc/quiz-app/nuc-id`.
- **Provisionnement navigateur :** le player appelle `POST /api/nucs/auth` ; le serveur pose un JWT HTTP-only `nuc_session`.
- **Heartbeat :** après provisionnement, le navigateur appelle `POST /api/nucs/heartbeat` (cookie `nuc_session`, corps vide). La route `POST /api/nuc/heartbeat` (corps `nucUid` + `authKey`) reste disponible pour intégrations hors navigateur.
- **Fail-safe :** si Chromium crashe, systemd le relance.
- **MDM / accès distant :** SSH via Tailscale ou VPN dédié.
- **Mise à jour :** manuel SSH au début, balena.io plus tard.

### 4.5 Auth des joueurs (interface B)
1. **Niveau 0 — Anonyme** (par défaut) : pseudo seul, aucun compte.
2. **Niveau 1 — Compte optionnel** : icône "Se connecter" sur la home mobile, non intrusive.
3. **Niveau 2 — Inscription en fin de partie** : magic link.
4. **Niveau 3 — OAuth Google / Apple** : à la création de compte.
5. **Persistance** : magic link → JWT longue durée (30 jours, refresh sliding).

Un joueur anonyme doit pouvoir terminer une partie et recevoir son lot par email **sans créer de compte** — on lui demande son email à ce moment-là, ponctuellement.

### 4.6 IA génération de quizz (super-admin)

**Use case** : Anzio veut créer un quizz sur un film, une série, une marque. Il importe des assets → l'IA génère un quizz éditable.

**Flow technique** :
1. Popin "Générer avec IA" depuis l'écran de création de quizz (interface D).
2. Anzio upload des assets (images, textes, synopsis) ou colle du texte.
3. Il précise : nombre de questions, difficulté, ton, langue.
4. Le backend appelle Claude (API Anthropic) avec un prompt système contraint et un schéma JSON strict.
5. Le résultat est inséré dans le formulaire de création de quizz, **éditable**.
6. Anzio relit, modifie, valide. Le quizz est sauvegardé en DB comme un quizz manuel (champ `ai_generated` à true pour stats).

**Considérations** :
- Appel **côté backend** uniquement (clé API jamais exposée).
- Coût loggé par génération.
- Limites de longueur sur les uploads.
- En cas d'échec, message clair, fallback création manuelle toujours possible.

---

## 5. MODÈLE DE DONNÉES (MySQL via Prisma)

### 5.1 Entités principales

```
cinemas
  id, slug, name, address, city, postal_code, country,
  contact_name, contact_email, contact_phone,
  status (active|paused|trial), created_at, updated_at, notes

screens (salles d'un cinéma)
  id, cinema_id, name (ex: "Salle 1"), capacity, status,
  created_at, updated_at

nucs (devices physiques)
  id, screen_id, nuc_uid (unique, généré à l'install),
  hardware_info (JSON), app_version,
  last_seen_at, last_ip, last_heartbeat_at,
  status (online|offline|error|provisioning),
  auth_key_hash, created_at, updated_at

users (joueurs avec compte + admins + projectionnistes + super-admin)
  id, email, magic_link_token (nullable, courte durée),
  magic_link_expires_at,
  oauth_provider (nullable: google|apple), oauth_id (nullable),
  display_name, password_hash (nullable, comptes locaux),
  role (player|projectionist|cinema_admin|super_admin),
  cinema_id (nullable, pour projectionnistes/admins liés à un cinéma),
  created_at, last_login_at, deleted_at (soft delete RGPD)

quizzes (gabarits réutilisables)
  id, slug, title, description, type (standard|sponsored|custom),
  sponsor_id (nullable), language, duration_estimate_seconds,
  cover_image_url, branding_json (couleurs custom, logo si sponsorisé),
  status (draft|published|archived),
  created_by_user_id, ai_generated (bool),
  created_at, updated_at

questions
  id, quiz_id, position (ordre), text, image_url (nullable),
  time_limit_seconds, points_max, points_floor,
  explanation, created_at

answers (les choix possibles d'une question)
  id, question_id, position (A|B|C|D), text, is_correct (bool)

sessions (instance d'un quizz lancée dans une salle)
  id, slug_short (ex: "ABCD42" pour QR), quiz_id, screen_id,
  projectionist_user_id (nullable),
  state (lobby|running|paused|ended|aborted),
  current_question_position (nullable),
  started_at, ended_at,
  total_players, winner_player_id (nullable),
  created_at, updated_at

players (participant à une session, peut être anonyme)
  id, session_id, user_id (nullable si anonyme), pseudo,
  resume_token (unique, pour reconnexion),
  joined_at, last_seen_at, status (active|disconnected|kicked),
  score_total, rank_final (nullable jusqu'à la fin),
  email_for_prize (nullable)

player_answers
  id, player_id, question_id, chosen_answer_id (nullable),
  answered_at_server, time_to_answer_ms, points_awarded,
  is_correct (dénormalisé)

sponsors
  id, name, slug, logo_url, brand_color_primary, brand_color_secondary,
  contact_email, contract_terms, active, created_at, updated_at

prizes
  id, session_id, player_id, type (discount_qr|video|other),
  payload_json, email_sent_at, redeemed_at (nullable)

events_log
  id, session_id (nullable), nuc_id (nullable), cinema_id (nullable),
  level (info|warn|error|critical),
  event_type, payload_json, created_at

ai_generations (audit des générations IA)
  id, user_id, quiz_id (nullable),
  input_summary, model_used, tokens_input, tokens_output,
  cost_estimate_eur, status (success|failed|partial),
  error_message (nullable), created_at
```

### 5.2 Conventions
- Tables en `id` BIGINT auto-increment + `created_at`, `updated_at` quand pertinent.
- IDs externes exposés frontend : **slugs ou nanoid**, pas les IDs auto-increment.
- Soft delete uniquement sur `users` et `cinemas`. Ailleurs, statut explicite.
- Pas de stockage de mots de passe pour les joueurs (auth = magic link + OAuth).
- Index obligatoires : `sessions.slug_short`, `players.resume_token`, `nucs.nuc_uid`, toutes les FK.

---

## 6. CONVENTIONS DE CODE

### 6.1 Structure backend
```
/api
  /src
    /modules
      /cinemas, /screens, /nucs, /quizzes, /sessions,
      /players, /users, /prizes, /ai
    /shared
      /db (Prisma config)
      /sockets (gateway, namespaces, rooms)
      /email (Nodemailer + SMTP OVH)
      /logger (Pino)
      /errors (AppError, middleware)
      /auth (JWT, sessions, rôles)
      /validation (schémas Zod)
    /routes
    /server.ts
  /prisma
    schema.prisma
    migrations/
  /tests
```

**Règle d'or :** chaque module métier expose ses propres routes, services, et events Socket.io. Pas de fichier monolithique.

### 6.2 Structure frontend monorepo
```
/apps
  /player    ← interface A
  /mobile    ← interface B
  /console   ← interface C
  /admin     ← interface D
/packages
  /ui              ← composants Tailwind + shadcn/ui
  /socket-client   ← hook useSocket(), types events
  /types           ← types TS partagés
  /validation      ← schémas Zod partagés
  /design-tokens   ← Tailwind preset
```

### 6.3 Style de code
- TypeScript strict partout.
- ESLint + Prettier + Husky pre-commit.
- Pas de `any` sauf justification commentée.
- camelCase variables/fonctions, PascalCase types/composants, snake_case colonnes DB.
- Path aliases configurés (`@/modules/...`).
- Commentaires en français pour la doc projet, anglais OK pour code technique.

### 6.4 Gestion des erreurs
- Backend : classe `AppError` custom + middleware Express centralisé.
- Frontend : Error Boundaries React + Sentry.
- Codes d'erreur stables (ex: `SESSION_NOT_FOUND`, `PLAYER_ALREADY_ANSWERED`).

### 6.5 Tests
- Unitaires sur les services métier critiques (scoring, transitions de session, classement, reconnexion).
- Intégration sur les flux Socket.io critiques.
- Pas de course au coverage. Tester ce qui est risqué.
- Vitest partout.

---

## 7. CONVENTIONS SOCKET.IO

### 7.1 Namespaces
- `/player` (NUCs, interface A)
- `/mobile` (téléphones, interface B)
- `/console` (projectionnistes, interface C)
- `/admin` (super-admin, interface D)

### 7.2 Rooms
- `session:{sessionId}` : tous les acteurs d'une session live.
- `cinema:{cinemaId}` : projectionniste voit ses sessions, super-admin filtre.
- `admin:global` : super-admin reçoit heartbeats et events critiques globaux.

### 7.3 Nommage des events
Format `domain:action` snake_case :
- `session:state_changed`
- `session:player_joined`, `session:player_left`
- `quiz:question_show`, `quiz:question_result`, `quiz:final_results`
- `player:answer_submit` (mobile → serveur)
- `player:answer_ack` (serveur → mobile)
- `player:resume`, `nuc:resume`, `console:resume`
- `nuc:heartbeat`, `nuc:status_changed`

### 7.4 Schéma des payloads
Tous les events sont validés via Zod. Schémas dans `/packages/validation/socket-events.ts`.

```ts
const QuestionShowPayload = z.object({
  questionId: z.string(),
  position: z.number().int().min(1),
  text: z.string(),
  imageUrl: z.string().url().optional(),
  answers: z.array(z.object({
    id: z.string(),
    position: z.enum(['A', 'B', 'C', 'D']),
    text: z.string(),
  })).length(4),
  timeLimitSeconds: z.number().int().min(5).max(120),
  serverStartedAt: z.string().datetime(),
});
```

---

## 8. SÉCURITÉ

- HTTPS partout, même en dev sur les flux Socket.io de prod.
- Secrets jamais committés. Variables d'env + GitHub Actions secrets.
- Rate limiting (express-rate-limit) sur join session, magic link, AI generation.
- Validation Zod systématique des payloads.
- CSP stricte.
- NUC ne fait JAMAIS d'appel hors backend de l'app.
- Audit régulier des dépendances.
- Auth mutuelle NUC ↔ serveur : clé d'auth générée à l'install, stockée localement.

---

## 9. RGPD

### 9.1 Données collectées et conservation
- **Joueur anonyme** : pseudo, réponses, score. Conservation : 30 jours après fin de session.
- **Joueur inscrit** : email, pseudo, historique. Conservation : tant que le compte existe.
- **Joueur gagnant non inscrit** : email pour envoi du lot. Conservation : 90 jours.
- **Projectionnistes / admins** : email, nom, cinéma. Conservation : pendant la relation contractuelle.
- **NUCs** : pas de donnée personnelle.

### 9.2 Obligations
- Politique de confidentialité accessible.
- Mentions légales du cinéma + de la plateforme.
- Bouton "Supprimer mon compte" fonctionnel (B).
- Registre des traitements à tenir.

### 9.3 Mineurs
**Option A pour le pilote** : exclusion. Majeurs uniquement, mention claire avant saisie pseudo. À réévaluer après 3 mois.

---

## 10. CYCLE DE VIE D'UNE SESSION

```
[CRÉATION]
  Console (C) demande : "lance le quiz X dans la salle Y"
  → Serveur valide droits (le projectionniste appartient au cinéma de la salle)
  → Crée session, state = 'lobby'
  → Génère slug court (ex: ABCD42)
  → Récupère le NUC de la salle
  → Pousse session:state_changed à NUC, console, room admin

[LOBBY]
  NUC affiche QR (URL = mobile.app/?s=ABCD42)
  Téléphones rejoignent : player:join { sessionCode, pseudo }
  Serveur ajoute le player, génère resume_token, le renvoie
  Pousse player:joined à NUC, console, admin
  Le player stocke son resume_token en localStorage
  
  Quand seuil atteint OU action manuelle de C :
    C envoie session:start
    Serveur passe state = 'running', position = 0

[RUNNING — boucle par question]
  Serveur sélectionne la prochaine question
  Pousse quiz:question_show à NUC + tous les mobiles de la session
  Démarre timer côté serveur (timeLimitSeconds)
  
  Mobile envoie player:answer_submit { questionId, answerId }
  Serveur valide :
    - session running ?
    - question encore active ?
    - player n'a pas déjà répondu ?
    - réponse appartient bien à la question ?
  Serveur calcule les points (algo cohérent avec l'existant) :
    - Incorrect : 0
    - Correct : max(round(points_max * timeLeft / totalTime), points_floor)
    - Par défaut points_max = 1000, points_floor = 500
  Serveur ack : player:answer_ack avec score perso
  Serveur persiste en DB (player_answers)
  
  Quand timer expire OU tous ont répondu :
    Serveur compile résultats
    Pousse quiz:question_result à NUC, mobiles, console
    Pause configurable (par défaut 10s pour explication)
    Question suivante OU fin

[RECONNEXION en cours de session]
  Acteur revient après coupure
  Émet player:resume / nuc:resume / console:resume avec son token
  Serveur retrouve l'état, envoie session:state_snapshot avec :
    - état actuel de la session
    - question en cours si running
    - score du joueur si applicable
    - timer restant si applicable
  Le client reprend l'UI sans interruption visible

[ENDED]
  Serveur calcule classement final, désigne winner
  Pousse quiz:final_results à tous
  Génère et envoie le lot au gagnant (async)
  state = 'ended', persiste

[ABORTED]
  Si C envoie session:abort : state = 'aborted', notification gracieuse à tous
  Si erreur serveur fatale : state = 'aborted', écran de fallback NUC
```

**Invariants :**
- `lobby` → `running` ou `aborted` uniquement.
- `running` → `paused`, `ended` ou `aborted` uniquement.
- `paused` → `running` ou `aborted`.
- `ended` et `aborted` sont terminaux.
- Une question est diffusée 1 seule fois par session.
- Un player répond 1 seule fois par question.
- Un NUC actif sur 1 seule session à la fois.

---

## 11. ROADMAP DE LA RÉÉCRITURE

### Phase 0 — Pré-requis (FAIT)
- ✅ Backup du code existant.
- ✅ Décisions stack et archi (ce document).
- ✅ État des lieux (`CURRENT_STATE.md`).
- ✅ Décision : **réécriture complète**.

### Phase 1 — Fondations (PR1)
Init monorepo Turborepo (4 apps Next.js + packages), TypeScript strict, ESLint/Prettier/Husky, Prisma + schéma DB complet, bootstrap backend modulaire avec 1 module exemple, Socket.io avec namespaces et types partagés, CI minimale.

### Phase 2 — Auth et entités de base (PR2)
Module users + auth (magic link, JWT, OAuth Google/Apple). Modules cinemas, screens, nucs avec CRUD super-admin. Interface D minimale : login + liste des cinémas/salles/NUCs.

### Phase 3 — Création et gestion de quizz (PR3)
Modules quizzes, questions, answers. Interface D : éditeur de quizz complet (questions, options, timer, explication, branding sponsor). Validation Zod.

### Phase 4 — IA génération de quizz (PR4)
Module IA backend (appel Claude API, schéma JSON strict). Popin "Générer avec IA" dans l'éditeur D. Audit DB des générations.

### Phase 5 — Sessions live cœur métier (PR5)
Module sessions complet avec persistance. Modules players, player_answers. Logique de scoring serveur. Events Socket.io session multi-room multi-tenant. Interface C (console). Interface A (player NUC). Interface B (mobile).

### Phase 6 — Reconnexion et robustesse (PR6)
Resume_tokens et state_snapshot. Tests d'intégration des cas de coupure. Watchdog Chromium NUC. Heartbeat + monitoring NUC dans interface D.

### Phase 7 — Lots et email (PR7)
Module prizes. Envoi email via Nodemailer + SMTP OVH. QR code de réduction avec tracking. Template HTML email propre.

### Phase 8 — Observabilité (PR8)
Logs Pino structurés partout. Sentry frontend et backend. Dashboard de santé interface D. Events_log peuplé.

### Phase 9 — Pilote terrain
Provisioning d'un NUC réel. Installation chez le cinéma pilote. Runbook d'incident. Tests à blanc. Premier quizz live en conditions réelles.

### Phase 10 (futur, hors MVP)
Self-service annonceurs, multi-langues, app native, analytics avancés, marketplace.

---

## 12. GLOSSAIRE

- **NUC** : mini-PC en cabine, fait tourner l'interface A. Entité first-class en DB.
- **Player** (au sens app) : interface A, le grand écran. Pas confondre avec "joueur".
- **Joueur** : spectateur participant via téléphone (interface B).
- **Console** : interface C, projectionniste.
- **Super-admin** : interface D, le porteur du projet.
- **Session** : instance d'un quizz lancée dans une salle.
- **Lobby** : phase de pré-jeu.
- **Resume token** : identifiant unique pour reconnexion d'un joueur.
- **Heartbeat** : ping périodique du NUC vers le serveur.

---

## 13. CONTACTS

- **Porteur :** Anzio
- **Repo :** github.com/theparisian/quiz-app
- **Cinéma pilote :** [à compléter]
- **Hébergement :** VPS en Union européenne (cf. §4.3 : typiquement OVH ou équivalent UE) ; URL ou identifiant d'instance de prod : **[à compléter]**
- **Domaine :** demo.uxii.fr (existant) — éventuelle migration vers domaine projet dédié

---

## ANNEXE A — Comment utiliser ce document avec une IA

**En début de session Cursor / Claude Code :**
```
Lis intégralement les fichiers PROJECT_REFERENCE.md et CURRENT_STATE.md à la racine du projet.
PROJECT_REFERENCE.md fait autorité sur l'architecture cible et les conventions.
CURRENT_STATE.md décrit l'existant qui sera réécrit (référence fonctionnelle, pas code à conserver).
Tu DOIS respecter les principes non négociables (section 2 du REFERENCE) et les conventions (section 6).
Si tu vois un cas qu'ils ne couvrent pas, demande-moi avant d'inventer.
```

**Pour une tâche spécifique :**
```
Tâche : [description précise]
Module concerné : [cinemas / quizzes / sessions / etc.]
Sections pertinentes du PROJECT_REFERENCE : [N, M, ...]
Contraintes additionnelles : [s'il y en a]
```

---

*Fin du document.*
