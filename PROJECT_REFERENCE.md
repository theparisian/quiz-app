# PROJECT REFERENCE — Shh!

> **Version :** 2.0 — Mai 2026
> **Statut :** Document de référence stable. À charger en début de chaque session IA (Cursor, Claude, etc.) comme contexte partagé.
> **Mise à jour :** uniquement lors de décisions architecturales validées par le porteur du projet.
> **Changelog v2 :** intégration des décisions post-audit (multi-cinéma, multi-salles, NUC entité, persistance complète, reconnexion, IA génération de quizz, SMTP OVH).

---

## 0. À LIRE EN PREMIER (pour toute IA assistant le projet)

Tu vas aider à faire évoluer **Shh!**, une application de quiz live joué en salle de cinéma avant la séance. La base de code v2 est en place et mergée sur master ; le travail consiste à l'itérer et à préparer le pilote terrain. Avant d'écrire la moindre ligne de code, tu dois :

1. **Lire ce document en entier.** Il contient toutes les conventions, contraintes et décisions architecturales. Ne réinvente rien qui est déjà décidé ici.
2. **Respecter les principes non négociables** (section 2). Ils priment sur toute considération de "code propre" ou de "best practice générique".
3. **Demander avant de t'écarter.** Si tu vois un cas non couvert, propose à Anzio plutôt que d'inventer.
4. **Rester dans le périmètre de la tâche en cours.** Les priorités et le backlog sont dans `ROADMAP.md` ; la vue produit/stratégie dans `APP_OVERVIEW.md`.
5. **Respecter le workflow de livraison (§6.6).** Le travail est commité et poussé sur `master`, et il est validé sur le VPS, jamais en local. Ne propose jamais un plan de test qui suppose un environnement local qui tourne.

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

| Code  | Nom                     | Public            | Device cible               | Caractéristique clé                                                |
| ----- | ----------------------- | ----------------- | -------------------------- | ------------------------------------------------------------------ |
| **A** | Player cinéma           | Spectateurs       | NUC + grand écran          | Affichage uniquement, plein écran, robuste à la perte de connexion |
| **B** | Mobile joueur           | Spectateurs       | Téléphone (web responsive) | Input principal, reconnexion transparente                          |
| **C** | Console projectionniste | Employé cinéma    | Tablette / PC en cabine    | Sobriété, scopée à un cinéma                                       |
| **D** | Super-admin             | Porteur du projet | Desktop                    | Multi-cinémas, monitoring NUCs, IA génération                      |

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

Chaque acteur sait se faire reconnaître après une coupure :

- Téléphone : `resume_token` (nanoid) remis au join, stocké en `localStorage` (`quiz_resume_token`, avec `quiz_player_id` et `quiz_session_id`).
- NUC : `nuc_uid` en `localStorage` + cookie httpOnly JWT NUC.
- Console : cookie de session du projectionniste + identifiant de la séance.

À chaque (re)connexion du socket :

