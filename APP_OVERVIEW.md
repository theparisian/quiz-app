# Quiz App Cinéma — Dossier de présentation complet

> **But de ce document :** présenter l'application dans son ensemble, fonctionnellement et techniquement, de façon autoportante. Conçu pour servir de contexte unique à une discussion stratégique (produit, business, fonctionnel) sans avoir à lire le reste du repo.
>
> **État au moment de la rédaction :** réécriture v2 from-scratch quasi terminée (PR1 → PR9 livrées). Le code legacy v1 reste présent à la racine pour référence mais est destiné à l'archivage.
>
> **Porteur :** Anzio · **Repo :** github.com/theparisian/quiz-app · **Domaine actuel :** shh.show

---

## 1. Le produit en une phrase

Une plateforme **multi-cinéma** de quizz interactifs joués **en direct** par le public d'une salle de cinéma, affichés sur le grand écran pendant l'attente avant la séance, avec interaction live via les téléphones des spectateurs (modèle type Kahoot, mais en salle).

---

## 2. L'expérience, du point de vue du spectateur

1. Le public entre en salle et attend la séance.
2. Sur l'écran de cinéma : un **QR code** s'affiche, invitant à rejoindre le quizz.
3. Les spectateurs scannent le QR, arrivent sur une web app mobile, entrent un **pseudo** (aucun compte requis).
4. Les pseudos apparaissent en temps réel dans un **lobby** sur le grand écran.
5. Le projectionniste (ou un seuil de joueurs) lance la partie.
6. Chaque question s'affiche sur l'écran ; les joueurs répondent sur leur téléphone (4 choix, 1 bonne réponse).
7. **Scoring temps réel** basé sur justesse + rapidité.
8. À la fin : podium et classement sur le grand écran, gagnant désigné.
9. Le **top 3** peut laisser son email pour recevoir un **lot** (ex : QR code de réduction confiserie) — sans créer de compte.
10. Option (rare) : terminer sur un spot vidéo sponsorisé.

---

## 3. Acteurs et modèle économique

| Acteur                            | Rôle                                                         | Monétisation                                                                     |
| --------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Spectateurs**                   | Utilisateurs finaux, jouent depuis leur téléphone            | Gratuit, anonyme par défaut                                                      |
| **Cinéma exploitant**             | Héberge l'expérience en salle                                | **Modèle de facturation pas encore tranché** (point de décision business majeur) |
| **Sponsors / annonceurs** (futur) | Paient pour diffuser un quizz brandé sur un réseau de salles | Piste de revenus principale envisagée                                            |
| **Super-admin (Anzio)**           | Gère cinémas, quizz sponsorisés, supervise la plateforme     | —                                                                                |

**Périmètre MVP pilote :** 1 cinéma indépendant en pilote, mais l'architecture supporte le multi-cinéma + multi-salles dès le départ.

**Hors périmètre actuel (assumé) :** self-service annonceurs, marketplace, multi-langues, app mobile native, paiement Stripe, analytics avancés.

---

## 4. Les 4 interfaces

L'application est composée de 4 frontends distincts, chacun pour un public et un device différents.

| Code  | Nom                                          | Public            | Device                           | Caractéristique clé                                   |
| ----- | -------------------------------------------- | ----------------- | -------------------------------- | ----------------------------------------------------- |
| **A** | **Player cinéma** (`apps/player`)            | Spectateurs       | NUC + grand écran, plein écran   | Affichage uniquement, robuste à la perte de connexion |
| **B** | **Mobile joueur** (`apps/mobile`)            | Spectateurs       | Téléphone (web responsive / PWA) | Input principal, reconnexion transparente             |
| **C** | **Console projectionniste** (`apps/console`) | Employé cinéma    | Tablette / PC en cabine          | Sobriété, scopée à un cinéma                          |
| **D** | **Super-admin** (`apps/admin`)               | Porteur du projet | Desktop                          | Multi-cinémas, monitoring, génération IA              |

### Modèle multi-tenant : Cinéma → Salle → NUC

