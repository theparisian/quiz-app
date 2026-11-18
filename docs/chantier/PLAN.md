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
- Points d'arrêt avec validation humaine : après A4, après B1, après chacun des 4 commits de B2-B4,
  après B5, après C2, après C4, en fin de chantier.
- Exécution séquentielle. Seule exception prévue : A4 (déploiement, fichiers disjoints) peut être
  mené en parallèle de A1-A3.

## Ordre et dépendances

| N° | Unité | Dépend de | Migration | Avancement |
| --- | --- | --- | --- | --- |
| 01 | A1 Cloisonnement | — | — | à faire |
| 02 | A2 Protection du join | A1 (sessions.routes) | 0019_session_join_token | à faire |
| 03 | A3 Réponses | A2 (players.service) | — | à faire |
| 04 | A4 Déploiement | — | — | à faire |
| 05 | B1 Game / Round / Score | A3 | 0020_games_rounds_scores | à faire |
| 06 | B2-B4 Moteur et protocole | B1 | — | à faire |
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
2. **IP client** : derrière le proxy, `socket.handshake.address` vaut l'IP du proxy. Toute clé de
   limitation socket utilise la première valeur de `x-forwarded-for`, sinon `handshake.address`
   (comme `player-handler.ts` le fait déjà). Côté Express, `req.ip` après `trust proxy`.
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
8. Textes : tutoiement côté joueur, vouvoiement côté cinéma et sponsor.

## Écarts relevés entre les prompts et le code

| Unité | Constat | Traitement proposé |
| --- | --- | --- |
| LISEZ-MOI | Demande la rotation des secrets avant A1 ; `ROADMAP.md` la marque déjà faite. | À confirmer (question 1). |
| A2 | Clé `socket.handshake.address` pour `player:join` = IP du proxy en prod : les 300 joins/min seraient partagés par toutes les salles. | Convention 2. |
| A2 / B2-B4 | B2-B4 « nettoie » les payloads de plateforme ; risque de perdre `joinToken`. | Convention 4. |
| B2-B4 | `console:force_end_question` devient `console:force_advance`, mais la route REST `POST /:id/force-end-question` n'est pas mentionnée. | La renommer `force-advance` dans le même commit (question 3). |
| B6 / C1 | C1 propose « Modifier le contenu » vers l'éditeur de sondage, mais B6 ne crée que `/games/new-poll`. | Ajouter en B6 une page `/games/[slug]/edit-poll` qui réutilise le formulaire. |
| B6 / C1 | Deux unités définissent `PATCH /api/games/:slug`. | Convention 6. |
| C3 | « participants = joueurs ayant fait au moins une action » : aucune donnée générique ne le permet aujourd'hui (les ScoreEvent du quiz ne couvrent que les points > 0 ; le sondage n'attribue ses points qu'en fin de manche). | Convention 7. |
| C4 | Le roadmap rappelle de vérifier le contrat de régie du cinéma pilote avant d'afficher un sponsor. | Hors code ; à garder en tête avant mise en prod de C4. |
| Général | Deux schémas d'email joueur (`packages/validation/rest-api.ts` et `api/.../players.schemas.ts`). | C5 modifie celui réellement utilisé par la route, et aligne l'autre. |

## Décisions

_(vide, à remplir au fil du chantier)_
