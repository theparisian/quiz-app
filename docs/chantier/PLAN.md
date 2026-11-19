# Chantier Shh! — Plan de référence

Ce fichier est la mémoire du chantier. Il prime sur les prompts `01` à `13` en cas de conflit.
Toute décision prise en cours de route est ajoutée à la section « Décisions » avec sa date.

## Mode d'exécution

- Une seule branche de travail : `claude/beautiful-bohr-9b3wlc`. Rien ne part sur `master`
  (donc sur le VPS) sans accord explicite.
- Un prompt = au moins un commit, préfixé par son unité (`A1:`, `B1:`…). B2-B4 = 4 commits.
- Avant chaque commit : `pnpm typecheck && pnpm lint && pnpm --filter @quiz-app/api test &&
  pnpm --filter @quiz-app/mobile test` (la commande du LISEZ-MOI + les tests mobile, comme la CI).
- Après chaque prompt : compte rendu (fichiers, migrations, tests, points ouverts) et mise à jour
  du tableau d'avancement ci-dessous.
- Points d'arrêt avec validation humaine : après B2-B4 (fin des 4 commits) et en fin de chantier.
  Les points d'arrêt internes à B2-B4 sont levés (décision du 2026-11-18).
- Exécution séquentielle. Seule exception prévue : A4 (déploiement, fichiers disjoints) peut être
  mené en parallèle de A1-A3.

## Ordre et dépendances

| N° | Unité | Dépend de | Migration | Avancement |
| --- | --- | --- | --- | --- |
| 01 | A1 Cloisonnement | — | — | fait (e5e1f54) |
| 02 | A2 Protection du join | A1 (sessions.routes) | 0019_session_join_token | fait (70e1162 + correctif IP) |
| 03 | A3 Réponses | A2 (players.service) | — | fait (29d9c33 + correctif reprise) |
| 04 | A4 Déploiement | — | — | fait (2cc96b7 + commit exact) |
| 05 | B1 Game / Round / Score | A3 | 0020_games_rounds_scores | fait (1dec890) |
| 06 | B2-B4 Moteur et protocole | B1 | — | fait (83bd658 → 0ce7b37), voir B2-B4-NOTES §13 |
| 07 | B5 Multi-manches | B2-B4 | 0021 | à faire |
| 08 | B6 Sondage | B5 | — | à faire |
| 09 | C1 Catalogue | B6, A1 | 0022 | à faire |
| 10 | C2 Programmation | C1 | 0023 | à faire |
| 11 | C3 Campagnes | C1, B5 | 0024 | à faire |
| 12 | C4 Sponsor | C3 | 0025 | à faire |
| 13 | C5 Lots et consentements | C3, C4 | 0026 | à faire |

Dernière migration existante au démarrage : `0018_audio`. Format des noms : `00NN_snake_case`.

## Conventions communes (à respecter dans toutes les unités)

1. **Contrôle d'accès** : toute vérification de cinéma passe par `api/src/shared/auth/tenant-scope.ts`
   (créé en A1). Les copies locales existantes (`assertCinemaStaffCanAccessSlug` ×3 dans `prizes/`,
   `assertCinemaStaff` dans `cinemas.routes.ts`, `assertCinemaAccess` dans `session-report.service.ts`)
   ne sont pas refactorées pendant le chantier, mais aucun nouveau code ne les réutilise.
2. **IP client** : derrière le proxy, `socket.handshake.address` vaut l'IP du proxy.
   La clé socket prend la DERNIÈRE valeur de `x-forwarded-for` (ajoutée par le proxy, non
   falsifiable), helper `api/src/shared/sockets/client-ip.ts`. Côté Express, `req.ip` après
   `trust proxy` 1, qui donne la même valeur.