```
Cinéma (ex: Le Quai)
  ├── Salle 1 (capacité 200) → NUC #abc-123 (online)
  ├── Salle 2 (capacité 80)  → NUC #def-456 (offline)
  └── Salle 3 (pas encore équipée)
```

- Un **NUC** (mini-PC en cabine) est rattaché à exactement une salle.
- Une **salle** appartient à exactement un cinéma.
- Une **session** est créée pour une salle. Une seule session active par salle à un instant T.
- Plusieurs sessions peuvent tourner en parallèle dans plusieurs cinémas/salles.
- **Isolation stricte** entre cinémas : aucun état global serveur, tout est scopé.

---

## 5. Principes non négociables (ADN du produit)

Ces principes priment sur toute considération de "code propre" générique. Ils sont au cœur de l'identité produit.

1. **Robustesse > tout.** Jamais d'erreur visible au public en salle. Pas de page blanche, pas de spinner infini, pas de stack trace. Fallback gracieux systématique.
2. **Recovery automatique.** Reconnexion WebSocket avec backoff exponentiel. Le joueur, le NUC et la console retrouvent leur état après coupure/refresh.
3. **Observabilité avant features.** On doit pouvoir savoir si une feature marche en prod avant d'en ajouter une autre (logs JSON, dashboard santé, Sentry, heartbeat NUC).
4. **Le projectionniste ne doit pas être interrompu.** Console "boring" par défaut, puissante en cas de besoin.
5. **Cloud-only au stade actuel.** Pas de broker local sur le NUC ; tout passe par le serveur.
6. **Source de vérité = serveur.** Scoring, état de session, timing : le serveur décide, les clients rendent.
7. **Persistance complète des sessions live.** Tout est persisté en DB en plus de la mémoire. En cas de crash serveur, l'état est reconstructible. Pas de perte.
8. **Multi-tenant dès le départ.** Toute requête/event scopée à `cinemaId` + `screenId` ou `sessionId`.
9. **RGPD by design.** Minimum de données (pseudo seul par défaut), email uniquement si nécessaire, hébergement UE.

---

## 6. Architecture technique

### 6.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND (VPS UE)                        │
│  Node.js + Express + Socket.io + MySQL + Prisma             │
│  - REST API (CRUD, auth, génération IA de quizz)            │
│  - WebSocket gateway (sessions live multi-tenant)          │
│  - Service emails (Nodemailer + SMTP)                       │
│  - Intégration Claude (génération de quizz)                │
└──────────┬──────────────┬──────────────┬─────────┬──────────┘
           │              │              │         │
    ┌──────▼──────┐ ┌────▼─────┐  ┌────▼──────┐  ┌─▼────────┐
    │ A. Player   │ │ B. Mobile │  │ C. Console │  │ D. Super │
    │ (NUC)       │ │ (joueurs) │  │ (projecto) │  │  admin   │
    └─────────────┘ └───────────┘  └────────────┘  └──────────┘
```

### 6.2 Stack

**Monorepo :** Turborepo + pnpm workspaces.

| Couche            | Technologies                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**      | Next.js 15 (App Router), React 19, Tailwind CSS 3, Zustand (state local), TanStack Query (cache serveur), socket.io-client                                     |
| **Backend**       | Node.js 20+, Express 4, Socket.io 4, Prisma (ORM), MySQL 8+                                                                                                    |
| **Validation**    | Zod 3, schémas partagés front/back (`packages/validation`)                                                                                                     |
| **Auth**          | JWT (jose, HS256, cookies httpOnly 30j), magic link par email, bcrypt (comptes locaux + auth NUC), OAuth Google/Apple (scaffolding prêt, désactivable par env) |
| **Email**         | Nodemailer + SMTP (OVH cible), templates HTML, fallback console JSON en dev                                                                                    |
| **IA**            | API Anthropic (Claude) via `@anthropic-ai/sdk`, tool `submit_quiz` à schéma JSON strict, client mock pour tests                                                |
| **Observabilité** | Pino (logs JSON), Sentry (API + 4 apps), table `events_log`, alertes email sur niveau `critical`                                                               |
| **Qualité**       | TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint, Prettier, Husky + lint-staged, Vitest                                    |
| **Infra**         | VPS UE (OVH/Hetzner), Nginx + Let's Encrypt, PM2, CI/CD GitHub Actions (SSH + PM2), uploads sur disque VPS (migration S3/Scaleway prévue)                      |

### 6.3 Structure du monorepo

```
apps/
├── player/        → Interface A (NUC)          → port 3001
├── mobile/        → Interface B (joueur)        → port 3002
├── console/       → Interface C (projectionniste)→ port 3003
└── admin/         → Interface D (super-admin)    → port 3004

