# PR8 — Observabilité

## Résumé

Mise en place du journal applicatif (`events_log` + `logEvent`), des alertes email sur événements `critical` avec throttle par `eventType`, de Sentry côté API et les quatre apps Next, des routes agrégées `GET /api/dashboard/*`, d’un `/health` minimal et d’un `/health/detailed` protégé par jeton (`X-Health-Token`), d’un tableau de bord admin avec rafraîchissement automatique, des tests Vitest (event-log, dashboard, health), et de **l’injection des secrets d’observabilité depuis GitHub** vers le `.env` à la racine du dépôt sur le VPS (`deploy.yml`).

---

## Backend

- **`packages/observability`** : sanitization PII pour Sentry (`scrub-pii`).
- **`logEvent`** (fire-and-forget) dans `shared/events/` ; persistance Prisma ; sur `critical`, envoi SMTP via `sendCriticalAlert` (destinataires `ADMIN_ALERT_EMAILS`, throttle 60 s même `eventType`).
- **`index` Prisma** sur `events_log` (`event_type`, `created_at`) pour les agrégats dashboard / erreurs récentes.
- **Instrumentation** : sessions live, joueurs, publish/archive quiz, refus IA, auth NUC échouée, NUC monitor offline, prix email/redemption (+ IP dans le flux concerné).
- **Sentry** : `api/src/shared/sentry/sentry.ts` (`SENTRY_DSN_API`, `SENTRY_ENVIRONMENT`), initialisation avant le reste du serveur, flush au shutdown ; handler Express envoie à Sentry les erreurs hors `AppError` 4xx.
- **Variables d’environnement** : `api/src/server.ts` charge le `.env` du répertoire de travail (souvent `api/` en dev), puis **`../.env`** à la racine du monorepo si présent — aligné avec le déploiement qui fusionne les secrets dans ce fichier.
- **`/health`** → `{ status: 'ok' }` ; **`/health/detailed`** → détail seulement si `HEALTH_CHECK_TOKEN` défini et en-tête **`X-Health-Token`** avec la même valeur ; sinon même réponse légère que `/health`.
- **`/api/dashboard`** : `health`, `today`, `recent-errors`, `recent-sessions` ; rôles `super_admin`, `cinema_admin` avec filtrage par périmètre cinéma.
- **Email** : `sendEmail` accepte plusieurs destinataires et corps HTML optionnel (alertes critiques).

---

## Frontend (apps Next)

- **`next.config.ts`** : `@sentry/nextjs` avec `withSentryConfig({ silent: true })` ; transpilation `@quiz-app/observability`.
- Par app : **`instrumentation.ts`** / **`instrumentation-client.ts`**, **`lib/sentry-bootstrap.ts`**, **`app/global-error.tsx`** ; DSN **`NEXT_PUBLIC_SENTRY_DSN_<APP>`** (suffixe `ADMIN` | `CONSOLE` | `PLAYER` | `MOBILE`).
- Pages **`useSearchParams`** enveloppées dans **Suspense** là où nécessaire (build Next 15).

---

## Admin (interface D)

- **`apps/admin/app/(dashboard)/page.tsx`** : polling (~30 s) sur les endpoints dashboard, cartes NUC/sessions/abandons du jour, listes NUC hors ligne et erreurs `events_log`, sessions du jour, pastille globale état dégradé.

---

## Variables d’environnement

| Contexte          | Variables                                                                          |
| ----------------- | ---------------------------------------------------------------------------------- |
| API               | `SENTRY_DSN_API`, `SENTRY_ENVIRONMENT`, `ADMIN_ALERT_EMAILS`, `HEALTH_CHECK_TOKEN` |
| Next (chaque app) | `NEXT_PUBLIC_SENTRY_DSN_*`, `SENTRY_ENVIRONMENT` (voir fichiers `.env.example`)    |

Référence : `api/.env.example`, `apps/*/.env.example`.

### Déploiement (`deploy.yml`)

Les clés suivantes peuvent être définies en **secrets GitHub** (même nom que la variable d’environnement) : elles sont fusionnées dans le `.env` à la racine du projet sur le VPS lors du déploiement SSH, comme `CORS_ORIGINS`. Si un secret est **absent ou vide**, le workflow **ne met pas à jour** cette ligne sur le VPS (pour ne pas effacer une config locale).

