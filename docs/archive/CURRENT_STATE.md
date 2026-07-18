# CURRENT_STATE — Audit du code existant

---

## Section 1 — Architecture technique réelle

### Dépendances (package.json)

| Dépendance        | Version | Usage dans ce projet                                                                                                                 |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@getbrevo/brevo` | ^2.2.0  | Envoi d'emails transactionnels au gagnant du quiz via l'API Brevo                                                                    |
| `bcrypt`          | ^6.0.0  | Hachage et vérification des mots de passe des comptes hôte/admin                                                                     |
| `bootstrap`       | ^5.3.3  | Framework CSS/JS servi en statique pour toutes les pages frontend                                                                    |
| `dotenv`          | ^16.3.1 | Chargement des variables d'environnement depuis `.env`                                                                               |
| `express`         | ^4.18.2 | Serveur HTTP, routage, middleware de session, service des fichiers statiques                                                         |
| `express-session` | ^1.18.1 | Gestion des sessions utilisateur (cookies côté navigateur, store en mémoire)                                                         |
| `mysql2`          | ^3.14.1 | Connexion à la base de données MySQL via un pool de connexions (mode promise)                                                        |
| `qrcode`          | ^1.5.4  | Listé dans les dépendances mais **non utilisé dans le code serveur** — la génération de QR codes se fait côté client via une lib CDN |
| `socket.io`       | ^4.7.2  | Communication temps réel bidirectionnelle entre le serveur et les clients (host, screen, players)                                    |
| `uuid`            | ^11.1.0 | Génération d'identifiants uniques pour les joueurs et les quiz                                                                       |

**devDependencies :**

| Dépendance | Version | Usage                                               |
| ---------- | ------- | --------------------------------------------------- |
| `nodemon`  | ^3.0.1  | Redémarrage automatique du serveur en développement |

### Structure des dossiers

```
quiz-app/
├── .env
├── .github/workflows/deploy.yml
├── .gitignore
├── package.json
├── server.js                  ← Point d'entrée unique
├── config/
│   ├── auth.js                ← Middleware d'authentification
│   ├── database.js            ← Pool MySQL, init DB, CRUD quiz/questions/historique
│   ├── email.js               ← Envoi email gagnant via Brevo
│   └── history.js             ← Wrapper pour l'historique des parties
├── data/
│   ├── questions.json         ← Questions par défaut (seed)
│   └── quizzes.json           ← Quiz par défaut (seed)
├── public/
│   ├── css/
│   │   ├── custom.css         ← Feuille de style unique pour tout le projet
│   │   ├── font/              ← Polices BrandonText (otf + ttf)
│   │   └── img/               ← Assets vidéo + loader SVG
│   ├── host/
│   │   ├── index.html
│   │   └── script.js
│   ├── login/
│   │   └── index.html
│   ├── play/
│   │   ├── index.html
│   │   └── script.js
│   ├── screen/
│   │   ├── index.html
│   │   └── script.js
│   └── sounds/                ← Fichiers audio (mp3)
└── README.md
```

### Point d'entrée serveur

Un seul fichier : `server.js` (~968 lignes). Il contient :

- La configuration Express et Socket.IO
- Toutes les routes HTTP
- L'état du jeu en mémoire (`gameState`)
- Tous les handlers Socket.IO (connexion, jeu, administration)
- Les fonctions de logique de jeu (`nextQuestion`, `startTimer`, `endGame`, `resetGame`, etc.)

Les modules dans `config/` sont des helpers appelés depuis `server.js` :

- `config/database.js` : pool MySQL, `initDatabase()`, méthodes CRUD
- `config/auth.js` : `verifyCredentials()` et middleware `requireAuth`
- `config/email.js` : `sendWinnerEmail()`
- `config/history.js` : `addGameToHistory()` et `loadHistory()`

### Organisation frontend

Chaque page est un dossier dans `public/` contenant un `index.html` et optionnellement un `script.js`. Le CSS est partagé via `/css/custom.css`. Bootstrap est servi depuis `node_modules/bootstrap` exposé sur `/bootstrap`.

Aucun bundler, aucun transpileur. JavaScript vanilla ES6+.

### Variables d'environnement

| Variable                | Rôle                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `PORT`                  | Port d'écoute du serveur (défaut : 3000)                                                   |
| `NODE_ENV`              | Environnement (development / production)                                                   |
| `SESSION_SECRET`        | Secret pour signer les cookies de session (obligatoire en prod)                            |
| `SESSION_COOKIE_SECURE` | Active le flag `secure` sur le cookie de session (true/false)                              |
| `TRUST_PROXY`           | Active `trust proxy` sur Express quand derrière un reverse proxy (1/0)                     |
| `BASE_URL`              | URL publique du site, utilisée pour générer les QR codes (défaut : `https://demo.uxii.fr`) |
| `SOCKET_CORS_ORIGIN`    | Origines autorisées pour Socket.IO, séparées par des virgules                              |
| `DB_HOST`               | Hôte MySQL (défaut : localhost)                                                            |
| `DB_USER`               | Utilisateur MySQL (défaut : local_user)                                                    |
| `DB_PASSWORD`           | Mot de passe MySQL (défaut : local_password)                                               |
| `DB_NAME`               | Nom de la base MySQL (défaut : local_db)                                                   |
| `BREVO_API_KEY`         | Clé API Brevo pour l'envoi d'emails                                                        |
| `SENDER_EMAIL`          | Adresse email d'expédition (défaut : quizmaster@example.com)                               |
| `LOG_DB_CONFIG`         | Active les logs détaillés de la connexion MySQL au démarrage (1/0)                         |

