# Shh! — Prompts à exécuter, dans l'ordre

Un fichier = une nouvelle conversation. Colle le fichier entier, avec le modèle indiqué dans son nom.
Ne passe au suivant qu'après : tests verts, vérification à la main, commit.

| N°  | Unité | Modèle                 | Sujet                                              |
| --- | ----- | ---------------------- | -------------------------------------------------- |
| 01  | A1    | Composer               | Cloisonnement entre cinémas                        |
| 02  | A2    | Composer               | Protection du join, code court conservé            |
| 03  | A3    | Composer               | Réponses : course, pause, compteur                 |
| 04  | A4    | Composer               | Déploiement                                        |
| 05  | B1    | Composer               | Modèle de données Game / SessionRound / ScoreEvent |
| 06  | B2-B4 | Opus 5.5 ou Sonnet 5.5 | Moteur et protocole unifié                         |
| 07  | B5    | Composer               | Sessions à plusieurs manches                       |
| 08  | B6    | Composer               | Deuxième moteur : sondage                          |
| 09  | C1    | Composer               | Catalogue                                          |
| 10  | C2    | Composer               | Programmation des salles                           |
| 11  | C3    | Composer               | Campagnes, preuve de diffusion, relevés            |
| 12  | C4    | Composer               | Affichage du sponsor et portail sponsor            |
| 13  | C5    | Composer               | Lots sponsor et consentements email                |

Commande de vérification après chaque fichier :

    pnpm typecheck && pnpm lint && pnpm --filter @quiz-app/api test

À faire à la main avant le fichier 01 : rotation des secrets (PROJECT_REFERENCE.md §8.3).
À faire à la main avant le fichier 04 : ajouter le secret GitHub VPS_KNOWN_HOSTS (sortie de ssh-keyscan).
Les numéros de migration cités (0019 à 0026) supposent cet ordre.