3. **Emplacements fixés pour B2-B4** (des prompts suivants y font référence) :
   - API : `api/src/modules/games/engine.types.ts`, `engine-registry.ts`, `engines/<clé>/`.
   - Validation : `packages/validation/src/games/<clé>.ts` ; schéma de manche nommé
     `roundInfoSchema` dans `socket-events.ts` (utilisé par C4).
   - Apps : `apps/<app>/games/registry.ts`, `games/types.ts`, `games/<clé>/`, `games/unknown-game.tsx`.
4. **Champs de plateforme à conserver** lors du nettoyage des payloads en B2-B4 : `joinToken` (A2)
   dans `screen:session_started`, `nuc:join_screen`, et les snapshots écran et console.
5. **Slugs** : `games.slug` est unique pour tous les moteurs. Un jeu quiz reprend le slug de son quiz.
   La création d'un sondage (B6) refuse un slug déjà pris par un quiz ou un jeu (409 SLUG_TAKEN), et
   `syncGameFromQuiz` refuse de même un quiz dont le slug est déjà pris par un autre jeu.
6. **API `/api/games`** : une seule route `PATCH /:slug`, créée en B6 (titre, configJson du sondage)
   et étendue en C1 (champs catalogue). Pas de seconde route.
7. **Participation à une manche** (sert à C3) : la plateforme tient, par manche, l'ensemble des
   joueurs dont au moins un `game:action` a été accepté, et le persiste dans
   `session_rounds.state_json` sous une clé de plateforme (pas de nouvelle table). À poser dès B2-B4
   pour que C3 n'ait pas à toucher l'interface moteur.
8. **Reprise d'un joueur** : `player:resume` remet le joueur dans l'état en mémoire de la partie
   s'il n'y est pas (cas d'un `player:leave` au lobby). B2-B4 doit conserver ce comportement via
   `onPlayerJoined` et l'accompagner d'un test.
9. **Session sans manche** : des sessions créées hors de `sessionsService.create` (nombreux tests,
   données anciennes) n'ont pas de ligne `session_rounds`. À partir de B2-B4, la plateforme crée
   la manche 1 à la volée au `start` (et à la réhydratation) si elle manque, à partir du quiz de la
   session. Jamais d'erreur visible pour ce cas.
10. **Découpage de B2-B4** : un agent par commit de la « Méthode imposée », dans l'ordre, chacun vert.
11. Textes : tutoiement côté joueur, vouvoiement côté cinéma et sponsor.

## Écarts relevés entre les prompts et le code

| Unité | Constat | Traitement proposé |
| --- | --- | --- |
| LISEZ-MOI | Demande la rotation des secrets avant A1 ; `ROADMAP.md` la marque déjà faite. | Faite (décision du 2026-11-18). |
| A2 | Clé `socket.handshake.address` pour `player:join` = IP du proxy en prod : les 300 joins/min seraient partagés par toutes les salles. | Convention 2. |
| A2 / B2-B4 | B2-B4 « nettoie » les payloads de plateforme ; risque de perdre `joinToken`. | Convention 4. |
| B2-B4 | `console:force_end_question` devient `console:force_advance`, mais la route REST `POST /:id/force-end-question` n'est pas mentionnée. | Renommée `force-advance` (décision du 2026-11-18). |
| B6 / C1 | C1 propose « Modifier le contenu » vers l'éditeur de sondage, mais B6 ne crée que `/games/new-poll`. | Ajouter en B6 une page `/games/[slug]/edit-poll` qui réutilise le formulaire. |
| B6 / C1 | Deux unités définissent `PATCH /api/games/:slug`. | Convention 6. |
| C3 | « participants = joueurs ayant fait au moins une action » : aucune donnée générique ne le permet aujourd'hui (les ScoreEvent du quiz ne couvrent que les points > 0 ; le sondage n'attribue ses points qu'en fin de manche). | Convention 7. |
| C4 | Le roadmap rappelle de vérifier le contrat de régie du cinéma pilote avant d'afficher un sponsor. | Hors code ; à garder en tête avant mise en prod de C4. |
| Général | Deux schémas d'email joueur (`packages/validation/rest-api.ts` et `api/.../players.schemas.ts`). | C5 modifie celui réellement utilisé par la route, et aligne l'autre. |

## Points ouverts (hors périmètre, à arbitrer plus tard)

- A1 — `GET /api/sessions/:id/players` est public et renvoie pseudos, scores et statuts de
  n'importe quelle session. À revoir (protéger par jeton joueur ou réduire les champs).
- A1 — Le test existant « 403 for projectionist on another cinema » attendait 201 ; corrigé en 403.

- A2 — `sessions.slug_short` est UNIQUE en base, mais le générateur n'évite que les codes des
  sessions actives : la réutilisation d'un ancien code échoue (bug antérieur, à corriger).
- A2 — Le plafond de joueurs est vérifié sans verrou : des joins simultanés peuvent le dépasser
  de quelques unités.
- A2 — `POST /api/players/join` ne transmet pas `avatarId` (bug antérieur).
- A2 — Une session terminée renvoie 404 sur `/pseudo-suggestions`, ce qui compte dans la limite
  des 10 échecs.
- A3 — Un joueur exclu ou parti reste dans l'état en mémoire pendant la partie et peut encore
  répondre (ses points ne sont pas comptés). Comportement antérieur ; à fermer en B2-B4.
- A4 — À faire par l'utilisateur AVANT la première fusion dans `master` : secret GitHub
  `VPS_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <hôte>`, empreinte vérifiée sur le VPS) et
  `HEALTH_CHECK_TOKEN` renseigné (sinon la garde « séance en cours » est sautée avec un simple
  avertissement).
