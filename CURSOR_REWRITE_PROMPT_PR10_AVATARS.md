# PR10 — Avatars joueurs (spec d'exécution)

> Branche : `rewrite/v2/pr-10-avatars`
> À lire avant : `PROJECT_REFERENCE.md` §4.7 et §5 (modèle de données), `MIGRATION_PLAN.md` (PR10).
> Une PR à la fois, pas de feature creep. À la fin : `PR10_SUMMARY.md`.

## Décisions cadrées (non négociables pour cette PR)

1. Sélection **optionnelle** côté mobile : un avatar **aléatoire est pré-sélectionné**, et si le joueur ne choisit rien, un avatar par défaut (aléatoire de la bibliothèque) lui est **assigné côté serveur**.
2. **Doublons autorisés** : plusieurs joueurs d'une même partie peuvent porter le même avatar.
3. Upload admin : on accepte un PNG/JPEG/WebP et on **normalise/redimensionne en PNG 512x512 côté serveur** (carré, transparence préservée).
4. Avatar affiché **devant le pseudo** partout : écran cinéma (A), mobile (B) **et** console (C).
5. Quiz sans avatars activés → comportement actuel strictement inchangé.

## 1. Base de données (`api/prisma/schema.prisma`)

Ajouter :

```prisma
model AvatarLibrary {
  id          BigInt   @id @default(autoincrement())
  slug        String   @unique @db.VarChar(100)
  name        String   @db.VarChar(255)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  avatars Avatar[]
  quizzes Quiz[]

  @@map("avatar_libraries")
}

model Avatar {
  id        BigInt   @id @default(autoincrement())
  libraryId BigInt   @map("library_id")
  imageUrl  String   @map("image_url") @db.VarChar(500)
  imageKey  String   @map("image_key") @db.VarChar(500)
  label     String?  @db.VarChar(100)
  position  Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")

  library AvatarLibrary @relation(fields: [libraryId], references: [id], onDelete: Cascade)
  players Player[]

  @@index([libraryId])
  @@map("avatars")
}
```

Modifier `Quiz` :

```prisma
  avatarsEnabled  Boolean @default(false) @map("avatars_enabled")
  avatarLibraryId BigInt? @map("avatar_library_id")
  // relation
  avatarLibrary   AvatarLibrary? @relation(fields: [avatarLibraryId], references: [id])
  // + @@index([avatarLibraryId])
```

Modifier `Player` :

```prisma
  avatarId BigInt? @map("avatar_id")
  avatar   Avatar? @relation(fields: [avatarId], references: [id])
  // + @@index([avatarId])
```

Générer la migration. Ne pas l'appliquer en prod dans la PR.

## 2. Backend — module `avatars`

Nouveau dossier `api/src/modules/avatars/` (calqué sur `sponsors`) :

- `avatars.service.ts` : CRUD bibliothèques (list/getBySlug/create/update/activate/deactivate) + gestion des avatars (addAvatar/removeAvatar/reorder).
- `avatars.schemas.ts` : Zod (création/maj bibliothèque, réordonnancement).
- `avatars.routes.ts` : routes `requireAuth(['super_admin'])`.
  - `GET /api/avatar-libraries` (+ `?active=true` pour les sélecteurs)
  - `GET /api/avatar-libraries/:slug`
  - `POST /api/avatar-libraries`
  - `PATCH /api/avatar-libraries/:slug`
  - `POST /api/avatar-libraries/:slug/activate` / `/deactivate`
  - `POST /api/avatar-libraries/:slug/avatars` (upload, champ `file`)
  - `DELETE /api/avatar-libraries/:slug/avatars/:avatarId`
  - `PATCH /api/avatar-libraries/:slug/avatars/reorder`
- Enregistrer le routeur dans `api/src/create-app.ts`.

Upload : réutiliser `createUploadMiddleware` + `uploadFile` (`shared/upload`, `shared/storage`). `kind: 'avatar'`, `maxSize = 2 Mo`, mimes `image/png, image/jpeg, image/webp`.

Normalisation 512x512 : ajouter la dépendance **`sharp`** côté `api`. Avant `uploadFile`, transformer le buffer :
`sharp(buffer).resize(512, 512, { fit: 'cover', position: 'centre' }).png().toBuffer()`, forcer mimetype `image/png` et extension `.png`. (Le pipeline `uploadFile` actuel stocke tel quel ; on lui passe le buffer normalisé.)

