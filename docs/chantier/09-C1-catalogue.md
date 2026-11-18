# C1 — Catalogue

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
Faire de la table games un catalogue géré par le seul super_admin, et l'exposer en lecture aux
cinémas avec une fiche détaillée par jeu.

À LIRE
api/src/modules/games/*, api/src/modules/quizzes/quizzes.routes.ts (modèle d'upload de couverture),
api/src/shared/auth/tenant-scope.ts, apps/admin/lib/nav-items.ts,
apps/admin/app/(dashboard)/quizzes/page.tsx et sponsors/page.tsx (modèles de liste),
apps/console/components/quiz-picker.tsx.

À FAIRE — Données (migration 0022)
1. Game : ajoute tagline VarChar(160)?, rulesText Text?, catalogEnabled Boolean défaut false
   (visible des cinémas), audience enum GameAudience { all_cinemas selected_cinemas } défaut
   all_cinemas, minPlayers Int?, tags Json? (tableau de chaînes).
   Nouvelle table game_cinema_access (gameId, cinemaId, clé primaire composée).
   Reprise : catalogEnabled = true pour les jeux published existants.
2. Un jeu est « disponible pour un cinéma » si status = published ET catalogEnabled ET
   (audience = all_cinemas OU une ligne game_cinema_access existe). Écris cette règle UNE fois, dans
   gamesService.isAvailableForCinema et gamesService.availableWhere(cinemaId), et réutilise-la.
   sessionsService.create refuse un jeu non disponible pour le cinéma de la salle
   (403 GAME_NOT_AVAILABLE), sauf pour super_admin.

À FAIRE — API
3. Super-admin uniquement, /api/games : GET liste (filtres engineKey, kind, status, catalogEnabled,
   search ; pagination), GET /:slug, PATCH /:slug (tagline, rulesText, kind, sponsorId, audience,
   cinemaIds, tags, minPlayers, durée), POST /:slug/enable et /:slug/disable (catalogEnabled),
   POST/DELETE /:slug/cover. kind = sponsored exige sponsorId. Pour un jeu de moteur quiz, title et
   couverture restent pilotés par le quiz (syncGameFromQuiz) : PATCH les refuse.
4. Cinéma (cinema_admin, projectionist, super_admin), /api/catalog :
   GET /api/catalog?cinemaSlug=&kind=&engineKey=&search= → jeux disponibles pour ce cinéma
   (contrôle assertCanAccessCinema) : slug, title, tagline, coverImageUrl, engineKey, kind,
   sponsor { name, logoUrl }, durationEstimateSeconds, tags.
   GET /api/catalog/:slug?cinemaSlug= → fiche : champs ci-dessus + description, rulesText,
   contentSummary selon le moteur : quiz → { questionsCount, sampleQuestions: les 3 premières
   questions, texte seul, SANS les réponses } ; poll → { questionsCount, sampleQuestions }.
   Ne renvoie jamais isCorrect ni configJson brut.
5. /api/quizzes?status=published reste en place pour ne rien casser.

À FAIRE — apps/admin
6. Entrée « Catalogue » dans nav-items (icône Storefront), page /games : tableau (couverture, titre,
   moteur, type interne/sponsorisé, sponsor, statut, interrupteur « Dans le catalogue », audience)
   avec filtres. Page /games/[slug] : formulaire des champs du point 3, sélection des cinémas si
   audience restreinte, lien « Modifier le contenu » vers l'éditeur de quiz ou de sondage.

À FAIRE — apps/console
7. Crée components/catalog/game-card.tsx (couverture, titre, durée, pastille « Sponsorisé » + logo) et
   components/catalog/game-detail-drawer.tsx (panneau latéral droit : fiche complète, règles,
   questions d'exemple). Remplace l'appel de quiz-picker par /api/catalog et ces composants.
   Clic sur une carte = ouverture du panneau ; bouton « Choisir » dans le panneau.

TESTS
Disponibilité (4 combinaisons), catalogue filtré par cinéma, fiche sans réponses correctes, refus
pour un autre cinéma, création de session refusée pour un jeu désactivé, routes /api/games
interdites aux rôles cinéma.
