# B5 — Sessions à plusieurs manches

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
Une session peut enchaîner 1 à 5 jeux, avec un score cumulé et un seul classement final.

À LIRE
api/src/modules/sessions/_ , api/src/modules/games/_, api/src/modules/prizes/prize-config.service.ts,
api/src/modules/sessions/session-report.service.ts, apps/console/components/session-launcher.tsx,
quiz-picker.tsx, apps/console/components/live-console/live-header.tsx et controls-panel.tsx.

À FAIRE — API

1. Migration 0021 : sessions.quiz_id devient NULLABLE. Toute lecture de session.quiz dans api/src doit
   gérer null : cherche "session.quiz" et "quiz:" dans les include, et corrige chaque usage en
   passant par la manche active ou la première manche. Liste ces usages dans ton compte rendu.
2. sessionsService.create : gameSlugs accepte 1 à 5 jeux, tous published, moteur enregistré ;
   doublons interdits (400 DUPLICATE_GAME). quizId = le quiz de la première manche de moteur quiz,
   sinon null. Les manches sont créées en state pending, positions 1..n.
3. Plateforme : au start, lance la manche 1. Quand une manche appelle finish() :
   a. manche → ended, émets round:ended ;
   b. s'il reste une manche : attends ROUND_INTERLUDE_MS (variable d'env, défaut 8000), puis crée la
   manche suivante, émets round:started, appelle start() ;
   c. sinon : endSessionInternal comme aujourd'hui.
   Pause pendant l'interlude : le délai restant est gelé et repris au resume.
   Abort : la manche en cours et les suivantes passent en skipped.
   Redémarrage serveur : la réhydratation reprend la manche running avec son stateJson ; si aucune
   n'est running mais qu'il reste des pending, elle lance la suivante.
4. Score : le total d'un joueur est la somme de ses ScoreEvent de la session ; Player.scoreTotal
   reste mis à jour par ctx.award. scoreThisRound de round:ended = somme des ScoreEvent de la manche.
   Départage final : score décroissant, puis joinedAt croissant (règle actuelle).
5. Retardataires : joinedQuestionPosition ne vaut que pour une manche quiz. Un joueur arrivé pendant
   la manche N participe normalement à la manche N+1.
6. Lots et lobby : la configuration (prizesConfig, timer de lobby, fonds, audio de lobby) est lue
   sur le jeu de la PREMIÈRE manche. Sponsor pour les lots : celui de la première manche sponsorisée,
   s'il y en a une.
7. session-report.service.ts : ajoute rounds: [{ position, gameTitle, engineKey, state, startedAt,
   endedAt, participants }] ; les statistiques par question (moteur quiz) portent désormais un roundPosition.

À FAIRE — Console 8. session-launcher : sélection de plusieurs jeux avec ordre (boutons monter / descendre / retirer),
5 au maximum, durée totale estimée affichée. Un seul jeu sélectionné = parcours actuel. 9. Console live : l'en-tête affiche « Manche 2/3 — <titre> » ; nouveau bouton « Passer à la manche
suivante » (handler socket console:skip_round → la manche passe en skipped, puis enchaînement
normal), avec confirmation.

TESTS
Session de 2 jeux quiz : ordre complet des événements, score cumulé exact, un seul session:ended ;
pause pendant l'interlude ; abort en manche 1 → manche 2 skipped ; skip_round ; joueur arrivé en
manche 1 qui joue la manche 2 ; redémarrage simulé entre deux manches.
