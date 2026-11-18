# A1 — Cloisonnement entre cinémas

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
Un utilisateur cinema_admin ou projectionist ne doit pouvoir lire ou piloter que les salles et
sessions de SON cinéma (user.cinemaId). Aujourd'hui seul le rôle est vérifié.

À LIRE
api/src/shared/auth/middleware.ts, api/src/modules/sessions/sessions.routes.ts,
api/src/modules/sessions/sessions.service.ts, api/src/modules/sessions/session-report.service.ts
(fonction assertCinemaAccess, à prendre comme modèle), api/src/modules/players/players.routes.ts,
api/src/modules/screens/screens.routes.ts, api/src/modules/cinemas/cinemas.routes.ts,
api/src/shared/sockets/handlers/console-handler.ts, api/src/shared/sockets/handlers/admin-handler.ts,
api/src/shared/sockets/socket-auth.ts, api/tests/helpers/integration.ts.

À FAIRE
1. Crée api/src/shared/auth/tenant-scope.ts avec trois fonctions async qui lèvent
   AppError('Insufficient permissions', 403, 'FORBIDDEN') :
   - assertCanAccessCinema(user, cinemaId: bigint) : super_admin passe toujours ; sinon
     user.cinemaId doit être non nul et égal à cinemaId.
   - assertCanAccessScreen(user, screenId) : charge screen.cinemaId (404 SCREEN_NOT_FOUND si absent)
     puis appelle assertCanAccessCinema.
   - assertCanAccessSession(user, sessionId) : charge session.screen.cinemaId
     (404 SESSION_NOT_FOUND si absent) puis appelle assertCanAccessCinema.
   Le paramètre user a la forme { role, cinemaId } pour servir aussi aux sockets.
2. Dans sessions.routes.ts, appelle la bonne fonction AVANT toute action dans : POST / (sur
   body.screenId), GET /:id, GET /:id/full, POST /:id/start, /pause, /resume, /force-end-question,
   /abort, /toggle-mute. Fais de même pour toute autre route de ce fichier protégée par ADMIN_ROLES.
3. players.routes.ts, POST /:id/kick : charge le joueur, puis assertCanAccessSession sur sa session.
4. screens.routes.ts et cinemas.routes.ts : pour chaque route ouverte à cinema_admin ou projectionist,
   vérifie l'accès au cinéma visé (par slug ou par screenId). Ne touche pas aux routes super_admin.
5. console-handler.ts : dans console:join et console:resume, après authenticateJwtFromCookie,
   appelle assertCanAccessSession avec { role: auth.role, cinemaId: auth.cinemaId } ; en cas de refus,
   émets l'erreur socket { code: 'FORBIDDEN', message: 'Not allowed for this session' } et retourne
   sans rejoindre aucune room.
6. admin-handler.ts : vérifie que le contrôle existant couvre bien cinema_admin ; ne change rien d'autre.

NE PAS FAIRE
Ne modifie pas les routes publiques (by-code, join, redeem, heartbeat). Ne change aucun payload.

TESTS (api/tests/tenant-scope.test.ts)
Ajoute dans helpers/integration.ts un helper createCinemaUser(role, cinemaId) calqué sur
createSuperAdminUser. Crée deux cinémas (slug préfixé tmp-) avec une salle et une session chacun.
Vérifie : projectionist du cinéma A reçoit 403 sur start, pause, abort, GET /:id et kick d'une
session du cinéma B ; 403 sur POST /api/sessions avec une salle de B ; succès sur son propre
cinéma ; super_admin réussit partout ; console:join sur une session de B renvoie FORBIDDEN.

CRITÈRE D'ACCEPTATION
Aucune route ou handler ouvert à cinema_admin / projectionist n'agit sans contrôle de cinéma.
Liste dans ton compte rendu chaque route modifiée.