- A4 — Le premier déploiement A4 n'a pas de garde (l'API en place n'a pas encore la route) : ne pas
  le faire pendant une séance. Changer `HEALTH_CHECK_TOKEN` bloque le déploiement suivant (forcer).
- A4 — Non vérifié sur le VPS réel : présence de `curl`, `pm2` pour l'utilisateur de déploiement,
  `known_hosts` avec `StrictHostKeyChecking=yes`.
- B1 — Le schéma `createSessionSchema` (quizSlug | gameSlugs) reste dans `api/.../sessions.schemas.ts`
  et n'est pas dans `packages/validation`.
- B1 — Le jeu archivé d'un quiz supprimé garde son slug ; un nouveau quiz du même nom prend `-2`.
- B2-B4 — Colonnes `sessions.current_question_started_at` / `current_question_paused_at` plus
  écrites ; à supprimer par une migration ultérieure (hors chantier, les migrations sont additives).
- B2-B4 → B5 — Le thème de session (fonds, sons) et `GET /api/sessions/:id/full` (contenu console)
  viennent encore du quiz de la session : B5 doit les lire sur la manche active / la première manche.
- B2-B4 — Fuites de l'abstraction listées dans B2-B4-NOTES §13(g).

## Décisions

- 2026-11-18 — Rotation des secrets : déjà faite (confirmé). A1 démarre sans prérequis.
- 2026-11-18 — A4 est codé maintenant. Le secret GitHub `VPS_KNOWN_HOSTS` doit être ajouté par
  l'utilisateur AVANT toute fusion dans `master`, sinon le déploiement échoue.
- 2026-11-18 — La route REST `POST /api/sessions/:id/force-end-question` devient `force-advance`
  dans le commit protocole de B2-B4, avec ses appelants.
- 2026-11-18 — Clé IP des sockets : dernière valeur de `x-forwarded-for` (et non la première,
  falsifiable par le client). Corrigé après A2.
- 2026-11-18 — Déploiement automatique : on déploie le commit exact validé par la CI
  (`workflow_run.head_sha`), un seul déploiement à la fois, et jamais un commit plus ancien que la
  version en place.
- 2026-11-18 — Validations humaines réduites au minimum : après B2-B4 et en fin de chantier.