| Secret GitHub (`Repository secrets`)                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN_API`                                                                                                                   |
| `NEXT_PUBLIC_SENTRY_DSN_ADMIN`, `NEXT_PUBLIC_SENTRY_DSN_CONSOLE`, `NEXT_PUBLIC_SENTRY_DSN_PLAYER`, `NEXT_PUBLIC_SENTRY_DSN_MOBILE` |
| `SENTRY_ENVIRONMENT` (ex. `production`)                                                                                            |
| `ADMIN_ALERT_EMAILS`                                                                                                               |
| `HEALTH_CHECK_TOKEN`                                                                                                               |

Pour que les fronts Next reçoivent les `NEXT_PUBLIC_*`, prévoir soit un **rebuild des apps sur le VPS** après déploiement quand ces valeurs sont ajoutées ou modifiées (elles sont généralement figées au build), soit un mécanisme d’injection déjà utilisé hors ce workflow.

**Après avoir renseigné les secrets sur GitHub** : un run du workflow **Deploy to VPS** (push sur les branches configurées ou _workflow_dispatch_) réécrit le `.env` racine pour les clés présentes ; **redémarrer le process PM2 de l’API** est nécessaire pour prendre `SENTRY_DSN_API`, `ADMIN_ALERT_EMAILS`, `HEALTH_CHECK_TOKEN`, etc. Les DSN fronts ne sont pris par Next qu’après **`next build`** (ou équivalent) avec ces variables disponibles au moment du build.

---

## Critères de complétude (`MIGRATION_PLAN.md` § PR8)

| Critère                                                                       | Réalisation                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard exploitation utile (interface D)                                    | Cartes + listes (`/api/dashboard/*`), polling admin                                                                             |
| Erreur backend volontaire → Sentry                                            | À valider après déploiement DSN (`SENTRY_DSN_API`), voir § Vérification Sentry                                                  |
| Erreur frontend volontaire → Sentry                                           | À valider : quatre apps Next avec `NEXT_PUBLIC_SENTRY_DSN_*` disponibles au **build**, voir § Sentry                            |
| NUC offline → visible / notifié dans le dashboard                             | Agrégats dashboard + lignes événements / NUC hors ligne (alertes critiques selon événements `logEvent` configurés dans le code) |
| Alerts email niveau `critical`                                                | `ADMIN_ALERT_EMAILS` + SMTP ; distinct de Sentry (voir § Vérification alertes)                                                  |
| `/health/detailed` avec jeton (DB, disque, mémoire, volumétrie sessions/NUCs) | Implémenté ; appel réservé à l’opérateur avec `HEALTH_CHECK_TOKEN`                                                              |

---

## Vérifications rapides après déploiement

- Confirmer sur le VPS que le `.env` **à la racine du monorepo** contient bien les lignes attendues après le workflow (dont `SENTRY_*`, `HEALTH_CHECK_TOKEN`, `ADMIN_ALERT_EMAILS` si défini comme secrets GitHub).
- **`GET /health`** → corps minimal `{ "status": "ok" }`.
- **`GET /health/detailed`** sans jeton ou mauvais jeton → même réponse légère qu’`/health`.
- **`GET /health/detailed`** avec **`X-Health-Token: <valeur de HEALTH_CHECK_TOKEN>`** → JSON avec `checks` (dont base de données, mémoire, sessions actives, NUCs).

---

## Vérification manuelle — Sentry

1. S’assurer que les secrets GitHub (DSN API + quatre `NEXT_PUBLIC_SENTRY_DSN_*`) ont été déployés, que l’API a été redémarrée après injection du `.env` racine, et que les apps Next ont été **rebâties** si besoin avec ces variables disponibles au build.
2. **Backend** : déclencher une route qui lève une erreur non gérée (ex. erreur 500 hors `AppError`) et confirmer l’issue dans le projet Sentry **quiz-app-api** (nom suggéré).
3. **Frontend** : sur chaque app, provoquer une erreur rendue (`throw` dans une page de test ou erreur boundary) et confirmer l’issue dans le projet Sentry correspondant.
4. Contrôler que les payloads ne contiennent pas de champs sensibles évidents (sanitization `@quiz-app/observability`).

---

## Vérification — alertes critiques

1. `ADMIN_ALERT_EMAILS` renseigné (secret GitHub ou `.env`) et SMTP opérationnel.
2. Déclencher un chemin métier qui appelle `logEvent` avec `level: 'critical'` (selon instrumentation existante dans le code).
3. Vérifier la réception d’un email d’alerte ; un second événement **même `eventType`** sous 60 s ne doit pas renvoyer d’email (log info « suppressed »).

---

## Tests

- `pnpm --filter @quiz-app/api test` : `tests/event-log.service.test.ts`, `tests/dashboard.service.test.ts`, `tests/health-detailed.test.ts` (et suite existante).

---

## Hors périmètre (référence plan)

Journalisation centralisée long terme (BetterStack, Axiom, …) ; alignement exhaustif des README historiques avec le nouveau contrat `/health` (traité dans ce résumé et `MIGRATION_PLAN.md`).
