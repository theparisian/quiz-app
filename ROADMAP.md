# ROADMAP — Shh!

> Priorités et backlog du produit. La réécriture v2 (PR1 → PR10) est livrée et mergée sur master ; l'historique détaillé est dans `docs/archive/`. Ce document est la source d'autorité pour ce qui reste à faire.
>
> **16 novembre 2026** — Le projet est en phase de **test terrain et itérations produit**, pas encore en production commerciale ; les livraisons partent sur `master` et le VPS de test.

---

## 1. Avant pilote terrain

Checklist bloquante avant la première installation en salle réelle :

- [ ] Tests bout-en-bout en conditions réelles : envoi email SMTP réel + scan QR depuis un vrai téléphone, scénario de résilience (crash serveur en cours de session). Partiellement à rejouer manuellement.
- [ ] Provisionnement d'un NUC physique réel + installation chez le cinéma pilote.
- [ ] Compléter les `[À COMPLÉTER]` de la doc : cinéma pilote, URL/instance d'hébergement prod, contacts du runbook (`docs/runbook-cinema.md`).
- [ ] Configuration des secrets prod : SMTP, Sentry DSN, `PRIZE_HMAC_SECRET`, etc.
- [x] **Rotation complète des secrets suite à la compromission du VPS d'août 2026** (`JWT_SECRET`, `SESSION_SECRET`, `PRIZE_HMAC_SECRET`, mot de passe MySQL + `DATABASE_URL`, `SMTP_PASS`, `ANTHROPIC_API_KEY`, `HEALTH_CHECK_TOKEN`). Traitée par Anzio après l'incident ; référence procédure et priorités dans `PROJECT_REFERENCE.md` §8.3.
- [ ] Audit post-incident : table `users` (comptes ou rôles ajoutés), dossier d'uploads (servi en statique, donc public), et arbitrage RGPD sur la notification CNIL (la base contient des emails de gagnants et des pseudos).
- [ ] Vérifier le contrat de régie publicitaire du cinéma pilote avant d'afficher un sponsor à l'écran.

---

## 2. Plan de travail en cours

Feuille de route technique structurée (indépendante du backlog produit ci-dessous). Les cases sont à cocher au fil des livraisons.

| N°  | Unité | Sujet                                                                                 | Modèle                 | État |
| --- | ----- | ------------------------------------------------------------------------------------- | ---------------------- | ---- |
| 01  | A1    | Cloisonnement entre cinémas                                                           | Composer               | [ ]  |
| 02  | A2    | Protection du join, code court conservé                                               | Composer               | [ ]  |
| 03  | A3    | Réponses : course, pause, compteur                                                    | Composer               | [ ]  |
| 04  | A4    | Déploiement (CI obligatoire, garde session active, contrôle de santé, retour arrière) | Composer               | [ ]  |
| 05  | B1    | Modèle de données Game / SessionRound / ScoreEvent                                    | Composer               | [ ]  |
| 06  | B2-B4 | Moteur de jeu et protocole temps réel unifié, quiz migré                              | Opus 5.5 ou Sonnet 5.5 | [ ]  |
| 07  | B5    | Sessions à plusieurs manches                                                          | Composer               | [ ]  |
| 08  | B6    | Deuxième moteur : sondage                                                             | Composer               | [ ]  |
| 09  | C1    | Catalogue de jeux (géré par le super-admin, lecture cinéma)                           | Composer               | [ ]  |
| 10  | C2    | Programmation des salles par le cinéma                                                | Composer               | [ ]  |
| 11  | C3    | Campagnes sponsor, preuve de diffusion, relevés                                       | Composer               | [ ]  |
| 12  | C4    | Affichage du sponsor et portail sponsor                                               | Composer               | [ ]  |
| 13  | C5    | Lots à codes partenaires et consentements email                                       | Composer               | [ ]  |

Les prompts détaillés des unités sont tenus hors du dépôt.

---

## 3. Décisions prises