packages/
├── ui/            → Composants React partagés
├── socket-client/ → hook useSocket() + types events
├── types/         → Types TS partagés
├── validation/    → Schémas Zod partagés (REST + Socket.io)
├── design-tokens/ → Tailwind preset, couleurs réponses, polices
└── observability/ → Sanitization PII pour Sentry

api/               → Backend Express + Socket.io + Prisma
├── src/modules/   → cinemas, screens, nucs, users, auth, invitations,
│                    quizzes, sponsors, ai, sessions, players, prizes
├── src/shared/    → db, sockets, email, logger, errors, auth, scoring,
│                    storage, upload, ai, moderation, events, nuc-monitor, sentry
└── prisma/        → schema.prisma + migrations
```

### 6.4 Le NUC (player cinéma)

- **Hardware :** Intel NUC, Ubuntu LTS minimal, Chromium en mode `--kiosk`.
- **Identité :** chaque NUC a un `nuc_uid` unique + une `auth_key` (générés à la création côté super-admin, auth_key affichée une seule fois, hashée bcrypt en DB).
- **Provisionnement :** premier boot → URL `…/provision?nuc_uid=&auth_key=` → `POST /api/nucs/auth` → cookie httpOnly JWT NUC (30j) + localStorage → boots suivants directement sur `/screen`.
- **Heartbeat :** toutes les 30s ; le serveur passe un NUC `offline` après 90s sans signe de vie (moniteur dédié + event `nuc:status_changed`).
- **Fail-safe :** systemd relance Chromium s'il crashe (watchdog + timer de redémarrage à 04:00). Script de provisioning bash fourni (`scripts/nuc/`).
- **Recovery applicatif :** page `/error` et `global-error` avec branding cinéma et rechargement auto ~30s ; backoff Socket.io (jusqu'à 45s, tentatives infinies).

---

## 7. Modèle de données (MySQL via Prisma)

Entités principales (toutes en BigInt auto-increment, IDs externes exposés via slug/nanoid) :

| Entité           | Rôle                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cinemas`        | Exploitants. Statut (active/paused/trial), branding (logo, musique de fond), `prizesConfig` (JSON), soft delete                                             |
| `screens`        | Salles d'un cinéma (capacité, statut)                                                                                                                       |
| `nucs`           | Devices physiques (nuc_uid, auth_key_hash, heartbeat, statut online/offline/error/provisioning)                                                             |
| `users`          | Joueurs inscrits + projectionnistes + cinema_admins + super_admin. Rôles, magic link, OAuth, soft delete RGPD                                               |
| `invitations`    | Invitations projectionniste/cinema_admin par email (token, expiry, statut)                                                                                  |
| `quizzes`        | Gabarits réutilisables. Type (standard/sponsored/custom), branding, média de fond (image/vidéo + overlay), statut (draft/published/archived), `aiGenerated` |
| `questions`      | Position, texte, image, time limit, points max/floor, explication                                                                                           |
| `answers`        | 4 choix par question (position A/B/C/D, is_correct)                                                                                                         |
| `sponsors`       | Marques (logo, couleurs, contrat, `prizesConfig`)                                                                                                           |
| `sessions`       | Instance d'un quizz dans une salle. Machine à états (lobby/running/paused/ended/aborted), code court 4 chiffres, timing question, audio muted, gagnant      |
| `players`        | Participant (anonyme possible), pseudo, `resume_token`, score, rang final, email lot                                                                        |
| `player_answers` | Réponses (réponse choisie, temps, points, correct) — unicité (player, question)                                                                             |
| `prizes`         | Lots gagnants : `redeem_code` (nanoid), `signature` HMAC, rang, label, type (discount_qr/video/other), suivi email/redemption                               |
| `events_log`     | Journal applicatif (niveau info/warn/error/critical, type, payload)                                                                                         |
| `ai_generations` | Audit des générations IA (input, output, tokens, coût estimé €, statut)                                                                                     |

