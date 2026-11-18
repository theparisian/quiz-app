# C4 — Affichage du sponsor et portail sponsor

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

1. Montrer le sponsor au public aux bons moments. 2) Donner au sponsor un accès en lecture seule à
   ses chiffres agrégés. Il ne voit jamais de pseudo ni d'email.

À LIRE
packages/validation/src/socket-events.ts (roundInfoSchema), apps/player/components/states/lobby-state.tsx,
final-results-state.tsx, apps/player/games/_, apps/mobile/components/lobby-waiting.tsx, final-screen.tsx,
apps/mobile/games/_, packages/design-tokens, api/src/modules/auth/_, invitations/_,
api/src/shared/auth/middleware.ts, packages/types, apps/console/lib/auth.tsx,
apps/console/app/(authenticated)/layout.tsx, api/src/modules/sessions/session-report.service.ts.

À FAIRE — Affichage public

1. Crée un composant SponsorBadge dans apps/player et apps/mobile : « Présenté par » + logo (hauteur
   fixe, fond neutre arrondi pour rester lisible quel que soit le logo), nom en texte si pas de logo.
   Source : round.game.sponsor (événement round:started, unité B2-B4) ; au lobby, le sponsor de la première manche
   sponsorisée, à ajouter aux snapshots et à by-code / by-token sous la clé sessionSponsor.
2. Emplacements — écran cinéma : lobby (bas de l'écran), carton d'ouverture de manche de 3 s
   (« <titre du jeu> — présenté par <sponsor> »), coin bas droit pendant la manche sponsorisée,
   classement de fin de manche. Mobile : lobby, bandeau fin pendant la manche, écran final.
   Jamais pendant une manche non sponsorisée. Rien ne s'affiche s'il n'y a pas de sponsor.
3. Couleur : brandColorPrimary n'est utilisée que pour un liseré du carton d'ouverture, jamais pour
   le texte ni les boutons de réponse.

À FAIRE — Rôle sponsor (migration 0025) 4. UserRole : ajoute 'sponsor' (Prisma + packages/types). users.sponsor_id BigInt? (relation).
InvitationRole : ajoute 'sponsor' ; invitations.sponsor_id BigInt?, et cinema_id devient nullable
(une invitation porte soit un cinéma, soit un sponsor). L'acceptation crée un user role sponsor.
apps/admin, fiche sponsor : bloc « Accès » pour inviter un contact par email et révoquer. 5. Vérifie CHAQUE requireAuth existant : le rôle sponsor ne doit entrer dans aucune liste de rôles
existante. Ajoute dans tenant-scope.ts assertCanAccessSponsor(user, sponsorId).

À FAIRE — Portail (dans apps/console, pas de nouvelle app) 6. API, rôles sponsor (le sien) et super_admin :
GET /api/sponsor-portal/campaigns → campagnes du sponsor avec totaux.
GET /api/sponsor-portal/campaigns/:id?from=&to= → { sessionsPlayed, billableSessions,
participants, finishers, completionRate, prizesIssued, prizesRedeemed (null si inconnu),
attendanceKnownSessions, attendanceTotal, participationRate (participants / entrées, sur les seules
séances où les entrées sont saisies), amountCents, byDay: [...], byCinema: [{ cinemaName, city,
sessions, participants }] }. Aucune donnée individuelle. GET .../export.csv : une ligne par séance
(date, cinéma, ville, salle, participants, finishers, lots, facturable). 7. apps/console : groupe de routes /sponsor avec sa propre mise en page (pas de barre latérale
cinéma). Après connexion, un rôle sponsor est redirigé vers /sponsor et toute autre route le
renvoie vers /access-denied ; un rôle cinéma ne peut pas ouvrir /sponsor.
Pages : liste des campagnes ; détail avec 5 tuiles (séances diffusées, participants, taux de
complétion, lots gagnés, taux de participation), courbe des participants par jour, tableau par
cinéma, sélecteur de période, bouton d'export CSV. Sous la tuile « taux de participation » :
« Calculé sur N séances dont les entrées sont connues ».

TESTS
Sponsor A ne lit pas la campagne de sponsor B ; rôle sponsor refusé sur un échantillon de 10 routes
cinéma et admin ; agrégats exacts sur un jeu de données fixe ; l'export ne contient ni pseudo ni
email ; invitation sponsor de bout en bout.