### Comment le projet se lance

| Script           | Commande                              | Description                                       |
| ---------------- | ------------------------------------- | ------------------------------------------------- |
| `npm start`      | `node server.js`                      | Lancement production                              |
| `npm run dev`    | `nodemon server.js`                   | Lancement développement avec hot-reload           |
| `npm run deploy` | `npm version patch && node server.js` | Incrémente la version patch puis lance le serveur |

---

## Section 2 — Schéma de base de données

Le schéma est défini programmatiquement dans `config/database.js` via des `CREATE TABLE IF NOT EXISTS`. Il n'y a pas de fichier `.sql` séparé.

### Table `quiz_host_credentials`

Stocke les comptes des hôtes/administrateurs.

| Colonne         | Type         | Contraintes                                           |
| --------------- | ------------ | ----------------------------------------------------- |
| `id`            | INT          | PRIMARY KEY, AUTO_INCREMENT                           |
| `username`      | VARCHAR(50)  | NOT NULL, UNIQUE                                      |
| `password_hash` | VARCHAR(255) | NOT NULL                                              |
| `is_admin`      | BOOLEAN      | DEFAULT FALSE                                         |
| `created_at`    | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP                             |
| `updated_at`    | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

Relations : aucune clé étrangère.

### Table `questions`

Stocke les questions individuelles (utilisées comme seed pour créer le quiz par défaut).

| Colonne         | Type      | Contraintes                                           |
| --------------- | --------- | ----------------------------------------------------- |
| `id`            | INT       | PRIMARY KEY, AUTO_INCREMENT                           |
| `question`      | TEXT      | NOT NULL                                              |
| `options`       | JSON      | NOT NULL                                              |
| `correct_index` | INT       | NOT NULL                                              |
| `explanation`   | TEXT      | NOT NULL                                              |
| `created_at`    | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP                             |
| `updated_at`    | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

Relations : aucune clé étrangère. Cette table semble être un héritage ; les questions sont désormais stockées en JSON dans la table `quizzes`.

### Table `quizzes`

Stocke les quiz (ensemble de questions).

| Colonne       | Type         | Contraintes                                           |
| ------------- | ------------ | ----------------------------------------------------- |
| `id`          | VARCHAR(36)  | PRIMARY KEY (UUID)                                    |
| `name`        | VARCHAR(255) | NOT NULL                                              |
| `description` | TEXT         | —                                                     |
| `questions`   | JSON         | NOT NULL                                              |
| `active`      | BOOLEAN      | DEFAULT FALSE                                         |
| `created_at`  | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP                             |
| `updated_at`  | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

Relations : référencée par `game_history.quiz_id` (pas de FK formelle en SQL).

Un seul quiz peut être actif à la fois (logique applicative, pas de contrainte SQL).

### Table `game_history`

Stocke l'historique des parties jouées.

| Colonne        | Type         | Contraintes                 |
| -------------- | ------------ | --------------------------- |
| `id`           | INT          | PRIMARY KEY, AUTO_INCREMENT |
| `quiz_id`      | VARCHAR(36)  | NOT NULL                    |
| `quiz_name`    | VARCHAR(255) | NOT NULL                    |
| `player_count` | INT          | NOT NULL                    |
| `winner_name`  | VARCHAR(255) | —                           |
| `winner_email` | VARCHAR(255) | —                           |
| `winner_score` | INT          | —                           |
| `leaderboard`  | JSON         | NOT NULL                    |
| `timestamp`    | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP   |

Relations : `quiz_id` référence logiquement `quizzes.id` (pas de FK SQL).

### SQL complet (reconstitué depuis le code)