**Conventions :** soft delete sur `users`/`cinemas` uniquement ; pas de mot de passe pour les joueurs (magic link + OAuth) ; index sur `slug_short`, `resume_token`, `nuc_uid`, FKs, `events_log(event_type, created_at)`.

---

## 8. Cycle de vie d'une session live

```
[CRÉATION]   Console demande "lance le quiz X dans la salle Y"
             → serveur valide droits → crée session (state=lobby) → code court (ex: 4271)
             → notifie NUC, console, admin

[LOBBY]      NUC affiche QR (URL mobile = …/?s=4271)
             Téléphones rejoignent (pseudo) → serveur génère resume_token → stocké localStorage
             Pseudos en temps réel sur NUC + console
             Sur seuil OU action manuelle → session:start → state=running

[RUNNING]    (boucle par question)
             Serveur diffuse la question (NUC + tous les mobiles), démarre le timer serveur
             Mobile envoie sa réponse → serveur valide (session running, question active,
               pas de double réponse, réponse appartient à la question)
             Scoring serveur : correct → max(round(points_max × timeLeft/totalTime), points_floor)
               ; incorrect ou absent → 0. Défauts : points_max=1000, points_floor=500
             Persistance immédiate (upsert) pour résilience, finalisation à la fin de question
             Timer expiré OU tous ont répondu → résultats question → pause (explication)
               → question suivante OU fin

[RECONNEXION] Acteur revient après coupure → émet resume avec son token
             → serveur renvoie un state_snapshot (état session, question en cours, score, timer restant)
             → l'UI reprend sans interruption visible

[ENDED]      Classement final, gagnant désigné, podium diffusé
             Top 3 peut saisir son email → génération du lot (QR signé) → envoi email async

[ABORTED]    Abandon manuel (console) OU erreur fatale → notification gracieuse + fallback NUC
```

**Invariants :** transitions strictes (lobby→running/aborted, running→paused/ended/aborted, paused→running/aborted, ended/aborted terminaux) ; une question diffusée 1 seule fois ; un joueur répond 1 seule fois par question ; un NUC actif sur 1 seule session.

**Résilience :** au redémarrage serveur, les sessions running/paused sont réhydratées depuis la DB (réponses persistées en cours de question via upsert, finalisation cohérente en fin de question).

---

## 9. Fonctionnalités par interface (état réel implémenté)

### A — Player NUC (`apps/player`)

États : `idle` (logo cinéma, horloge, musique), `lobby` (QR + code + pseudos en cascade), `question` (texte, image/vidéo de fond optionnelle, 4 cartes couleur, timer 60fps), `question_results` (bonne réponse en glow, top 5), `final_results` (podium animé top 3 + top 10, retour idle après 60s), `paused` (overlay), `aborted`. Animations CSS only. Audio (musique de fond + sons système, mute pilotable).

### B — Mobile joueur (`apps/mobile`)

Pages : saisie code 4 chiffres (auto-join via `?s=CODE`), saisie pseudo (validation longueur + bad-words), gameplay. États : lobby, question active (4 boutons colorés A/B/C/D, mini timer), attente des autres, résultat (correct/incorrect/trop tard + points + rang), pause, final (top 3 → formulaire email lot ; sinon rang + merci), aborted. Reconnexion (bannière + resume). PWA (manifest standalone).

### C — Console projectionniste (`apps/console`)

Login magic link, dashboard des salles du cinéma, création de session (quiz picker), console live (lobby, header question X/N + compteur joueurs + toggle audio, preview question, timer interpolé, contrôles pause/resume/force-end/abort, liste joueurs, podium fin, modale de confirmation abort). Reconnexion via `console:resume`. Design sobre desktop-first. Scopée au cinéma de l'utilisateur.

