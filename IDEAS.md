# IDEAS — notes hors périmètre

> Idées identifiées en cours de route mais non implémentées pour rester dans le périmètre de la tâche en cours.

## Jonction joueur : supprimer totalement le doublon REST `/api/players/join`

Le client mobile rejoint désormais une session via le socket `player:join` (diffusion `player:joined` temps réel). La route REST `POST /api/players/join` reste en place car :

- elle est couverte par toute la suite `api/tests/players.api.test.ts` (test de l'API de jonction) ;
- elle sert de fixture de setup dans `players.email.test.ts` et `prizes.pr7.integration.test.ts`.

Pour la retirer proprement il faudrait :

1. réécrire `players.api.test.ts` en client socket.io (comme `session-socket.test.ts`) ;
2. remplacer les setups de `players.email` / `prizes.pr7` par un appel direct à `playersService.join` (ou un helper d'intégration) ;
3. supprimer la route et le schéma associé.

En attendant, les deux chemins (REST + socket) partagent le même helper de diffusion (`api/src/shared/sockets/session-broadcast.ts`), donc aucun chemin "silencieux" ne subsiste.
