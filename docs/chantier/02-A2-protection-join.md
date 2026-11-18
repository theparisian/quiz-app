# A2 — Protection du join, code court conservé

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
Protéger les points d'entrée publics sans gêner une salle entière qui partage la même IP.
Le QR code porte un jeton long ; le code à 4 chiffres reste la solution de secours pour ceux qui
ne scannent pas, avec une limite sur les essais ratés uniquement.

À LIRE
api/src/create-app.ts, api/src/shared/sockets/gateway.ts,
api/src/shared/rate-limit/pseudo-suggestions.rate-limit.ts (modèle à généraliser),
api/src/modules/auth/auth.routes.ts, api/src/modules/nucs/nucs.routes.ts,
api/src/modules/sessions/sessions.routes.ts (routes by-code), sessions.service.ts,
session-code.service.ts, api/src/modules/players/players.service.ts, players.routes.ts,
api/src/shared/sockets/handlers/mobile-handler.ts, session-resume.service.ts,
packages/validation/src/socket-events.ts, apps/player/components/states/lobby-state.tsx,
apps/player/components/shared/late-join-qr-badge.tsx, apps/player/lib/stores/nuc-store.ts,
apps/mobile/app/page.tsx, apps/mobile/app/join/[slugShort]/page.tsx.

À FAIRE — PARTIE 1 : en-têtes et CORS
1. Ajoute la dépendance helmet à api. Dans buildApp : app.set('trust proxy', 1) puis
   app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })) avant cors.
2. Crée api/src/shared/cors-origins.ts : resolveCorsOrigins() lit CORS_ORIGINS (liste séparée par
   des virgules, trim). Si la variable est vide et NODE_ENV === 'production' : lève une erreur au
   démarrage. Hors production : renvoie true (toutes origines). Utilise-la dans create-app.ts et
   gateway.ts à la place du repli '*'.

À FAIRE — PARTIE 2 : limiteur générique (en mémoire, aucune nouvelle dépendance)
3. Crée api/src/shared/rate-limit/sliding-window.ts : createRateLimiter({ windowMs, max }) renvoie
   { check(key): { allowed, resetAt }, reset() } avec le même algorithme que le fichier modèle,
   plus un nettoyage des clés vides toutes les 5 minutes (setInterval avec unref()).
   Ajoute rateLimitMiddleware(limiter, keyFn) qui répond 429, code RATE_LIMITED, en-tête Retry-After.
4. Applique :
   - POST /api/auth/magic-link/request : 5 par 15 min par IP ET 3 par 15 min par email (minuscules).
   - POST /api/auth/magic-link/verify : 20 par 15 min par IP.
   - POST /api/nucs/auth et POST /api/nuc/heartbeat : 30 par minute par IP.
   - POST /api/players/join et socket player:join (clé = socket.handshake.address) : 300 par minute
     par IP. Ce plafond est volontairement haut : une salle entière sort par la même IP.
   - GET /api/sessions/by-code/:slugShort et ses sous-routes : ne compte QUE les réponses 404
     (code inconnu). 10 échecs par minute par IP, puis 429 pendant la fenêtre. Idem pour un
     player:join dont le code est inconnu.

À FAIRE — PARTIE 3 : jeton long dans le QR
5. Migration 0019_session_join_token : colonne sessions.join_token VARCHAR(32) NULL UNIQUE.
   Prisma : joinToken String? @unique @map("join_token"). Généré par nanoid(20) dans
   sessionsService.create.
6. Nouvelle route publique GET /api/sessions/by-token/:joinToken : même réponse que by-code.
   Factorise la mise en forme dans une fonction commune.
7. playerJoinPayloadSchema : sessionSlugShort devient optionnel, ajoute joinToken optionnel
   (string 10 à 32) ; refine : exactement l'un des deux. playersService.join accepte l'un ou l'autre.
8. Ajoute joinToken aux payloads destinés à l'écran et à la console : screen:session_started,
   la réponse de nuc:join_screen (currentSession), buildNucStateSnapshot, buildConsoleStateSnapshot.
9. apps/player : le QR (lobby-state et late-join-qr-badge) encode `${MOBILE_URL}/?t=${joinToken}` ;
   s'il manque, garde `?s=${slugShort}`. L'écran continue d'afficher l'adresse courte et le code à
   4 chiffres en gros, avec le texte « Pas de QR ? Va sur <domaine mobile> et tape ce code ».
10. apps/mobile : la page d'accueil lit ?t= (résolution via by-token, puis même parcours que ?s=)
    et garde ?s= et la saisie manuelle. Sur 429, affiche « Trop d'essais, réessaie dans une minute ».

À FAIRE — PARTIE 4 : plafond de joueurs
11. Dans playersService.join : si le nombre de joueurs non kickés atteint
    max(50, ceil(capacité de la salle × 1,5)) — ou 400 si la capacité est nulle — lève
    AppError('Session is full', 409, 'SESSION_FULL'). Message mobile : « La partie est complète ».

NE PAS FAIRE
Ne supprime pas le code à 4 chiffres. Ne mets aucune limite basse par IP sur les joins réussis.
N'ajoute pas Redis.

TESTS
sliding-window (fenêtre, reset), magic-link 429 au 6e appel, by-code : 10 codes inconnus puis 429
alors qu'un code valide répondait 200 avant, join par joinToken, join par code, refus si les deux
ou aucun, SESSION_FULL, démarrage en production sans CORS_ORIGINS qui échoue.
Ajoute les reset des nouveaux limiteurs dans api/tests/setup.ts.