```sql
CREATE TABLE IF NOT EXISTS quiz_host_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question TEXT NOT NULL,
  options JSON NOT NULL,
  correct_index INT NOT NULL,
  explanation TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quizzes (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  questions JSON NOT NULL,
  active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id VARCHAR(36) NOT NULL,
  quiz_name VARCHAR(255) NOT NULL,
  player_count INT NOT NULL,
  winner_name VARCHAR(255),
  winner_email VARCHAR(255),
  winner_score INT,
  leaderboard JSON NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

Aucun index explicite créé au-delà des clés primaires et de la contrainte UNIQUE sur `username`.

---

## Section 3 — Inventaire des écrans (frontend)

### `/login` — `public/login/index.html`

**Destinée à :** Hôte / Administrateur (projectionniste)

**Éléments d'interface :**

- Formulaire de connexion avec champs « Nom d'utilisateur » et « Mot de passe »
- Bouton « Se connecter »
- Zone d'erreur (identifiants incorrects)

**Actions utilisateur :**

- Soumettre le formulaire de login (POST /auth)

**Events Socket.IO :** Aucun.

**Fichiers associés :**

- `/bootstrap/dist/css/bootstrap.min.css`
- `/css/custom.css`
- `/bootstrap/dist/js/bootstrap.bundle.min.js`
- JS inline (vérification du paramètre `?error=1` dans l'URL)

---

### `/host` — `public/host/index.html` + `public/host/script.js`

**Destinée à :** Hôte / Administrateur (projectionniste)

**Éléments d'interface :**

- Header avec nom d'utilisateur connecté, bouton Connexion/Déconnexion
- Deux onglets : « Gestion QUIZ » (admin) et « Quiz ACTIF » (host)
- Lien pour ouvrir l'écran de présentation (`/screen`) dans un nouvel onglet
- **Onglet Admin :** Tableau des quiz (nom, nb questions, statut, actions), éditeur de quiz (formulaire avec questions, options, timer, explication)
- **Onglet Host :** Écran d'attente (URL, code session, bouton démarrer), écran de question (texte, options, timer, bouton forcer), écran résultats (réponse correcte, explication, classement), écran final (gagnant, leaderboard, bouton nouveau quiz)
- Panel latéral : code session, nombre de joueurs, liste des joueurs connectés
- Zone de démo (un bouton de test)
- Modal de confirmation pour suppression
- Footer avec version de l'app

**Actions utilisateur :**

- Démarrer le quiz
- Passer à la question suivante
- Forcer la fin du timer
- Lancer un nouveau quiz (reset)
- Créer / Modifier / Supprimer / Activer un quiz (admin)
- Se déconnecter

**Events Socket.IO émis :**

- `host-join`
- `start-game`
- `next-question`
- `question-timer-ended`
- `new-game`
- `admin-init`
- `get-quiz-list`
- `save-quiz`
- `delete-quiz`
- `activate-quiz`

**Events Socket.IO reçus :**

- `game-setup`
- `player-joined`
- `player-left`
- `game-started`
- `new-question`
- `question-results`
- `timer-update`
- `time-up`
- `game-end`
- `game-reset`
- `game-error`
- `host-error`
- `admin-error`
- `admin-init-response`
- `quiz-list-updated`
- `quiz-saved`
- `quiz-deleted`
- `quiz-activated`

**Fichiers associés :**

- `/bootstrap/dist/css/bootstrap.min.css`
- Bootstrap Icons (CDN)
- `/css/custom.css`
- `/bootstrap/dist/js/bootstrap.bundle.min.js`
- `/socket.io/socket.io.js`
- `script.js`

---

### `/play` et `/play/:sessionCode` — `public/play/index.html` + `public/play/script.js`

**Destinée à :** Joueur (spectateur en salle de cinéma, sur mobile)

**Éléments d'interface :**

- Écran de saisie du code session (champ texte + bouton « Jouer »)
- Écran de saisie du pseudonyme (champ texte + bouton « Jouer »)
- Écran d'attente (loader SVG + message)
- Écran de question (timer circulaire SVG + boutons d'options colorés)
- Écran de résultat de réponse (correct/incorrect, points gagnés, score total)
- Écran final (position dans le classement, score, formulaire email si gagnant)

**Actions utilisateur :**

- Entrer le code de session
- Entrer son pseudonyme
- Sélectionner une réponse (clic sur une option)
- Soumettre son email (si gagnant)

**Events Socket.IO émis :**

- `verify-session`
- `player-join`
- `player-answer`
- `submit-winner-email`

**Events Socket.IO reçus :**

- `session-verified`
- `session-invalid`
- `join-error`
- `join-success`
- `game-started` (non explicitement écouté, le flux passe par `new-question`)
- `new-question`
- `timer-update`
- `time-up`
- `answer-result`
- `question-results`
- `game-end`
- `game-reset`
- `email-success`
- `email-error`

**Fichiers associés :**

- `/bootstrap/dist/css/bootstrap.min.css`
- `/css/custom.css`
- `/bootstrap/dist/js/bootstrap.bundle.min.js`
- `/socket.io/socket.io.js`
- `script.js`

---

### `/screen` — `public/screen/index.html` + `public/screen/script.js`

**Destinée à :** Écran de cinéma (projection grand écran)

**Éléments d'interface :**

- Bouton « Activer le son » (en haut à droite)
- Écran d'attente : URL du quiz, code session, QR code généré dynamiquement, grille des joueurs connectés
- Écran de question : timer circulaire SVG, texte de la question, options animées (apparition séquentielle), badges des joueurs qui ont répondu
- Conteneur d'explication (overlay fixe animé)
- Écran de résultats : tableau des scores trié
- Écran final : nom du gagnant, classement complet
- Éléments audio : son nouvelle question, musique de fond (loop), sons par option, son bonne réponse

**Actions utilisateur :**

- Cliquer sur « Activer le son » pour débloquer l'autoplay audio du navigateur

**Events Socket.IO émis :**

- `screen-join`

**Events Socket.IO reçus :**

- `game-setup`
- `player-joined`
- `player-left`
- `game-started`
- `new-question`
- `player-answer`
- `timer-update` (non explicitement écouté dans le code — le timer est géré localement)
- `question-results`
- `game-end`
- `game-reset`

**Fichiers associés :**

- `/bootstrap/dist/css/bootstrap.min.css`
- `/css/custom.css`
- CSS inline dans `<style>` (styles spécifiques screen)
- `/bootstrap/dist/js/bootstrap.bundle.min.js`
- `/socket.io/socket.io.js`
- `qrcode-generator@1.4.4` (CDN jsdelivr)
- `script.js`
- Fichiers audio : `mysterious-B.mp3`, `chasin-fireflies.mp3`, `option-0.mp3`, `sparkly-A.mp3`

---

## Section 4 — Routes HTTP (backend)

| Méthode | Chemin               | Description                                    | Auth          | Body                                     | Réponse                                 |
| ------- | -------------------- | ---------------------------------------------- | ------------- | ---------------------------------------- | --------------------------------------- |
| GET     | `/`                  | Redirige vers `/host`                          | Non           | —                                        | 302 → `/host`                           |
| GET     | `/login`             | Sert la page de login                          | Non           | —                                        | HTML                                    |
| POST    | `/auth`              | Traite le formulaire de login                  | Non           | `username`, `password` (form urlencoded) | 302 → `/host` ou 302 → `/login?error=1` |
| GET     | `/logout`            | Détruit la session et redirige                 | Non           | —                                        | 302 → `/login`                          |
| GET     | `/host`              | Sert l'interface hôte/admin                    | Oui (session) | —                                        | HTML                                    |
| GET     | `/play`              | Sert l'interface joueur                        | Non           | —                                        | HTML                                    |
| GET     | `/play/:sessionCode` | Sert l'interface joueur (avec code pré-rempli) | Non           | —                                        | HTML (même fichier que `/play`)         |
| GET     | `/screen`            | Sert l'écran de présentation                   | Non           | —                                        | HTML                                    |
| GET     | `/admin`             | Redirige vers `/host`                          | Oui (session) | —                                        | 302 → `/host`                           |
| GET     | `/api/session`       | Retourne le code de session courant            | Oui (session) | —                                        | JSON `{ sessionCode: "..." }`           |

---

## Section 5 — Events Socket.IO

### Client → Serveur

| Event                  | Émetteur     | Payload                                                   | Room                  | Description                                            |
| ---------------------- | ------------ | --------------------------------------------------------- | --------------------- | ------------------------------------------------------ |
| `host-join`            | host         | —                                                         | Rejoint `host-room`   | Enregistre le socket comme hôte, renvoie `game-setup`  |
| `screen-join`          | screen       | —                                                         | Rejoint `screen-room` | Enregistre le socket comme écran, renvoie `game-setup` |
| `verify-session`       | player       | `{ sessionCode }`                                         | —                     | Vérifie si le code session est valide                  |
| `player-join`          | player       | `{ playerName, sessionCode }`                             | Rejoint `game-room`   | Inscrit le joueur dans la session                      |
| `start-game`           | host         | —                                                         | —                     | Démarre la partie (vérifie auth + joueurs présents)    |
| `player-answer`        | player       | `{ playerId, answerIndex }`                               | —                     | Soumet une réponse à la question courante              |
| `next-question`        | host         | —                                                         | —                     | Passe à la question suivante                           |
| `question-timer-ended` | host         | —                                                         | —                     | Force la fin du timer de la question courante          |
| `new-game`             | host         | —                                                         | —                     | Réinitialise la session (nouveau code, joueurs vidés)  |
| `admin-init`           | host (admin) | —                                                         | —                     | Demande la liste des quiz + init admin                 |
| `get-quizzes`          | host (admin) | —                                                         | —                     | Demande la liste des quiz                              |
| `get-quiz-list`        | host (admin) | —                                                         | —                     | Demande la liste des quiz (variante)                   |
| `save-quiz`            | host (admin) | `{ id?, name, description, questions }`                   | —                     | Crée ou met à jour un quiz                             |
| `create-quiz`          | host (admin) | `{ quiz: { id?, name, description, questions, active } }` | —                     | Crée un quiz                                           |
| `update-quiz`          | host (admin) | `{ quiz: { id, name, description, questions } }`          | —                     | Met à jour un quiz existant                            |
| `activate-quiz`        | host (admin) | `{ id }`                                                  | —                     | Active un quiz (désactive les autres)                  |
| `delete-quiz`          | host (admin) | `{ id }`                                                  | —                     | Supprime un quiz                                       |
| `submit-winner-email`  | player       | `{ playerId, email }`                                     | —                     | Soumet l'email du gagnant pour recevoir le lot         |

### Serveur → Client

| Event                 | Destinataire                      | Payload                                                                              | Description                                           |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `game-setup`          | host, screen                      | `{ sessionCode, playerCount, questions, appVersion, isAdmin?, username?, baseUrl? }` | Configuration initiale à la connexion                 |
| `session-verified`    | player                            | `{ success: true }`                                                                  | Code session valide                                   |
| `session-invalid`     | player                            | `{ error }`                                                                          | Code session invalide                                 |
| `join-success`        | player                            | `{ playerId, playerName }`                                                           | Joueur inscrit avec succès                            |
| `join-error`          | player                            | `{ error }`                                                                          | Erreur lors de l'inscription                          |
| `player-joined`       | host-room, screen-room            | `{ playerId, playerName, playerCount }`                                              | Un joueur a rejoint                                   |
| `player-left`         | host-room, screen-room            | `{ playerId, playerName, playerCount }`                                              | Un joueur est parti                                   |
| `game-started`        | game-room, screen-room, host-room | —                                                                                    | La partie commence                                    |
| `new-question`        | game-room, host-room, screen-room | `{ questionNumber, totalQuestions, question, options, timeLimit, correctIndex? }`    | Nouvelle question (correctIndex uniquement pour host) |
| `timer-update`        | game-room, host-room, screen-room | `{ timeLeft }`                                                                       | Mise à jour du timer (chaque seconde)                 |
| `time-up`             | game-room, host-room, screen-room | —                                                                                    | Temps écoulé pour la question                         |
| `answer-result`       | player (unicast)                  | `{ isCorrect, pointsEarned, totalScore }`                                            | Résultat de la réponse du joueur                      |
| `player-answer`       | host-room, screen-room            | `{ playerId, playerName, answerIndex }`                                              | Un joueur a répondu (pour affichage)                  |
| `question-results`    | game-room, host-room, screen-room | `{ correctIndex, correctAnswer?, explanation, scores, playerAnswers? }`              | Résultats de la question                              |
| `game-end`            | game-room, host-room, screen-room | `{ winner, leaderboard }`                                                            | Fin de la partie                                      |
| `game-reset`          | host-room, game-room, screen-room | `{ sessionCode }` (host/screen) ou `{}` (game-room)                                  | Réinitialisation de la session                        |
| `game-error`          | host (unicast)                    | `{ error }`                                                                          | Erreur de jeu                                         |
| `host-error`          | host (unicast)                    | `{ error }`                                                                          | Erreur d'authentification hôte                        |
| `admin-error`         | host (unicast)                    | `{ error }`                                                                          | Erreur d'administration                               |
| `admin-init-response` | host (unicast)                    | `{ success, quizzes?, appVersion?, error? }`                                         | Réponse à l'init admin                                |
| `quizzes-list`        | host (unicast)                    | `{ quizzes }`                                                                        | Liste des quiz                                        |
| `quiz-list-updated`   | host (unicast)                    | `{ quizzes }`                                                                        | Liste des quiz mise à jour                            |
| `quiz-saved`          | host (unicast)                    | `{ success, message, quizId? }`                                                      | Résultat de la sauvegarde                             |
| `quiz-created`        | host (unicast)                    | `{ success, quizId?, error? }`                                                       | Résultat de la création                               |
| `quiz-updated`        | host (unicast)                    | `{ success, error? }`                                                                | Résultat de la mise à jour                            |
| `quiz-activated`      | host (unicast)                    | `{ success, message? }`                                                              | Résultat de l'activation                              |
| `quiz-deleted`        | host (unicast)                    | `{ success, message? }`                                                              | Résultat de la suppression                            |
| `email-success`       | player (unicast)                  | `{ message }`                                                                        | Email envoyé avec succès                              |
| `email-error`         | player (unicast)                  | `{ error }`                                                                          | Erreur d'envoi d'email                                |

---

## Section 6 — Déroulé d'une session de quizz, étape par étape

### 1. Création de la session

- **Qui :** Le serveur, automatiquement au démarrage.
- **Comment :** À l'initialisation de `server.js`, l'objet `gameState` est créé avec un `sessionCode` généré par `generateSessionCode()` (6 chiffres aléatoires).
- **Fichier :** `server.js` ligne 182-191.
- **Effets DB :** Aucun. La session n'est pas persistée.
- **Socket.IO :** Aucun à ce stade.

### 2. Affichage du QR code sur l'écran cinéma

- **L'écran `/screen` se connecte** et émet `screen-join`.
- **Le serveur** renvoie `game-setup` avec `sessionCode` et `baseUrl`.
- **Côté client (`public/screen/script.js`)** : l'URL `${baseUrl}/play/${sessionCode}` est construite. Le QR code est généré **côté client** via la librairie `qrcode-generator` (CDN). Le QR est affiché sous forme d'image (`qr.createImgTag(20)`).
- **Fichiers :** `public/screen/script.js` lignes 153-184, `server.js` lignes 278-289.

### 3. Inscription d'un joueur

1. Le joueur scanne le QR code → ouvre `/play/123456` sur son téléphone.
2. `public/play/script.js` détecte le code dans l'URL (`checkSessionCodeInUrl()`), émet `verify-session`.
3. Le serveur vérifie le code, renvoie `session-verified`.
4. Le joueur voit l'écran de saisie du pseudonyme, tape son nom, clique « Jouer ».
5. Le client émet `player-join` avec `{ playerName, sessionCode }`.
6. Le serveur génère un UUID (`playerId`), enregistre le joueur dans `gameState.players`, initialise son score à 0, le fait rejoindre `game-room`.
7. Le serveur renvoie `join-success` au joueur et `player-joined` à `host-room` + `screen-room`.
8. L'écran et l'hôte affichent le nouveau joueur dans leur liste.

**Fichiers :** `public/play/script.js` lignes 59-135, `server.js` lignes 293-358.

### 4. Démarrage du quizz

- **Qui :** L'hôte, depuis l'interface `/host`, en cliquant « Démarrer le quiz ».
- **Conditions :** L'hôte doit être authentifié (vérifié par `isHostSocket()`). Il faut au moins 1 joueur connecté. Il faut un quiz actif chargé.
- **Le client** émet `start-game`.
- **Le serveur** met `gameState.isActive = true`, réinitialise les scores, émet `game-started` aux trois rooms, puis appelle `nextQuestion()`.
- **Fichiers :** `server.js` lignes 361-395.

### 5. Affichage d'une question

- **La fonction `nextQuestion()`** incrémente `currentQuestionIndex`, récupère la question courante, émet `new-question` aux trois rooms avec les données de la question.
- **L'hôte** reçoit en plus `correctIndex`.
- **Le timer** est démarré côté serveur via `startTimer(seconds)` (setInterval de 1s).
- **Synchronisation :** Le serveur envoie `timer-update` chaque seconde aux trois rooms. Les clients se synchronisent sur cette valeur reçue.
- **Sur l'écran** : les options apparaissent séquentiellement (1 par seconde, via setTimeout côté client).
- **Fichiers :** `server.js` lignes 742-784 (nextQuestion), 786-826 (startTimer). `public/screen/script.js` lignes 225-295.

### 6. Soumission d'une réponse

- **Le joueur** clique sur une option → le client émet `player-answer` avec `{ playerId, answerIndex }`.
- **Validations serveur :** jeu actif, joueur existant, answerIndex valide, pas de double réponse (vérifié via `currentQuestion.playerAnswers[playerId]`).
- **Calcul des points :** Si correct, `points = max(Math.round(1000 * (timeLeft / totalTime)), 500)`. Si incorrect, 0.
- **Persistance :** La réponse est stockée dans `currentQuestion.playerAnswers` (en mémoire uniquement).
- **Le serveur** envoie `answer-result` au joueur (unicast) et `player-answer` à host-room + screen-room.
- **Fichiers :** `server.js` lignes 398-473.

### 7. Affichage du résultat de la question

- **Quand le timer atteint 0** (ou que l'hôte force la fin via `question-timer-ended`) :
  1. Le serveur émet `time-up` aux trois rooms.
  2. Après un délai de 1 seconde, `sendQuestionResults()` est appelée.
  3. Le serveur émet `question-results` aux trois rooms avec `correctIndex`, `explanation`, `scores`, `playerAnswers`.
- **Sur l'écran :** la bonne option passe en vert (classe `correct`), l'explication apparaît en overlay pendant 10 secondes, puis le classement s'affiche.
- **Fichiers :** `server.js` lignes 828-883. `public/screen/script.js` lignes 313-382.

### 8. Passage à la question suivante

- **Déclenchement :** Manuel, par l'hôte. L'hôte clique « Question suivante » → émet `next-question` → le serveur appelle `nextQuestion()`.
- **Pas d'auto-avancement.** L'hôte contrôle le rythme entre les questions.
- **Fichiers :** `server.js` lignes 477-482. `public/host/script.js` lignes 317-319.

### 9. Fin de partie

- **Quand :** `nextQuestion()` détecte que `currentQuestionIndex >= questions.length`.
- **`endGame()` est appelée :**
  1. `gameState.isActive = false`.
  2. Le leaderboard est trié par score décroissant (en cas d'égalité, tri alphabétique par playerId).
  3. Le résultat est enregistré en DB via `addGameToHistory()`.
  4. `game-end` est émis aux trois rooms avec `{ winner, leaderboard }`.
- **Sur l'écran :** Affichage du nom du gagnant et du classement final.
- **Fichiers :** `server.js` lignes 885-933.

### 10. Envoi du lot au gagnant

- **Qui déclenche :** Le joueur gagnant lui-même, depuis l'écran final sur son téléphone.
- **Parcours :** Le joueur arrivé 1er voit un formulaire « Laissez-nous votre e-mail ». Il saisit son email et clique « Recevoir mon cadeau ».
- **Le client** émet `submit-winner-email` avec `{ playerId, email }`.
- **Le serveur** vérifie que le joueur est bien le gagnant (`pickTopPlayerId()`), puis appelle `sendWinnerEmail()`.
- **`sendWinnerEmail()`** utilise l'API transactionnelle Brevo pour envoyer un email HTML inline (pas de template Brevo, tout est dans le code `config/email.js`).
- **Contenu de l'email :** Félicitations + score + message que le lot sera attribué prochainement. **Pas de QR code de lot généré.**
- **Fichiers :** `server.js` lignes 712-738. `config/email.js` lignes 20-54. `public/play/script.js` lignes 138-156.

---

## Section 7 — Logique de scoring

**Emplacement :** `server.js`, lignes 429-445 (dans le handler `player-answer`).

**Algorithme :**

1. Si la réponse est **incorrecte** : 0 point.
2. Si la réponse est **correcte** :
   - Calcul proportionnel au temps restant : `points = Math.round(1000 * (timeLeft / totalTime))`
   - Où `totalTime` = timer de la question (par défaut 20s, configurable par question).
   - Plancher minimum : `Math.max(points, 500)`.
   - Donc un joueur qui répond correctement obtient entre 500 et 1000 points.

**En résumé :**

- Réponse rapide et correcte : ~1000 points.
- Réponse lente mais correcte : 500 points (minimum garanti).
- Réponse incorrecte : 0 point.
- Pas de malus pour absence de réponse.

Les scores sont cumulés dans `gameState.scores[playerId]` au fil des questions.

---

## Section 8 — Auth et gestion des utilisateurs

### Qui peut se connecter

Deux niveaux de droits :

1. **Admin** (`is_admin = true`) : Accès à l'onglet « Gestion QUIZ » (CRUD quiz) + toutes les fonctions hôte.
2. **Hôte** (`is_admin = false`) : Accès uniquement à l'onglet « Quiz ACTIF » (contrôle de la session).

Les joueurs ne s'authentifient pas — ils donnent juste un pseudonyme.

### Fonctionnement de l'auth

- **Mécanisme :** `express-session` avec cookies. Store en mémoire par défaut (MemoryStore d'Express).
- **Hash :** `bcrypt` avec un salt de 10 rounds sur le champ `password_hash` de la table `quiz_host_credentials`.
- **Flux :** POST `/auth` → `verifyCredentials(username, password)` → comparaison bcrypt → si OK, `req.session.user = { id, username, isAdmin }` → redirect `/host`.
- **Protection des routes :** Middleware `requireAuth` qui vérifie `req.session.user`. Si absent, redirect vers `/login`.
- **Socket.IO :** Le middleware de session est partagé avec Socket.IO. Chaque socket a accès à `socket.request.session.user`. Les fonctions `isHostSocket()` et `isAdminSocket()` vérifient les droits pour les events.
- **Cookie :** `maxAge: 3600000` (1h), `httpOnly: true`, `secure` conditionnel (prod ou env var).

### Distinction des rôles

Le champ `is_admin` en DB (BOOLEAN). Au login, la valeur est chargée dans la session. L'onglet admin est masqué côté client si `isAdmin === false` (envoyé dans `game-setup`). Les events admin sont protégés côté serveur par `isAdminSocket()`.

### Inscription

Pas de parcours d'inscription public. Le compte `admin/admin123` est créé automatiquement à la première initialisation si la table est vide. Les autres comptes doivent être créés manuellement en base.

---

## Section 9 — Gestion des sessions de jeu (état serveur)

### Où l'état est stocké

**Intégralement en mémoire**, dans l'objet global `gameState` :

```javascript
let gameState = {
  isActive: false,
  currentQuestionIndex: -1,
  scores: {},
  players: {},
  sessionCode: generateSessionCode(),
  timePerQuestion: 20,
  timer: null,
  activeQuiz: null,
};
```

Les réponses des joueurs sont aussi en mémoire, dans `currentQuestion.playerAnswers`.

### Comment le serveur associe joueur/session

Chaque joueur est identifié par un UUID (`playerId`) stocké dans `gameState.players`. Le mapping avec le socket se fait via `gameState.players[playerId].socketId`. Il n'y a qu'une seule session de jeu à la fois sur tout le serveur — pas de multi-session.

### Que se passe-t-il si un joueur rafraîchit sa page

Le socket se déconnecte → le handler `disconnect` supprime le joueur de `gameState.players` et `gameState.scores`. Le joueur perd sa participation. Il devrait se réinscrire mais si le jeu est en cours (`isActive && currentQuestionIndex >= 0`), le serveur refuse la reconnexion. **Rien n'est prévu pour la reconnexion.**

### Que se passe-t-il si l'écran cinéma se déconnecte

Le socket quitte `screen-room`. Si l'écran se reconnecte, il émet à nouveau `screen-join` et reçoit `game-setup` avec le code session et le nombre de joueurs. Mais il perd tout contexte de la question en cours — il ne verra pas la question courante ni les réponses déjà soumises. **Pas de mécanisme de rattrapage.**

### Que se passe-t-il si le serveur Node redémarre

**Tout est perdu.** L'objet `gameState` est réinitialisé. Un nouveau `sessionCode` est généré. Les joueurs connectés sont déconnectés. La partie en cours est irrémédiablement perdue. Seul l'historique déjà écrit en DB persiste.

---

## Section 10 — Génération de QR codes et envois email

### QR code de session

- **Qui génère :** Le client (page `/screen`), dans le navigateur.
- **Bibliothèque :** `qrcode-generator@1.4.4` chargée via CDN (`cdn.jsdelivr.net`).
- **Données encodées :** L'URL `${baseUrl}/play/${sessionCode}`.
- **Format :** Image tag (`<img>`) générée par `qr.createImgTag(20)`, correction d'erreur niveau L.
- **Le package npm `qrcode` est installé mais non utilisé dans le code.**

### QR code de lot gagnant

**Inexistant.** Aucun QR code de lot n'est généré. L'email au gagnant ne contient qu'un message texte.

### Emails

- **Provider :** Brevo (anciennement Sendinblue), via le SDK `@getbrevo/brevo`.
- **Template :** HTML inline dans `config/email.js`. Pas de template Brevo, pas de template externe.
- **Quand :** Uniquement quand le gagnant soumet son email depuis l'écran final sur son téléphone.
- **Contenu :** Félicitations + nom du joueur + nom du quiz + score + message promettant un lot « prochainement ».
- **Expéditeur :** `process.env.SENDER_EMAIL` avec le nom "Quiz Master".
- **Aucun autre email n'est envoyé** (pas de confirmation d'inscription, pas de récapitulatif, etc.).

---

## Section 11 — Ce qui est déployé en prod aujourd'hui

### GitHub Actions

Fichier : `.github/workflows/deploy.yml`

**Déclencheur :** Push sur la branche `master`.

**Processus :**

1. Checkout du code.
2. Configuration SSH via `webfactory/ssh-agent`.
3. Connexion SSH au VPS (`secrets.VPS_USER@secrets.VPS_HOST`).
4. Sur le VPS :
   - `cd` vers le chemin du projet (`secrets.PROJECT_PATH`).
   - Mise à jour du `SESSION_SECRET` dans `.env` (via base64 du secret GitHub).
   - `git stash` + `git pull --no-rebase origin master`.
   - `npm install`.
   - `pm2 restart quiz-app` (ou `pm2 start npm --name 'quiz-app' -- start` si pas encore lancé).

### Dockerfile / docker-compose

**Aucun.** Pas de conteneurisation.

### Hébergement

- VPS avec accès SSH.
- Process manager : **pm2** (nom du process : `quiz-app`).
- Pas de fichier `ecosystem.config.js` ni `pm2.json` dans le repo.
- Pas de configuration nginx/caddy dans le repo (mais les variables `TRUST_PROXY` et `SESSION_COOKIE_SECURE` suggèrent qu'un reverse proxy peut être placé devant).

### Base de données de prod

Référencée via les variables d'environnement (`.env` sur le VPS). Le `.env` présent dans le repo est un fichier local de développement/template (contient `DB_HOST=localhost`). Le domaine public semble être `demo.uxii.fr` (valeur par défaut de `BASE_URL` dans `server.js`).

---

## Section 12 — Zones grises et incertitudes

### Package npm `qrcode` non utilisé

Le package `qrcode` (serveur-side) est listé dans `package.json` mais aucune utilisation n'est trouvée dans le code. La génération de QR code se fait côté client via une lib CDN différente (`qrcode-generator`). À clarifier : vestige d'une ancienne implémentation ou usage prévu futur.

### Table `questions` : usage réel

La table `questions` est peuplée au premier démarrage depuis `data/questions.json`, puis les questions sont copiées dans un quiz par défaut (table `quizzes`, colonne `questions` en JSON). Après ce seed initial, la table `questions` ne semble plus lue ni écrite par le flux normal de l'application. Les méthodes `getQuestions()`, `addQuestion()`, `updateQuestion()`, `deleteQuestion()` dans `database.js` existent mais ne sont appelées nulle part dans `server.js`. Possiblement du code mort ou prévu pour une future fonctionnalité.

### Fichier `data/quizzes.json`

Ce fichier existe et contient un quiz par défaut, mais il n'est jamais lu par le code serveur (seul `data/questions.json` est lu lors de l'init). Son rôle est non clair — possiblement un export manuel ou un vestige.

### Double émission de `host-join`

Dans `public/host/script.js`, `socket.emit('host-join')` est appelé **deux fois** : une fois à la ligne 79 et une fois à la ligne 735. Cela provoque deux handlers `game-setup` exécutés à la connexion initiale.

### Zone de démo dans l'interface host

Un bloc « Zone de démo » est présent dans `public/host/index.html` (lignes 187-194) avec un bouton de test. Aucun code JS ne semble y être attaché. Rôle non clair.

### Event `game-started` côté joueur

Le joueur écoute `game-started` dans son client (non visible explicitement dans le code — le listener existe mais le commentaire dans le code source de `play/script.js` ne montre pas de handler dédié). En pratique le flux passe directement par `new-question` qui affiche l'écran de question.

### Events dupliqués pour le CRUD quiz

Il existe des events redondants pour le même usage :

- `get-quizzes` et `get-quiz-list` font la même chose.
- `create-quiz` et `save-quiz` (sans id) font la même chose.
- `update-quiz` et `save-quiz` (avec id) font la même chose.
  À clarifier : deux versions du code qui cohabitent.

### Variable `timer` dans les questions

Chaque question peut avoir un champ `timer` personnalisé (configurable dans l'éditeur admin, entre 5 et 120 secondes). Si absent, `gameState.timePerQuestion` (20s) est utilisé. Ce champ est stocké dans le JSON des questions en DB.

### Fonction `loadHistory()` non utilisée

`config/history.js` exporte `loadHistory()` mais cette fonction n'est jamais appelée dans `server.js`. L'historique est écrit mais jamais lu côté serveur (pas d'interface d'affichage de l'historique).

### Fonction `saveGameResults()` non utilisée

Dans `database.js`, la méthode `saveGameResults()` contient un simple `console.log` et renvoie `true`. Code placeholder jamais branché.

### Commentaire « Collecte des emails des joueurs » dans le README

Le README mentionne que « chaque joueur doit fournir son email en plus de son nom ». Ce n'est **pas** le cas dans le code actuel — seul le gagnant peut fournir son email en fin de partie. Le README est désynchronisé du code.

### Gestion de l'égalité en fin de partie

En cas d'égalité de score entre deux joueurs, le gagnant est déterminé par tri alphabétique de `playerId` (UUID). Ce comportement est dans `pickTopPlayerId()` (`tied.sort()[0]`). Résultat déterministe mais arbitraire.

### Absence de validation HTTPS pour les QR codes

`BASE_URL` a pour défaut `https://demo.uxii.fr` dans `server.js` (ligne 43) mais le `.env` local le définit à `http://localhost:3000`. Le QR code encode l'URL complète — si la config est incorrecte, le QR code pointe vers une URL inaccessible.

### Pas de rate-limiting ni protection anti-spam

Aucune protection contre le spam de connexions joueurs, de réponses multiples (protégé par la logique applicative mais pas par un rate-limit réseau), ou de tentatives de login.

### Session store en mémoire

`express-session` utilise le `MemoryStore` par défaut. En production, cela signifie :

- Les sessions sont perdues au redémarrage.
- Risque de fuite mémoire à long terme (warning dans la doc express-session).

### TODO / FIXME / Commentaires développeur

Aucun `TODO` ni `FIXME` trouvé dans le code.

### Vidéo de fond commentée

Deux vidéos de fond sont commentées en HTML dans `public/play/index.html` et `public/screen/index.html`. URLs : `../css/img/2646392-sd_640_360_30fps.mp4` (locale) et `https://theparisian.fr/FTP/QUIZZ/src/138553-769988105.mp4` (distante). Fonctionnalité désactivée mais le code reste.

### Image de fond CSS externe

`custom.css` référence une image de fond hébergée sur un serveur externe : `https://theparisian.fr/FTP/QUIZZ/src/bg-repeat.jpg`. Dépendance à un serveur tiers.