## 3. Validation partagée (`packages/validation`)

- Schéma `player:join` : ajouter `avatarId: z.string().optional()`.
- Payloads diffusés (`player:joined`, scores de question, résultats finaux, `session:state_snapshot`) : ajouter `avatarUrl: z.string().nullable()` (ou `avatarId` + résolution côté client — préférer `avatarUrl` résolu côté serveur pour simplicité d'affichage).
- Types partagés associés dans `packages/types` si présents.

## 4. Backend — sessions / players

- `players.service.ts` (jonction) + handler socket `player:join` : accepter `avatarId`.
  - Si quiz `avatarsEnabled` :
    - valider que l'`avatarId` appartient bien à `quiz.avatarLibraryId` ; sinon ignorer.
    - si absent/invalide → tirer un avatar **aléatoire** de la bibliothèque et l'assigner.
  - Si quiz sans avatars → `avatarId = null`.
- `session-broadcast` / orchestrateur : inclure `avatarUrl` (résolu via l'`Avatar.imageUrl`) dans `player:joined`, les scores et `quiz:final_results`.
- `session-resume.service.ts` : inclure l'`avatarUrl` du joueur et ceux du scoreboard dans `session:state_snapshot`.
- Quiz API (`quizzes.service.ts` / shape + `quizzes.schemas.ts`) : exposer/persister `avatarsEnabled` et `avatarLibraryId` (PATCH `/api/quizzes/:slug` + payload `full`). Côté `quiz-editor-store`.

## 5. Interface D (admin)

- Nav (`apps/admin/app/(dashboard)/layout.tsx`) : entrée "Avatars" (icône Phosphor, ex. `Smiley`).
- Pages `app/(dashboard)/avatars/` : liste des bibliothèques + page `[slug]` (édition : nom, description, grille d'avatars avec upload `apiUploadFile`, suppression, réordonnancement). S'inspirer des pages `sponsors`.
- Onglet **Design** du quiz (`quizzes/[slug]/edit/quiz-edit-client.tsx`) : ajouter
  - une checkbox "Autoriser les avatars sur cette partie" (`avatarsEnabled`),
  - si cochée, un `<select>` de bibliothèque (chargé via `GET /api/avatar-libraries?active=true`), liant `avatarLibraryId`.
  - Câbler dans `quiz-editor-store.ts` (`updateMetadata`, hydratation, `buildQuizSavePayload`).

## 6. Interface B (mobile)

- Composant `avatar-picker.tsx` : grille d'avatars (ronds) de la bibliothèque de la session.
  - Source : exposer la liste via la vérification de session / un endpoint type `GET /api/sessions/by-code/:code/avatars` (retourne `[]` si avatars désactivés).
  - Pré-sélection aléatoire, sélection optionnelle.
- Brancher dans le flux de jonction (à côté de `pseudo-input.tsx` / `use-player-session.ts`) et transmettre `avatarId` dans `player:join`.
- Afficher l'avatar du joueur sur ses écrans (lobby/question/résultats) à côté de son pseudo.

## 7. Interface A (player NUC)

- `PlayerPill` (`components/shared/player-pill.tsx`) : afficher l'avatar rond devant le pseudo si présent ; fallback = pastille couleur actuelle.
- `ScoreRow` (`components/shared/score-row.tsx`) : avatar rond devant le pseudo.
- `final-results-state.tsx` : avatar dans le podium + classement.
- `lobby-state.tsx` / `nuc-store.ts` : porter `avatarUrl` dans le state des joueurs et du scoreboard.
- Rendu rond : `rounded-full object-cover` ; image servie via `resolveMediaUrl` (cf. `lib/media-url.ts`).

## 8. Interface C (console)

- `components/live-console/players-list.tsx` (+ store/live-session) : avatar rond devant le pseudo.

## 9. Tests

- `avatars` : upload + normalisation 512x512 (vérifier dimensions de sortie), CRUD bibliothèque.
- Jonction : assignation auto d'un avatar aléatoire quand activé sans choix ; `null` quand désactivé ; rejet d'un `avatarId` hors bibliothèque.
- Présence de `avatarUrl` dans `player:joined`, résultats finaux et snapshot de reconnexion.

## Critère de complétude

Voir `MIGRATION_PLAN.md` (PR10). `pnpm typecheck` + `pnpm lint` + tests verts. `PR10_SUMMARY.md` rédigé.
