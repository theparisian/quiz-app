# PR9 — Préparation pilote terrain

## Résumé

Livrables **pilote NUC** et **doc incident salle** ; correctifs **recovery** player (page `/error`, `global-error`, Socket.io backoff) ; **`scrub-pii`** durci pour les URLs Sentry ; clarification **double route heartbeat** dans la doc technique, le `PROJECT_REFERENCE` et des commentaires API. Aucune fonctionnalité métier nouvelle hors périmètre PR9.

**Point de contrôle demandé (prompt PR9) :** après les **3 premiers commits bash** (`scripts/nuc/…`), le provisioning est complet côté repo — relire `provision-nuc.sh`, les templates systemd et `chromium-kiosk.sh` avant fusion / exécution sur machine réelle.

---

## Provisioning NUC (`scripts/nuc/`)

- **`provision-nuc.sh`** : Ubuntu **x86_64** + root ; saisie **`nuc_uid`**, **`auth_key`** (masquée), URLs API/player, `CINEMA_NAME` optionnel ; modes **[R] / [M] / [N]** si config existante ; installation paquets (Chromium détecté `chromium` vs `chromium-browser`, X minimal `xinit` + `xserver-xorg-core`, dépendances kiosk) ; utilisateur **`quizkiosk`** ; `/etc/quiz-app/nuc.env` **600** ; unités **`quiz-nuc-chromium`**, timer **04:00** + service oneshot restart ; invite opérateur avant création **`/etc/quiz-app/provisioned`**.
- **`templates/chromium-kiosk.sh`** : si **pas** de témoin provisioned → URL **`{PLAYER_URL}/provision?nuc_uid=&auth_key=`** (secret **une fois** via query) ; sinon **`{PLAYER_URL}/`** (aligné `apps/player/app/page.tsx` + `provision/page.tsx`).
- **Systemd** : `xinit` lance le script kiosk ; **`Restart=always`** sur le service principal ; conflict documenté : reload navigateur ≠ restart `systemd` — niveaux différents, pas d’opposition fonctionnelle prévue.

---

## Player (interface A)

- **`apps/player/lib/socket.ts`** : `reconnectionDelay` 1200 ms, `reconnectionDelayMax` 45 000 ms, `randomizationFactor` 0,5, `reconnectionAttempts: Infinity`.
- **`apps/player/app/error/page.tsx`** : marque **cinéma** via `useNucStore` (`cinemaLogoUrl` / `cinemaName`) ; message public sobre ; **rechargement automatique ~30 s** (compte à rebours aligné) pour tout sauf **`not_provisioned`**.
- **`apps/player/app/global-error.tsx`** : écran statique minimal + **reload ~30 s** + points animés CSS légers (sans Framer).

---

## Observabilité

- **`packages/observability/src/scrub-pii.ts`** : masquage additionnel des paires de requête sensibles dans les **chaînes d’URL** (`auth_key`, `nuc_uid`, `resume_token`, `magic_link_token`, `token`) ; clés objet **`nuc_uid` / `nucUid`** dans `REDACT_KEYS`.

---

## Documentation

- **`docs/nuc-deployment.md`** : parcours **matériel → install Ubuntu Server → admin NUC → script → vérifs → timer 04:00 → routes heartbeat → maj SSH → VPN optionnel → dépannage** ; cas **re-provisionnement** (pas de correctif applicatif).
- **`docs/runbook-cinema.md`** : fiche **non technique** + marqueurs **`[À COMPLÉTER]`** (emplacement boîtier, contact support, audio pilote, précisions NUC physiques).
- **`PROJECT_REFERENCE.md`** : § 4.4 NUC (identification serveur, `/api/nucs/auth`, cookie, **deux** routes heartbeat) ; § 13 hébergement partiellement renseigné (UE / OVH équivalent) avec **[à compléter]** restant pour l’URL/instance concrète ; **cinéma pilote** toujours **[à compléter]**.

**Note historique Git :** le commit **`425c1b7`** a un diff `PROJECT_REFERENCE.md` bruité (Prettier fichier entier) immédiatement **annulé fonctionnellement** par **`50664e6`** ; avant merge de la PR, **squasher** ces deux commits évite le bruit dans `git blame`.

---

## API

- **`api/src/modules/nucs/nucs.routes.ts`** : commentaires **JSDoc ASCII** distinguant `/api/nuc/heartbeat` vs `/api/nucs/heartbeat`.

---

## §9 (validation) — Synthèse livrée & appliquée

- **Décision retenue :** fichier **`/etc/quiz-app/provisioned`** posé **après confirmation opérateur** ; **sans** témoin Chromium ouvre **`…/provision?…`** (**auth_key** transit **une fois** par cycle) ; **avec** témoin → **`PLAYER_URL/`** / logique `localStorage` existante.
- **Sécurité :** pas de `console.log` des secrets sur `provision` ; `beforeSend` utilise `scrubPii` ; durcissement URLs en **PR9**.
- **Dette notée (hors PR9) :** `apps/mobile/lib/socket.ts` et `apps/console/lib/socket.ts` **sans** backoff explicite ; les **trois** apps ont un `lib/socket.ts` **local** alors que `PROJECT_REFERENCE.md` § 4.2 mentionne `packages/socket-client` — **réalignement / factorisation** à planifier.

---

## Tests

- `pnpm --filter @quiz-app/api test` (**passé**, exit 0).

---

## `[À COMPLÉTER]` restants (terrain Anzio)

**`docs/runbook-cinema.md` :** emplacement physique NUC ; contact / téléphone / email / horaires ; audio spécifique pilote ; modèle NUC / bouton marche.

**`PROJECT_REFERENCE.md` § 13 :** **cinéma pilote** ; **URL / identifiant d’instance** d’hébergement prod.

---

_Fin du résumé._
