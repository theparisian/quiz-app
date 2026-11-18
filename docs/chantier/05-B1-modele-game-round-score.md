# B1 — Modèle de données Game / SessionRound / ScoreEvent

## Règles générales

Tu travailles dans le monorepo Shh! (pnpm + Turborepo) : api/ (Express, Socket.io, Prisma, MySQL),
apps/player (écran cinéma), apps/mobile (joueur), apps/console (cinéma), apps/admin (super-admin),
packages/validation (schémas Zod partagés), packages/types.

Règles obligatoires :
1. Lis d'abord PROJECT_REFERENCE.md sections 2, 6 et 7, puis tous les fichiers cités dans "À lire".
   Ne modifie rien avant d'avoir lu.
2. Fais uniquement ce qui est demandé. Aucun refactor, renommage ou reformatage hors périmètre.
   Si quelque chose te semble nécessaire hors périmètre, arrête-toi et écris-le dans ton compte rendu.
3. Respecte les conventions existantes : modules api en <nom>.routes.ts / .service.ts / .schemas.ts,
   erreurs via AppError(message, status, CODE), validation via validate(schema, body),
   ids BigInt en base et string dans le JSON, journalisation via logger et logEvent.
4. Tout payload REST ou socket nouveau a son schéma Zod dans packages/validation, exporté par index.ts.
5. Toute modification du schéma Prisma passe par une migration SQL nommée dans api/prisma/migrations
   (numéro suivant le dernier existant). Jamais de "db push". Les migrations sont additives :
   on n'efface ni colonne ni table existante.
6. Chaque comportement nouveau a un test Vitest dans api/tests, sur le modèle des tests existants
   (helpers dans api/tests/helpers/integration.ts). Les tests existants doivent rester verts
   sans être affaiblis ni supprimés.
7. Textes d'interface en français, tutoiement côté joueur, vouvoiement côté cinéma et sponsor.
8. Termine par : pnpm typecheck && pnpm lint && pnpm --filter @quiz-app/api test.
   Corrige jusqu'à ce que tout passe.
9. Compte rendu final : fichiers créés et modifiés, migrations, tests ajoutés, points laissés ouverts.

## Ta mission

OBJECTIF
Introduire les tables games, session_rounds et score_events, les remplir à partir de l'existant et
les tenir à jour, SANS changer le comportement du jeu. L'orchestrateur continue de lire session.quiz.

À LIRE
api/prisma/schema.prisma, la dernière migration de api/prisma/migrations,
api/src/modules/quizzes/quizzes.service.ts et quizzes.routes.ts,
api/src/modules/sessions/sessions.service.ts, sessions.schemas.ts, sessions.routes.ts,
api/src/modules/sessions/session-orchestrator.service.ts (endQuestionInternal, endSessionInternal),
api/tests/helpers/integration.ts, packages/types/src/index.ts.

À FAIRE
1. Prisma + migration SQL 0020_games_rounds_scores :
   enum GameKind { internal sponsored }
   enum GameStatus { draft published archived }
   enum RoundState { pending running ended skipped }
   model Game (table games) : id BigInt, slug unique VarChar(100), title VarChar(255),
     description Text?, engineKey VarChar(50) (map engine_key), configJson Json?,
     quizId BigInt? UNIQUE (relation vers Quiz), kind GameKind défaut internal,
     sponsorId BigInt? (relation Sponsor), status GameStatus défaut draft,
     coverImageUrl VarChar(500)?, durationEstimateSeconds Int?, createdAt, updatedAt.
   model SessionRound (table session_rounds) : id, sessionId, position Int (à partir de 1),
     gameId, state RoundState défaut pending, startedAt?, endedAt?, stateJson Json?,
     @@unique([sessionId, position]), index sessionId et gameId.
   model ScoreEvent (table score_events) : id, sessionId, roundId, playerId, points Int,
     reason VarChar(50), metaJson Json?, createdAt ; index (sessionId, playerId) et roundId.
   Ajoute les relations inverses. Ne rends PAS Session.quizId nullable dans ce prompt.
2. Dans la même migration, reprise des données en SQL :
   - un Game par Quiz : slug = quiz.slug, title, description, cover, durée copiés,
     engine_key = 'quiz', quiz_id = quiz.id, sponsor_id copié,
     kind = 'sponsored' si quiz.type = 'sponsored' sinon 'internal', status = quiz.status.
   - un SessionRound par Session : position 1, game_id du jeu de son quiz, state = 'ended' si la
     session est ended, 'skipped' si aborted, 'running' si running/paused, sinon 'pending'.
   Pas de reprise pour score_events.
3. Crée le module api/src/modules/games (games.service.ts, games.schemas.ts) avec :
   - syncGameFromQuiz(quizId, tx?) : crée ou met à jour le Game lié (mêmes règles que la reprise).
   Appelle-la dans quizzes.service.ts après chaque création, édition complète, patch, publication,
   dépublication, archivage, désarchivage, duplication. À la suppression d'un quiz : supprime son
   Game s'il n'a aucune manche, sinon passe-le en archived.
4. sessions : createSessionSchema accepte SOIT quizSlug (existant), SOIT gameSlugs (tableau de 1 à 5
   slugs). Dans ce prompt, gameSlugs doit contenir exactement 1 slug dont le moteur est 'quiz'
   (sinon 400 GAME_NOT_SUPPORTED_YET). sessionsService.create résout le Game, vérifie
   status = published, renseigne quizId comme aujourd'hui et crée la manche position 1 dans la
   même transaction que la session.
5. Orchestrateur, double écriture seulement :
   - au lancement (start) : la manche 1 passe en running, startedAt = now.
   - dans endQuestionInternal, dans la transaction des scores : un ScoreEvent par joueur ayant
     points > 0 (reason 'quiz_answer', metaJson { questionId, timeToAnswerMs }).
   - endSessionInternal : manche en ended + endedAt ; abortSession : manche en skipped.
   Player.scoreTotal reste la valeur lue partout.
6. Ajoute GameKind, GameStatus, RoundState à packages/types. Ajoute scoreEvent, sessionRound, game
   aux fonctions truncate de api/tests/helpers/integration.ts, dans l'ordre des clés étrangères.

NE PAS FAIRE
Aucun changement côté apps/. Aucun changement d'événement socket. Pas d'API REST /games ici (C1).

TESTS (api/tests/games.sync.test.ts et compléments)
Création d'un quiz → un Game lié ; publication → Game published ; création de session par quizSlug
et par gameSlugs → une manche ; partie complète → somme des ScoreEvent d'un joueur = son scoreTotal,
manche ended ; abort → manche skipped.