1. Le client émet `player:resume { resumeToken, sessionId }`, `nuc:resume { nucUid, sessionId? }` ou `console:resume { sessionId }`.
2. Le serveur valide l'identité, rejoint les rooms (pour le téléphone : `session:<id>`, `session:<id>:players` et `player:<id>`) et, pour un joueur sorti de la partie en mémoire (départ au lobby), l'y remet (`onPlayerJoined` avec `rejoin: true`). Un joueur exclu reçoit `error { code: 'PLAYER_KICKED' }` et n'est pas réactivé.
3. Le serveur émet `session:state_snapshot` au seul socket demandeur : les champs de **plateforme** (séance, joueurs, classement, lots, audio, `joinToken` pour l'écran et la console, `joinedLate` pour le joueur) + `round` (même forme que `round:started`, ou null) + `gameView` (la vue courante du moteur pour ce destinataire, `round.snapshot(audience, playerId)`) + `gameSeq` (le `seq` de la dernière vue émise vers ce destinataire).
4. Le client remplace tout son état de jeu par `round` / `gameView` / `gameSeq`, puis ignore tout `game:state` de `seq <= gameSeq`. La reprise n'a aucun code propre à un moteur : c'est le protocole lui-même (règle 5, section 7.5).

Ce que voit le joueur selon le moment de la coupure (moteur quiz) :

- Question encore ouverte, pas encore répondu → il peut répondre (`me.answerId = null`, `me.locked = false`).
- Question close pendant la coupure → vue `reveal` avec son résultat (0 point s'il n'a pas répondu), puis la suite.
- Séance terminée → écran final avec le classement, ses lots, et la mention « Arrivé en cours de partie » s'il est arrivé après le lancement.
- Redémarrage du serveur : les séances `running` / `paused` sont réhydratées ; la question interrompue est close et notée avec les réponses déjà enregistrées, une séance en pause reste en pause.

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

### 4.7 Avatars joueurs

**Use case** : permettre aux spectateurs de s'identifier visuellement par un avatar, en plus de leur pseudo.

**Principes** :

- Le **super-admin** gère des **bibliothèques d'avatars** réutilisables (interface D). Chaque bibliothèque contient N avatars.
- Format des avatars : **PNG transparent, carré, 512x512** (haute résolution, source unique réutilisée partout, affichée plus petite selon le contexte). Rendu **visuellement rond** (CSS), le fichier reste carré. Normalisation/redimensionnement en 512x512 **côté serveur** à l'upload.
- À la création d'un quiz, dans l'onglet _Design_, le super-admin **coche ou non** "Autoriser les avatars". Si oui, il **choisit une bibliothèque** parmi celles existantes.
- Côté **mobile (B)** : si les avatars sont activés, le joueur choisit un avatar à la jonction (grille). Un avatar **aléatoire est pré-sélectionné** ; la sélection reste **optionnelle** (un avatar par défaut est assigné s'il ne choisit pas). **Les doublons sont autorisés** (plusieurs joueurs peuvent avoir le même avatar).
- Affichage de l'avatar **devant le pseudo** partout où un pseudo apparaît : écran cinéma (A : lobby, scores, résultats finaux), mobile (B), console projectionniste (C).
- Si les avatars sont désactivés sur la partie : comportement actuel inchangé (pas d'avatar).

### 4.8 Audio de l'écran cinéma

**Use case** : rythmer l'avant-séance par une bande-son (musiques de fond + effets ponctuels).

**Principes non négociables** :

- Le son sort **uniquement sur l'écran cinéma (interface A)**. Les téléphones des joueurs restent **toujours** silencieux.
- Toute cue est décrite par un **slot** du registre `AUDIO_SLOTS` (`packages/validation/src/audio.ts`), source de vérité unique partagée API / admin / player. Ajouter un son = ajouter une entrée dans ce registre puis le déclencher depuis les règles d'écran du moteur (`apps/player/games/<clé>/screen-rules.ts` : sons d'entrée d'une étape, son calé sur une échéance, son d'un cue), lues par le directeur audio du player ; le reste (DB, API, écran d'admin, résolution des URLs) est génarique et n'a pas à être touché.
- L'audio est **non bloquant par construction** : un son supprimé, introuvable ou refusé par le navigateur retombe sur le son intégré au player puis sur le silence. **Aucune session ne doit échouer à cause de l'audio.**
- Deux niveaux de stockage : des **bibliothèques de sons** réutilisables (interface D, menu _Audio_) et des **sons propres à un quiz** (onglet _Audio_ de l'éditeur), pour les cas non réutilisables.
- Le contenu réel des fichiers uploadés est vérifié par **lecture de la signature binaire** (`sniffAudioMime`), le MIME déclaré par le navigateur n'étant pas fiable.
- Slots musique (`lobbyMusic`, `gameMusic`, `scoresMusic`) : joués en boucle avec **fondu enchaîné** entre les phases. La case **« une seule musique, sans interruption »** fait jouer la piste du lobby du début à la fin, sans relance ni fondu.
- Slots SFX : `questionStart`, `answerReveal` (rejoué à chaque réponse qui apparaît, calé sur `ANSWER_REVEAL_STAGGER_MS`), `lastSeconds` (calé sur `TIMER_URGENT_THRESHOLD_SEC`, donc synchrone avec l'animation du timer), `questionEnd`, `playerAnswered`, `final`.
- Les volumes sont résolus **côté serveur** (volume du slot × volume général) et transmis au player en 0..1 : le player ne fait aucun calcul de mixage.
- Quand un joueur répond, l'écran affiche son **pseudo éphémère** (arrivée par le bas, court affichage, disparition) synchronisé avec le SFX `playerAnswered`. Le signal est le cue `player_answered` (`game:cue`, audience écran seulement, namespace `/player`) ; il ne contient **jamais** la réponse choisie.

---

## 5. MODÈLE DE DONNÉES (MySQL via Prisma)

### 5.1 Entités principales

```
cinemas
  id, slug, name, address, city, postal_code, country,
  contact_name, contact_email, contact_phone,
  status (active|paused|trial, défaut trial),
  background_music_url, logo_url,
  prizes_config (JSON), super_prize_config (JSON), staff_pin_hash,
  notes, created_at, updated_at, deleted_at (soft delete)

screens (salles d'un cinéma)
  id, cinema_id, name (ex: "Salle 1"), capacity,
  status (active|inactive|maintenance), created_at, updated_at

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
  cover_image_url,
  background_media_url, background_media_type (image|video),
  background_overlay_opacity,
  lobby_background_media_url, lobby_background_media_type (image|video),
  lobby_background_overlay_opacity,
  branding_json (couleurs custom, logo si sponsorisé),
  prizes_config (JSON),
  audio_config (JSON : enabled, continuousMusic, masterVolume,
                slots { <slotKey>: { soundId, volume } }),
  status (draft|published|archived),
  avatars_enabled (bool, défaut false),
  avatar_library_id (nullable, FK avatar_libraries),
  created_by_user_id, ai_generated (bool),
  created_at, updated_at

avatar_libraries (bibliothèques d'avatars prédéfinies par le super-admin)
  id, slug, name, description (nullable),
  is_active (bool), created_at, updated_at

avatars (avatars d'une bibliothèque, PNG transparent carré 512x512)
  id, library_id (FK avatar_libraries), image_url, image_key (clé storage),
  label (nullable), position (ordre d'affichage), created_at

sound_libraries (bibliothèques de sons réutilisables, gérées par le super-admin)
  id, slug, name, description (nullable),
  is_active (bool), created_at, updated_at

sounds (un son appartient soit à une bibliothèque, soit à un quiz — jamais aux deux)
  id, library_id (nullable, FK sound_libraries),
  quiz_id (nullable, FK quizzes),
  kind (music|sfx), audio_url, audio_key (clé storage),
  label, mime_type, size_bytes, position, created_at, updated_at

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
  current_question_started_at (nullable), current_question_paused_at (nullable),
  audio_muted (bool, défaut false),
  super_prize_template_id (nullable, FK prize_templates),
  started_at, ended_at,
  total_players, winner_player_id (nullable),
  created_at, updated_at

players (participant à une session, peut être anonyme)
  id, session_id, user_id (nullable si anonyme), pseudo,
  pseudo_source (SUGGESTED|CUSTOM, défaut CUSTOM),
  avatar_id (nullable, FK avatars ; assigné aléatoirement si avatars activés
             et que le joueur n'a pas choisi),
  resume_token (unique, pour reconnexion),
  joined_at, last_seen_at, status (active|disconnected|kicked),
  joined_question_position (nullable, pour le late-join),
  score_total, rank_final (nullable jusqu'à la fin),
  email_for_prize (nullable), email_consent_at (nullable)

player_answers
  id, player_id, question_id, chosen_answer_id (nullable),
  answered_at_server, time_to_answer_ms, points_awarded,
  is_correct (dénormalisé)

sponsors
  id, name, slug, logo_url, brand_color_primary, brand_color_secondary,
  contact_email, contract_terms, active,
  metadata (JSON), prizes_config (JSON), created_at, updated_at

prizes (lot attribué à un joueur en fin de session)
  id, session_id, player_id,
  redeem_code (unique, nanoid), signature (HMAC), short_code (unique),
  rank, is_consolation (bool, défaut false), label,
  type (discount_qr|video|other), payload_json,
  prize_template_id (nullable, FK prize_templates),
  expires_at (nullable), email_sent_at (nullable),
  redeemed_at (nullable), redeemed_via (nullable)
  -- unicité (player_id, session_id)

prize_templates (gabarits de lots par cinéma et/ou sponsor)
  id, cinema_id (nullable), sponsor_id (nullable),
  label, type (discount_qr|video|other), payload_json,
  validity_days (nullable), stock (nullable), stock_initial (nullable),
  is_active (bool, défaut true), created_at, updated_at

events_log
  id, session_id (nullable), nuc_id (nullable), cinema_id (nullable),
  level (info|warn|error|critical),
  event_type, payload_json, created_at

ai_generations (audit des générations IA)
  id, user_id, quiz_id (nullable),
  input_summary, input_full, output_json (JSON), error_details (JSON),
  model_used, tokens_input, tokens_output,
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
- **Sérialisation des IDs :** tout ID `BigInt` Prisma est converti en `string` avant toute réponse JSON d'API (jamais de `BigInt` brut sérialisé).

### 6.4 Gestion des erreurs

- Backend : classe `AppError` custom + middleware Express centralisé.
- Frontend : Error Boundaries React + Sentry.
- Codes d'erreur stables (ex: `SESSION_NOT_FOUND`, `PLAYER_ALREADY_ANSWERED`).

### 6.5 Tests

- Unitaires sur les services métier critiques (scoring, transitions de session, classement, reconnexion).
- Intégration sur les flux Socket.io critiques.
- Pas de course au coverage. Tester ce qui est risqué.
- Vitest partout.
- Les tests qui touchent la base ne tournent pas sur le poste de dev (pas de MySQL local) : ils sont validés par la CI et sur le VPS. Un test unitaire utile doit donc rester exécutable sans base.

### 6.6 Workflow de développement et de validation

**Branche unique : `master`.** Tant que le projet est mené par une seule personne, tout est commité et poussé directement sur `master`. Pas de branche de feature, pas de pull request : en cas de problème, on revient en arrière avec un `git revert` du commit fautif. Les commits doivent donc rester petits, cohérents et clairement nommés, parce que le commit est la seule unité de rollback.

**Aucun test en local.** Le porteur du projet change souvent de poste de travail : il n'y a ni base MySQL, ni environnement complet sur la machine de dev. La validation fonctionnelle se fait **uniquement sur le VPS**, après déploiement. Concrètement, pour toute IA travaillant sur le projet :

- Ne jamais conclure une tâche par « lance `pnpm dev` et teste » : ce n'est pas possible.
- Ce qui est vérifiable en local et doit l'être avant de pousser : `typecheck`, `lint`, `build`, et les tests unitaires sans base.
- Ce qui est vérifiable seulement sur le VPS : parcours complet, Socket.io, uploads, migrations, rendu NUC. La fin de tâche doit donc décrire **quoi regarder sur le VPS**, pas comment lancer le projet en local.

**Déploiement.** Un push sur `master` déclenche `.github/workflows/deploy.yml` : SSH sur le VPS, `pnpm install`, `db:generate`, `turbo build`, `db:migrate:deploy` puis `pm2 startOrReload`. Les migrations Prisma sont donc appliquées automatiquement — il ne faut jamais demander de les lancer à la main. Le déploiement peut aussi être rejoué sur une branche précise via `workflow_dispatch`.

---

## 7. CONVENTIONS SOCKET.IO

Le temps réel est séparé en deux couches : la **plateforme** (séance, lobby, joueurs, pause, classement final, lots, reprise) et le **moteur de jeu** (ce qui se passe pendant une manche : quiz aujourd'hui). Tous les moteurs parlent le **même protocole** (`round:*`, `game:*`) ; aucun événement n'est propre à un moteur. Ajouter un moteur ne touche ni aux handlers, ni aux stores, ni à la reprise : voir `docs/ajouter-un-moteur.md`.

### 7.1 Namespaces

- `/player` (écran cinéma / NUC, interface A) — audience `screen`
- `/mobile` (téléphones, interface B) — audience `mobile`
- `/console` (projectionnistes, interface C) — audience `console`
- `/admin` (super-admin, interface D)

### 7.2 Rooms

- `session:{sessionId}` : dans `/player`, `/mobile` et `/console`, tous les acteurs d'une séance. Les événements de plateforme et de manche « vers tous » partent dans cette room des trois namespaces.
- `session:{sessionId}:players` (`/mobile`), `session:{sessionId}:projectionist` (`/console`), `session:{sessionId}:nuc` (`/player`).
- `player:{playerId}` (`/mobile`) : un seul joueur. Rejointe à `player:join`, `player:resume` et `player:rejoin_room` ; c'est là que partent les vues mobiles par joueur.
- `screen:{screenId}` et `nuc:{nucId}` (`/player`, console et admin pour `screen:`) : création de séance, supervision.

### 7.3 Événements

Format `domaine:action` en snake_case. Schémas Zod dans `packages/validation/src/socket-events.ts` (plateforme et enveloppes de manche) et `packages/validation/src/games/<clé>.ts` (vues, actions et cues d'un moteur).

**Plateforme, serveur → clients**

| Événement                            | Vers                                              | Rôle                                                      |
| ------------------------------------ | ------------------------------------------------- | --------------------------------------------------------- |
| `screen:session_started`             | `/player` `screen:` et `nuc:`                     | une séance est créée sur la salle (porte `joinToken`)     |
| `session:started`                    | les 3                                             | lancement (`audio`, habillage)                            |
| `session:state_changed`              | les 3                                             | `{ oldState, newState }`                                  |
| `session:lobby_timer_update`         | les 3                                             | compte à rebours du lobby (seul tic restant, hors manche) |
| `session:paused` / `session:resumed` | les 3                                             | pause de la séance                                        |
| `session:audio_muted`                | les 3                                             | son de l'écran coupé / rétabli                            |
| `session:ended`                      | les 3                                             | classement final, gagnant, lots                           |
| `session:aborted`                    | les 3                                             | abandon                                                   |
| `session:state_snapshot`             | le socket demandeur                               | reprise (règle 5)                                         |
| `player:joined` / `player:left`      | les 3                                             | arrivées, départs, exclusions                             |
| `nuc:status_changed`                 | room `screen:` des 4 namespaces, `/player` `nuc:` | supervision des NUC                                       |
| `error`                              | le socket                                         | refus d'une commande (`{ code, message }`)                |

**Plateforme, clients → serveur** : `player:join` (accusé), `player:resume`, `player:rejoin_room` (accusé), `player:leave` sur `/mobile` ; `nuc:join_screen`, `nuc:join`, `nuc:resume` sur `/player` ; `console:join`, `console:resume`, `console:start`, `console:pause`, `console:unpause`, `console:force_advance`, `console:abort`, `console:toggle_mute` sur `/console` (routes REST équivalentes : `/start`, `/pause`, `/resume`, `/force-advance`, `/abort`, `/toggle-mute`) ; `admin:watch_cinema` sur `/admin`.

**Manche (tous les moteurs)**

| Événement       | Sens                                  | Payload                                                                                                           |
| --------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `round:started` | serveur → les 3                       | `roundInfoSchema` : `{ roundId, position, totalRounds, engineKey, game: { slug, title, kind, sponsor \| null } }` |
| `game:state`    | serveur → une audience (ou un joueur) | `{ roundId, engineKey, seq, serverNow, view }`                                                                    |
| `game:cue`      | serveur → une audience                | `{ roundId, cue, data? }`                                                                                         |
| `round:ended`   | serveur → les 3                       | `{ roundId, position, totalRounds, scoreboard: [{ playerId, pseudo, avatarUrl, scoreTotal, scoreThisRound }] }`   |
| `game:action`   | `/mobile` → serveur, avec accusé      | `{ roundId, type, payload }` → `{ ok: true, result }` ou `{ ok: false, code, message }`                           |

`game:action` : le joueur est celui du socket (jamais le payload), la manche doit être la manche active (`WRONG_ROUND`, `NO_ACTIVE_ROUND`), 20 actions par seconde et par socket au plus (`RATE_LIMITED`). Le moteur fait ses contrôles et sa réservation **avant tout `await`** (deux actions simultanées ne peuvent pas passer toutes les deux).

### 7.4 Schéma des payloads

Tout payload entrant est validé par Zod côté serveur ; tout payload de manche est validé côté client (`gameStateSchema`, `gameCueSchema`, `roundInfoSchema`, `roundEndedSchema`, puis le schéma de vue du moteur). Exemple, la vue écran du quiz en phase `question` :

```ts
{
  phase: 'question',
  questionIndex: 2,           // 0-based
  totalQuestions: 10,
  question: {
    id: '41', position: 3, text: 'Qui a réalisé « Alien » ?', imageUrl: null,
    timeLimitMs: 20000,
    answers: [{ id: '161', position: 'A', text: 'Ridley Scott' }, /* … */], // jamais isCorrect
  },
  endsAt: '2026-11-19T20:41:07.250Z', // ou null
  pausedRemainingMs: null,            // remplace endsAt pendant une pause
  answeredCount: 12,
  totalPlayers: 48,
}
```

### 7.5 Règles du protocole

1. **Une vue est complète.** Le client remplace sa vue, il ne fusionne jamais. Un client qui n'a reçu que le dernier `game:state` affiche exactement la même chose qu'un client qui les a tous reçus.
2. **`seq` croît strictement par manche et par destinataire** (l'écran, la console, chaque joueur). Le client ignore un `seq` inférieur ou égal au dernier appliqué.
3. **Le temps passe par des échéances, pas par des tics.** Une vue porte `endsAt` (ISO) ; l'enveloppe porte `serverNow`. Le client calcule son décalage d'horloge (médiane des derniers `serverNow`, `pushClockSample`) et anime localement (`useCountdown` de `@quiz-app/ui`). En pause, la vue porte `pausedRemainingMs` à la place de `endsAt`. Plus aucun événement de manche n'est émis chaque seconde.
4. **Un cue ne porte jamais d'état.** Le perdre ne change rien à ce qui est affiché une seconde plus tard. Tout ce qui se déduit d'un changement de vue (un son à l'ouverture d'une question, par exemple) est déclenché côté client depuis la vue, pas par un cue.
5. **La reprise est le protocole.** `session:state_snapshot` = champs de plateforme + `round` (même forme que `round:started`, ou null) + `gameView` (résultat de `round.snapshot(audience, playerId)`, ou null) + `gameSeq`. Aucun champ propre à un moteur au premier niveau.
6. **Le serveur reste la seule source de vérité** : score, temps, validité d'une action.
7. **Chaque moteur déclare ses vues et ses actions en Zod** dans `packages/validation/src/games/<clé>.ts`. Les clients valident `view` avec ce schéma ; une vue invalide (ou un moteur inconnu) déclenche le rendu de repli (`games/unknown-game.tsx`) et un message Sentry, jamais une erreur visible.

À retenir aussi : aucune vue ne contient une information que son destinataire ne doit pas voir (bonne réponse du quiz avant `reveal`, réponse d'un autre joueur). La console obtient les bonnes réponses par `GET /api/sessions/:id/full` (authentifié), jamais par le socket.

---

## 8. SÉCURITÉ

### 8.1 Sécurité applicative

- HTTPS partout, même en dev sur les flux Socket.io de prod.
- Secrets jamais committés. Variables d'env + GitHub Actions secrets.
- Rate limiting (express-rate-limit) sur join session, magic link, AI generation.
- Validation Zod systématique des payloads.
- CSP stricte.
- NUC ne fait JAMAIS d'appel hors backend de l'app.
- Audit régulier des dépendances.
- Auth mutuelle NUC ↔ serveur : clé d'auth générée à l'install, stockée localement.

### 8.2 Sécurité réseau et exposition de services

> **Ces règles viennent d'un incident réel (août 2026).** Une instance n8n installée sur le VPS de prod, exposée publiquement et sans authentification, a permis l'exécution de commandes arbitraires sur le serveur. La machine a été détournée pour émettre une attaque DDoS sortante, et l'hébergeur a coupé le VPS : les quatre interfaces sont tombées. L'application elle-même n'était pas en cause — c'est un service voisin, installé « pour tester », qui a ouvert la porte.

**1. Pare-feu actif sur tout serveur de prod.** `ufw` en `default deny incoming`, et uniquement les ports strictement nécessaires ouverts explicitement (typiquement 22, 80, 443). _Pourquoi :_ sans pare-feu, tout service qui écoute devient joignable depuis internet à la seconde où il démarre, souvent sans que personne l'ait décidé. Avant d'installer quoi que ce soit, la question à se poser est : « ce port doit-il vraiment être joignable depuis internet, ou seulement en local ? »

**2. Aucun outil d'administration exposé publiquement sans authentification forte.** Cela vaut pour n8n, phpMyAdmin, les dashboards de monitoring, les interfaces internes. Par défaut on binde sur `127.0.0.1` et on y accède par tunnel SSH (`ssh -L 5678:127.0.0.1:5678 user@serveur`). L'exposition publique n'est acceptable qu'avec une authentification robuste devant (`auth_basic` nginx, OAuth, VPN). _Pourquoi :_ ces outils sont conçus pour exécuter des actions privilégiées ; un accès anonyme à l'un d'eux équivaut à un shell root.

**3. Docker : toujours préfixer les bindings de port par `127.0.0.1`** quand le service ne doit pas être public — `-p 127.0.0.1:3001:3000` et non `-p 3001:3000`. _Pourquoi :_ la forme courte binde sur `0.0.0.0`, et Docker écrit ses propres règles directement dans `iptables`, en amont de `ufw` : un conteneur peut donc être exposé à internet alors que `ufw status` affiche le port comme fermé.

**4. Un service installé « pour tester vite fait » doit être retiré tout de suite après le test**, ou sécurisé et documenté comme les autres. _Pourquoi :_ c'est exactement le scénario de l'incident. Un service temporaire ne fait l'objet d'aucune mise à jour et disparaît de la mémoire, mais reste exposé indéfiniment.

**5. Vérification périodique de la surface exposée.** Deux commandes suffisent :

```bash
sudo ss -tlnp            # tout ce qui écoute, et quel process
sudo ufw status verbose   # règles de filtrage réellement actives
```

Tout port en `LISTEN` sur `0.0.0.0` ou `*` sans règle `ufw` correspondant précisément à un besoin identifié doit être questionné, puis rebindé sur `127.0.0.1` ou fermé.

**6. Signal d'alerte à connaître.** Si l'hébergeur place le VPS en _rescue mode_ avec un mail mentionnant du trafic sortant anormal (amplification DNS, NTP, memcached, DDoS), la cause la plus probable est un service exposé sans authentification et détourné pour attaquer un tiers — **pas** une intrusion par mot de passe SSH. Il faut donc inspecter en priorité les services exposés et les interfaces d'administration, avant de perdre du temps dans les logs d'authentification SSH.

### 8.3 Réponse à une compromission du serveur

Un accès non autorisé au VPS donne accès au `.env` de prod. Tous les secrets qu'il contient sont alors à considérer comme divulgués, **y compris après reconstruction de la machine** : le déploiement réinjecte les mêmes valeurs depuis les secrets GitHub. La remise en service n'est donc pas terminée tant que la rotation n'est pas faite.

Ordre de rotation, du plus grave au moins grave :

1. `JWT_SECRET` et `SESSION_SECRET` — permettent de forger une session super-admin sans mot de passe.
2. `PRIZE_HMAC_SECRET` — permet de fabriquer des liens de récupération de lots valides.
3. `DATABASE_URL` — contient le mot de passe MySQL (changer aussi le mot de passe côté base).
4. `SMTP_PASS` — permet d'envoyer du mail depuis le domaine, avec le risque de réputation associé.
5. `ANTHROPIC_API_KEY` — clé facturable.
6. `HEALTH_CHECK_TOKEN` et les DSN Sentry.

À contrôler en plus de la rotation : la table `users` (comptes ajoutés ou rôles modifiés), le dossier d'uploads (servi en statique par Express, donc tout fichier déposé y est public), et l'état RGPD — la base contient des données personnelles (emails de gagnants, pseudos), ce qui peut déclencher une obligation de notification à la CNIL sous 72 h en cas de fuite confirmée (cf. §9).

---

## 9. RGPD

### 9.1 Données collectées et conservation

- **Joueur anonyme** : pseudo, réponses, score. Conservation : 30 jours après fin de session.
- **Joueur inscrit** : email, pseudo, historique. Conservation : tant que le compte existe.
- **Joueur gagnant non inscrit** : email pour envoi du lot. Conservation : 90 jours (règle inchangée pour l'email de lot sans case facultative cochée).
- **Contact consenti** (C5) : email d'un joueur ayant coché, sous le formulaire de lot, au moins une case facultative décochée par défaut (actus et jeux de Shh!, offres du cinéma, offres du sponsor), avec le périmètre, la date, la séance et la version du libellé (`contacts`, `contact_consents`). Conservation : jusqu'au retrait du consentement. Le lien de désinscription des emails révoque tous les consentements du contact ; un contact désinscrit ne sort plus dans aucun export.
- **Projectionnistes / admins** : email, nom, cinéma. Conservation : pendant la relation contractuelle.
- **NUCs** : pas de donnée personnelle.

Les emails consentis ne sont transmis à un cinéma ou à un sponsor qu'avec un accord de partage enregistré avec lui (fiche cinéma, campagne du sponsor) ET la case correspondante cochée par le joueur. Les exports sont réservés au super-admin et journalisés (`contacts.exported`) ; aucun rôle cinéma ou sponsor n'a de route donnant un email de joueur. Aucun email marketing n'est envoyé par la plateforme.

### 9.2 Obligations

- Politique de confidentialité accessible.
- Mentions légales du cinéma + de la plateforme.
- Bouton "Supprimer mon compte" fonctionnel (B).
- Registre des traitements à tenir.

### 9.3 Mineurs

**Option A pour le pilote** : exclusion. Majeurs uniquement, mention claire avant saisie pseudo. À réévaluer après 3 mois.

---

## 10. CYCLE DE VIE D'UNE SESSION

Une session (séance) est une suite de **manches** (`session_rounds`, positions 1..N), chacune jouée par un **moteur** (`games.engine_key`, aujourd'hui `quiz`). La plateforme (`api/src/modules/sessions/session-runtime.service.ts`) tient la séance ; le moteur (`api/src/modules/games/engines/<clé>/`) tient la manche, à travers l'interface `RoundContext` / `GameRound` (`api/src/modules/games/engine.types.ts`). Pour l'instant une séance n'a qu'une manche (le quiz de la séance) ; l'enchaînement de plusieurs manches arrive avec B5, au point d'extension `advanceOrEnd`.

```
[CRÉATION]
  Console (C) : « lance le quiz X dans la salle Y » (POST /api/sessions)
  → droits vérifiés (tenant-scope), session state = 'lobby', code court 4 chiffres + joinToken (QR)
  → manche 1 créée (session_rounds, jeu du quiz) ; créée à la volée au lancement si elle manque
  → screen:session_started vers l'écran de la salle

[LOBBY]  (plateforme)
  Écran : QR + code ; téléphones : player:join { sessionSlugShort | joinToken, pseudo }
  → joueur créé, resume_token renvoyé (stocké en localStorage), rooms session: et player:
  → player:joined vers les 3 ; session:lobby_timer_update si le lancement auto est armé
  Lancement : console:start / POST /start, ou seuil de joueurs + compte à rebours du lobby

[RUNNING — manche active]
  Plateforme : state = 'running', session:started, session:state_changed
  Pour la manche : RoundContext construit, engine.createRound(ctx, game)
    → round:started (roundInfo) vers les 3, puis round.start()
  Le moteur émet ses vues (game:state, par audience ou par joueur) et ses cues (game:cue).
  Quiz : countdown → pour chaque question : question → reveal → … → done
    - question : vue sans la bonne réponse, endsAt = échéance ; les mobiles agissent par
      game:action { type: 'answer', payload: { questionId, answerId } }, accusé immédiat
    - contrôles synchrones (séance en pause, question close, mauvaise question, joueur absent,
      retardataire bloqué, réponse invalide, déjà répondu) puis upsert player_answers
    - clôture à l'échéance (+ 500 ms de tolérance) ou par console:force_advance
    - notation : correct → max(round(points_max × tempsRestant / tempsTotal), points_floor),
      sinon 0 (défauts 1000 / 500) ; ctx.award → ScoreEvent + Player.scoreTotal (transaction)
    - reveal : bonne réponse, explication, classement (écran : 5 premiers, console : complet,
      mobile : son résultat), endsAt = début de la question suivante
  Retardataire : player:join en cours de manche → onPlayerJoined ; le quiz le bloque sur la
    question en cours (me.locked), il joue à partir de la suivante (players.joined_question_position)
  Fin de manche : le moteur appelle ctx.finish() (une seule fois)
    → state_json écrit, manche 'ended', round:ended (classement de la manche) vers les 3
    → advanceOrEnd(sessionId) : aujourd'hui termine toujours la séance (B5 : manche suivante)

[PAUSED]  (plateforme)
  console:pause → state = 'paused', session:paused, round.pause()
    → les vues portent pausedRemainingMs au lieu de endsAt, les actions sont refusées
  console:unpause → state = 'running', session:resumed, round.resume() (échéances recalculées)

[RECONNEXION]
  player:resume / nuc:resume / console:resume → session:state_snapshot
    = champs de plateforme + round + gameView (round.snapshot) + gameSeq (voir 3.4 et 7.5)

[REDÉMARRAGE SERVEUR]
  rehydrateRunningSessions() : chaque séance running/paused est rechargée ; sa manche
  'running' est recréée avec restore = session_rounds.state_json.engine. Quiz : la question
  interrompue est close et notée avec les réponses enregistrées, puis la suite s'enchaîne ;
  une séance en pause reste en pause. Une séance dont la manche est déjà 'ended' est terminée.

[ENDED]  (plateforme)
  Classement final (Player.scoreTotal), rang final, gagnant, lots résolus
  → session:ended vers les 3, session:state_changed ; emails des lots (async)

[ABORTED]  (plateforme)
  console:abort → manche disposée, state = 'aborted', session:aborted vers les 3
```

**`session_rounds.state_json`** = `{ platform: { participants: string[] }, engine: <état du moteur> }`. La partie `platform` (joueurs dont au moins une action a été acceptée) est tenue par la plateforme ; la partie `engine` est écrite par `ctx.persistState` et relue à la réhydratation. Le moteur ne lit ni n'écrit `sessions` ou `players` : l'étape courante passe par `ctx.reportProgress` (miroir dans `sessions.current_question_position`).

**Invariants :**

- `lobby` → `running` ou `aborted` uniquement.
- `running` → `paused`, `ended` ou `aborted` uniquement.
- `paused` → `running` ou `aborted` (`SESSION_TRANSITIONS`) ; seule exception, la fin de partie décidée par le jeu reste possible depuis une pause (dernière question close de force ou reprise serveur d'une séance en pause).
- `ended` et `aborted` sont terminaux.
- Une manche est démarrée une seule fois ; `finish()` est appelé une seule fois (un second appel est ignoré).
- Quiz : une question est diffusée une seule fois par séance ; un joueur répond une seule fois par question.
- Un NUC actif sur une seule session à la fois.

---

## 11. ROADMAP

La réécriture v2 (PR1 → PR10) est livrée et mergée sur master ; son historique détaillé est archivé dans `docs/archive/`.

Les priorités, le backlog produit, les questions ouvertes business et la dette technique sont désormais suivis dans **`ROADMAP.md`** à la racine (source d'autorité pour ce qui reste à faire).

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
- **Domaine :** shh.show (mobile/spectateur), api.shh.show (API + Socket.IO), screen.shh.show (player ciné), console.shh.show (projectionniste), admin.shh.show (super admin)

---

## ANNEXE A — Comment utiliser ce document avec une IA

**En début de session Cursor / Claude Code :**

```
Lis intégralement PROJECT_REFERENCE.md (référence technique), APP_OVERVIEW.md (produit) et ROADMAP.md (priorités) à la racine du projet.
PROJECT_REFERENCE.md fait autorité sur l'architecture et les conventions.
Tu DOIS respecter les principes non négociables (section 2 du REFERENCE) et les conventions (section 6).
Reste dans le périmètre de la tâche en cours ; note les idées hors périmètre dans ROADMAP.md (section Backlog).
Si tu vois un cas que les docs ne couvrent pas, demande à Anzio avant d'inventer.
```

**Pour une tâche spécifique :**

```
Tâche : [description précise]
Module concerné : [cinemas / quizzes / sessions / etc.]
Sections pertinentes du PROJECT_REFERENCE : [N, M, ...]
Contraintes additionnelles : [s'il y en a]
```

---

_Fin du document._