### D — Super-admin (`apps/admin`)

Login magic link, gestion cinémas/salles/NUCs (CRUD + affichage nuc_uid/auth_key), invitations (projectionniste/cinema_admin), éditeur de quizz complet (questions, réponses, timer, explication, branding, média de fond, preview, publish/archive/duplicate), gestion sponsors, **génération IA** (modal : texte source + images + paramètres → quizz éditable), page d'usage IA (coûts/tokens), gestion des lots (config par cinéma/sponsor, historique), **dashboard de santé** (NUCs online/offline, sessions actives, erreurs récentes, stats du jour, polling ~30s).

---

## 10. Génération IA de quizz

- **Use case :** Anzio veut créer un quizz sur un film/série/marque → colle un texte (synopsis…) et/ou des images → l'IA génère un quizz **éditable** dans l'éditeur.
- **Technique :** appel **backend uniquement** (clé jamais exposée), Claude avec tool `submit_quiz` à schéma JSON strict (Zod), timeout 60s, support vision (URL/base64).
- **Garde-fous :** rate limit (par défaut configurable, fenêtre 1h), audit DB complet (input, output, tokens, coût estimé en €), sanitization des images hors liste autorisée, fallback création manuelle toujours possible, messages d'erreur clairs sans détails techniques.
- **Coût :** estimation USD/MTok convertie en € (à revalider selon grille Anthropic en prod).

---

## 11. Lots et email transactionnel

- **Flux :** fin de partie → top 3 saisit son email → génération `Prize` (redeem_code nanoid + signature HMAC SHA-256) → email HTML avec QR code (data URL) → suivi `email_sent_at`.
- **Configuration des lots :** par cinéma (`prizesConfig`) avec override sponsor → fallback cinéma, 3 rangs configurables.
- **Redemption :** `POST /api/prizes/redeem/:redeemCode` (body signature), double validation refusée (409). Page de désinscription publique (`/unsubscribe`).
- **Anti-fraude :** signature HMAC vérifiée via `timingSafeEqual`.
- **Env requis en prod :** `PRIZE_HMAC_SECRET` (≥32 car.), `PRIZE_REDEEM_BASE_URL`, `PRIZE_UNSUBSCRIBE_BASE_URL`, SMTP complet.

---

## 12. Sécurité & RGPD

**Sécurité :** HTTPS partout, secrets en variables d'env / GitHub Secrets (jamais committés), validation Zod systématique des payloads, rate limiting (join, magic link, IA), auth mutuelle NUC↔serveur, NUC ne fait aucun appel hors backend, sanitization PII pour Sentry (durcie sur les URLs : auth_key, nuc_uid, resume_token, tokens).

**RGPD :**

| Donnée                                   | Conservation                      |
| ---------------------------------------- | --------------------------------- |
| Joueur anonyme (pseudo, réponses, score) | 30 jours après fin de session     |
| Joueur inscrit (email, historique)       | Tant que le compte existe         |
| Gagnant non inscrit (email lot)          | 90 jours                          |
| Projectionnistes/admins                  | Pendant la relation contractuelle |
| NUCs                                     | Pas de donnée personnelle         |

Soft delete + anonymisation email pour suppression de compte. **Mineurs :** option pilote = exclusion (majeurs uniquement), à réévaluer après 3 mois.

---

## 13. État d'avancement (réécriture v2)

Le plan de migration découpait le travail en 9 PRs. **Toutes sont livrées** (PR1 → PR9). Le projet est fonctionnellement complet sur le périmètre MVP.

| PR          | Périmètre                                                       | Statut |
| ----------- | --------------------------------------------------------------- | ------ |
| PR1         | Fondations monorepo (4 apps + packages + backend + Prisma + CI) | ✅     |
| PR2         | Auth (magic link, JWT, invitations) + cinémas/salles/NUCs       | ✅     |
| PR3         | Création/gestion de quizz + sponsors + uploads                  | ✅     |
| PR4         | Génération IA de quizz (Claude) + audit                         | ✅     |
| PR5 (a/b/c) | Sessions live (backend + console + NUC + mobile)                | ✅     |
| PR6         | Reconnexion, résilience, réhydratation, monitoring NUC          | ✅     |
| PR7         | Lots par email, QR signé, redemption API                        | ✅     |
| PR8         | Observabilité (Pino, Sentry, events_log, dashboard, alertes)    | ✅     |
| PR9         | Préparation pilote (script provisioning NUC, runbook, recovery) | ✅     |

