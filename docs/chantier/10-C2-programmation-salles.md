# C2 — Programmation des salles

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
Donner au cinéma une page unique « Programmation » : ses salles d'un côté, le catalogue de l'autre.
Il associe des jeux à une salle par glisser-déposer OU par un simple menu, et lance le programme
d'une salle en un clic.

À LIRE
apps/console/app/(authenticated)/layout.tsx, dashboard/page.tsx, screens/[screenId]/page.tsx,
apps/console/components/screen-card.tsx, session-launcher.tsx, sidebar-screen-list.tsx,
apps/console/hooks/use-screens.ts, use-active-sessions.ts, apps/console/components/catalog/\* (C1),
apps/admin/app/(dashboard)/quizzes/[slug]/edit/quiz-edit-client.tsx (usage existant de @dnd-kit).

À FAIRE — API (migration 0023)

1. Table screen_program_items : id, screenId, gameId, position Int, createdAt ;
   @@unique([screenId, gameId]), index screenId. 5 jeux au maximum par salle.
2. GET /api/cinemas/:slug/programs → pour chaque salle du cinéma : { screenId, name, capacity,
   status, nuc: { status, lastSeenAt } | null, activeSession: { id, state } | null,
   items: [{ gameSlug, title, coverImageUrl, kind, sponsorName, durationEstimateSeconds, available }] }
   (available = false si le jeu a été retiré du catalogue depuis).
   PUT /api/screens/:id/program, corps { gameSlugs: string[] (0 à 5) } : remplace le programme dans
   une transaction ; chaque jeu doit être disponible pour ce cinéma.
   Lecture : cinema_admin, projectionist, super_admin. Écriture : cinema_admin et super_admin.
   Contrôle de cinéma sur les deux routes.
3. POST /api/screens/:id/program/launch : crée une session avec les jeux disponibles du programme,
   dans l'ordre (mêmes règles que POST /api/sessions). 400 PROGRAM_EMPTY si rien à lancer.

À FAIRE — apps/console 4. Ajoute @dnd-kit/core et @dnd-kit/sortable (mêmes versions que apps/admin).
Nouvelle page /programmation + entrée « Programmation » dans la barre latérale. 5. Mise en page : à gauche (2/3), une grille de cartes de salle ; à droite (1/3), le catalogue
(recherche, filtres Tous / Maison / Sponsorisés, cartes game-card).
Carte de salle : nom, capacité, pastille d'état du boîtier (en ligne / hors ligne), badge « En
direct » si une session est active, liste ordonnée des jeux du programme (vignette, titre, durée,
pastille sponsor), durée totale, bouton « Lancer ».
Survol d'un jeu (ou appui long sur tablette) : infobulle avec tagline, durée, type, sponsor.
Clic sur un jeu, où qu'il soit : ouvre game-detail-drawer. 6. Trois façons d'associer, toutes obligatoires :
a. glisser une carte du catalogue vers une carte de salle (la salle survolée est surlignée) ;
b. réordonner par glisser à l'intérieur d'une salle, et retirer par un bouton × ;
c. sans glisser : bouton « Ajouter à… » sur chaque carte du catalogue et dans le panneau de détail,
qui ouvre un menu listant les salles (cases à cocher). Ce chemin doit suffire à tout faire au
clavier et au doigt.
Chaque changement appelle PUT immédiatement, avec mise à jour optimiste (TanStack Query) et retour
arrière + message en cas d'erreur. Salle pleine (5 jeux) : dépôt refusé avec le message
« 5 jeux maximum par salle ». 7. Projectionist : même page en lecture seule (pas de glisser, pas de « Ajouter à… »), mais « Lancer »
reste actif. « Lancer » appelle la route launch puis redirige vers la console live existante.
Si une session est déjà active dans la salle, le bouton devient « Ouvrir la session ». 8. Un jeu devenu indisponible reste affiché grisé avec « Retiré du catalogue » et un bouton retirer.

NE PAS FAIRE
Pas de planification horaire ni de calendrier. Ne supprime pas le lanceur de session existant.

TESTS
API : PUT (ordre conservé, plus de 5 refusé, jeu indisponible refusé, autre cinéma refusé, rôle
projectionist refusé en écriture), launch (ordre des manches, programme vide, jeu retiré ignoré).