- Une session peut enchaîner plusieurs jeux (manches), score cumulé.
- Le catalogue est un store maison : seul le super-admin ajoute, publie ou retire un jeu ; le cinéma choisit dans le catalogue et compose le programme de ses salles.
- Les moteurs de jeu sont écrits en interne, pas de code tiers.
- Un seul protocole temps réel pour tous les moteurs, quiz compris.
- Les emails sont collectés et conservés par la plateforme ; ils ne sont transmis à un cinéma ou à un sponsor que si un accord est enregistré et que le joueur a coché la case correspondante.
- On vend aux sponsors des séances diffusées et des participants, pas des « vues », tant qu'il n'y a pas de donnée de billetterie.
- Le code à 4 chiffres reste disponible pour ceux qui ne scannent pas le QR.

---

## 4. Backlog produit priorisé

Liste ordonnée. Chaque item est traité dans l'ordre sauf arbitrage explicite d'Anzio. Les chantiers absorbés par le plan de travail (§2) sont signalés par unité.

### 1) Affichage sponsor sur player + mobile — _couvert par l'unité C4_

Le sponsor existe en base (`sponsors`, `quizzes.sponsor_id`, branding) et dans le payload de session, mais il n'est **pas rendu côté spectateur** (ni player, ni mobile). Objectif inchangé : logo/branding aux moments clés (lobby, question, résultats).

### 2) Rapport de session — suites

**Livré** (cf. § Livré) : API + pages admin. Reste à prioriser :

- Envoi automatique du rapport de session au cinéma par email.
- Affichage d'un récapitulatif dans la console projectionniste (interface C).
- Export PDF du rapport (le CSV couvre l'analyse externe, l'écran couvre le deck).
- Comparaisons multi-sessions (évolution dans le temps, A/B de quiz).
- Stats agrégées par sponsor — _couvert par l'unité C4_ (dashboard sponsor consolidé multi-sessions).

### 3) [x] Fiabilisation du déploiement — _livré par l'unité A4_

Extraire la logique de `.github/workflows/deploy.yml` vers un `scripts/deploy.sh` versionné, health-check post-déploiement et rollback automatique en cas d'échec.

### 4) Factorisation des `lib/` dupliquées

Les 4 apps (player, mobile, console, admin) dupliquent du code `lib/` (notamment `lib/socket.ts`). Consolider dans les packages partagés (`packages/socket-client`) et **aligner le backoff de reconnexion** : aujourd'hui configuré dans `apps/player/lib/socket.ts` (délais 1200–45000 ms), absent des `lib/socket.ts` mobile et console alors que les bannières « reconnexion » existent.

### 5) Mode session automatique

**Partiellement livré** : lobby minuté avec lancement auto (`lobby-timer.service.ts`), enchaînement auto des questions et clôture de session dans l'orchestrateur. **Reste** : parcours « avant-séance sans personnel » de bout en bout (création / planification de session sans cabine, politique produit par défaut).

### 6) Catalogue de quiz hebdomadaire — _couvert par l'unité C1_

Quiz générés par IA puis validés, publiés en catalogue, sélectionnables par les cinémas — à porter dans le modèle catalogue + programmation (C1/C2).

### 7) Join zéro-saisie + classement du mois

**Partiellement livré** : pseudos suggérés (`pseudo-generator`, route `pseudo-suggestions`, cartes dans `pseudo-input.tsx`) ; le joueur doit encore valider « Jouer » (pas de join immédiat au scan seul). **Reste** : classement du mois par cinéma (aucune brique métier dédiée repérée dans le code).

### 8) Suites de l'audio écran cinéma

Le socle audio est livré (bibliothèques de sons, sons propres au quiz, musiques lobby/partie/scores avec option sans interruption, SFX ouverture de question / apparition des réponses / dernières secondes / clôture / réponse d'un joueur / podium, pseudos éphémères à l'écran). Suites identifiées, hors périmètre de la PR audio :