**Reste à faire avant pilote terrain réel :**

- Tests bout-en-bout en conditions réelles (envoi email SMTP réel + scan QR téléphone, scénario résilience crash serveur) — partiellement à rejouer manuellement.
- Provisionnement d'un NUC physique réel + installation chez le cinéma pilote.
- Compléter les `[À COMPLÉTER]` : cinéma pilote, URL/instance d'hébergement prod, contacts du runbook.
- Configuration des secrets prod (SMTP, Sentry DSN, PRIZE_HMAC_SECRET, etc.).

**Dette technique connue (notée, non bloquante) :**

- Route REST `POST /api/players/join` doublonne le chemin socket `player:join` (conservée pour les tests).
- Les apps mobile/console/player ont chacune un `lib/socket.ts` local au lieu d'utiliser `packages/socket-client` (factorisation à planifier).
- Backoff Socket.io explicite seulement sur le player (à propager mobile/console).
- Pas de cleanup auto des fichiers `ai-input` orphelins.

---

## 14. Décisions ouvertes & axes de réflexion stratégique

Ces points ne sont **pas tranchés** et sont les plus utiles à challenger d'un point de vue produit/business :

### Business

- **Modèle de facturation cinéma** : abonnement mensuel ? au nombre de séances ? freemium + commission sur lots ? Non décidé.
- **Monétisation sponsors** : c'est la piste de revenu principale envisagée mais le go-to-market (acquisition annonceurs, pricing, réseau de salles) est entièrement à construire.
- **Proposition de valeur pour le cinéma** : engagement public, données d'audience, upsell confiserie via les lots, image moderne ? Quel est l'argument qui déclenche l'achat ?

### Produit

- **Acquisition de joueurs en salle** : taux de scan du QR, friction du pseudo, incitation à jouer. Comment maximiser la participation ?
- **Lots & rétention** : aujourd'hui top 3 par email. Faut-il un compte joueur récurrent ? une mécanique de fidélité multi-séances ?
- **Contenu** : qui produit les quizz à l'échelle ? La génération IA suffit-elle ? Marketplace de quizz ? Quizz brandés par les distributeurs de films ?
- **Mineurs** : l'exclusion actuelle limite l'audience cinéma (familles). À réévaluer.
- **Late-join** : aujourd'hui non supporté (on ne rejoint pas une partie en cours). Impact sur la participation ?

### Technique / scalabilité

- **Multi-langues** : hors périmètre mais structurant si expansion.
- **Stockage médias** : disque VPS aujourd'hui, S3/Scaleway prévu — à déclencher selon volumétrie.
- **App native** : web/PWA aujourd'hui ; une app native changerait l'acquisition et les notifications push.
- **Analytics avancés** : seules des stats basiques existent (dashboard). Quelles métriques business prioriser ?

---

## 15. Glossaire

- **NUC** : mini-PC en cabine qui fait tourner l'interface A (le grand écran).
- **Player** (au sens app) : l'interface A / le grand écran. À ne pas confondre avec "joueur".
- **Joueur** : spectateur participant via son téléphone (interface B).
- **Console** : interface C, le projectionniste.
- **Super-admin** : interface D, le porteur du projet (Anzio).
- **Session** : instance d'un quizz lancée dans une salle.
- **Lobby** : phase de pré-jeu (inscriptions).
- **Resume token** : identifiant de reconnexion d'un joueur.
- **Heartbeat** : ping périodique du NUC vers le serveur.

---

_Document de synthèse — généré à partir de PROJECT_REFERENCE.md, MIGRATION_PLAN.md, CURRENT_STATE.md, du schéma Prisma et des résumés de PR1 à PR9._