- Remplacer les trois sons intégrés placeholders de `apps/player/public/sounds/` par de vrais fichiers, ou les retirer du registre au profit du silence.
- Prévisualisation du rendu sonore d'un quiz depuis l'admin (jouer la séquence complète sans lancer de session).
- Ducking : baisser automatiquement la musique de fond pendant les SFX importants.
- Points d'entrée/sortie de boucle par musique, pour les pistes qui ne bouclent pas proprement.
- Normalisation du volume à l'upload (loudness), pour éviter les écarts entre sons d'origines différentes.
- Réutilisation d'un son local à un quiz lors de la duplication (aujourd'hui les slots concernés sont vidés).
- Contrôle du volume général depuis la console projectionniste (aujourd'hui seul le mute existe).

### 9) Durcissement et cloisonnement du VPS

Suite de l'incident d'août 2026 (n8n exposé sans authentification, serveur détourné pour une attaque DDoS sortante, VPS coupé par l'hébergeur). Les règles à respecter sont écrites dans `PROJECT_REFERENCE.md` §8.2 ; restent à mettre en œuvre :

- **Sortir n8n du VPS de prod**, ou l'isoler strictement : utilisateur système dédié, binding `127.0.0.1`, aucun secret partagé avec le quiz. Aujourd'hui une faille dans l'un donne accès à l'autre.
- Vérifier et figer la configuration `ufw` (`default deny incoming`, seuls 22/80/443 ouverts), en tenant compte du fait que Docker contourne `ufw` via `iptables`.
- Script d'audit de la surface exposée (`ss -tlnp` + `ufw status`) à lancer manuellement ou en tâche planifiée, avec alerte si un port inattendu écoute sur `0.0.0.0`.
- Sauvegardes vérifiées **hors VPS** : l'incident a montré que les dumps MySQL quotidiens et les uploads médias vivent sur la machine compromise.
- Séparer l'utilisateur de déploiement GitHub Actions des droits `root`, et restreindre sa clé aux commandes nécessaires.
- Mise à jour automatique des paquets de sécurité (`unattended-upgrades`).

---

## 5. Livré (hors plan de travail §2)

- **Lot de consolation** : résolution du lot `all` / drapeau `isConsolation` pour les joueurs hors podium lorsque la config cinéma, sponsor ou quiz le définit (`prize-config.service.ts`, `api/tests/prize-consolation.test.ts`).
- **Rapport de session** : `GET /api/sessions/:id/report`, liste et export CSV, pages admin `apps/admin/app/(dashboard)/reports/` (liste + détail).
- **Rattrapage des emails de lots** : `requeuePendingPrizeEmailsOnBoot` au démarrage de l'API (`api/src/server.ts`, `prize-email-queue.service.ts`).

---

## 6. Questions ouvertes business

Points non tranchés, les plus utiles à challenger d'un point de vue produit/business.

### Business

- **Modèle de facturation cinéma** : abonnement mensuel ? au nombre de séances ? freemium + commission sur lots ? Non décidé.
- **Grille tarifaire sponsor et part reversée au cinéma** : non définies.
- **Source des entrées par séance** : saisie manuelle en cabine ou raccordement billetterie — non décidé.

### Produit

- **Mineurs** : l'exclusion actuelle (majeurs uniquement) limite l'audience cinéma (familles). À réévaluer après le pilote.

### Technique / scalabilité

- **Multi-langues** : hors périmètre aujourd'hui mais structurant en cas d'expansion.
- **Stockage médias** : disque VPS aujourd'hui, S3/Scaleway prévu — à déclencher selon la volumétrie.
- **App native** : web/PWA aujourd'hui ; une app native changerait l'acquisition et ouvrirait les notifications push.

---

## 7. Dette / nettoyages

### Doublon REST `POST /api/players/join` vs socket `player:join`

Le client mobile rejoint désormais une session via le socket `player:join` (diffusion `player:joined` temps réel). La route REST `POST /api/players/join` reste en place car :

- elle est couverte par toute la suite `api/tests/players.api.test.ts` ;
- elle sert de fixture de setup dans `players.email.test.ts` et `prizes.pr7.integration.test.ts`.

Plan de retrait propre :

1. réécrire `players.api.test.ts` en client socket.io (comme `session-socket.test.ts`) ;
2. remplacer les setups de `players.email` / `prizes.pr7` par un appel direct à `playersService.join` (ou un helper d'intégration) ;
3. supprimer la route et le schéma associé.

En attendant, les deux chemins (REST + socket) partagent le même helper de diffusion (`api/src/shared/sockets/session-broadcast.ts`), donc aucun chemin « silencieux » ne subsiste.

### Autres chantiers de dette

- Tests unitaires des stores front (`nuc-store`, `live-session-store`).
- Test E2E Playwright du parcours session complet (création → lobby → questions → résultats → lot).
- Cron de cleanup des fichiers `ai-input` orphelins.
- Découpage de `quiz-edit-client.tsx` (~796 lignes au compteur actuel, la roadmap mentionnait auparavant 1251) avant toute nouvelle feature admin.
