const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const QRCode = require('qrcode');
require('dotenv').config();
const { initDatabase } = require('./config/database');
const { verifyCredentials, requireAuth } = require('./config/auth');
const { sendWinnerEmail } = require('./config/email');
const { addGameToHistory } = require('./config/history');
const { v4: uuidv4 } = require('uuid');
const { 
  getActiveQuiz, 
  getAllQuizzes, 
  createQuiz, 
  updateQuiz, 
  activateQuiz, 
  deleteQuiz 
} = require('./config/database');

// Récupération de la version depuis package.json
const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const appVersion = packageInfo.version;

// URL de base du site (pour les QR codes)
const baseUrl = process.env.BASE_URL || 'https://demo.uxii.fr';

// Initialisation de l'application Express
const app = express();
const server = http.createServer(app);

// Configuration des sessions
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'quiz-master-secret-key',
  resave: true, // Forcer la sauvegarde même si la session n'a pas changé
  saveUninitialized: true, // Sauvegarder les sessions non initialisées
  cookie: { 
    maxAge: 3600000, // 1 heure
    httpOnly: true,
    secure: false // Mettre à true en production si HTTPS
  }
});

app.use(sessionMiddleware);

// Initialisation de Socket.IO avec accès aux sessions
const io = socketIO(server, {
    cors: {
        origin: true,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware pour permettre à Socket.IO d'accéder à la session Express
io.use((socket, next) => {
  // Appliquer le middleware de session
  sessionMiddleware(socket.request, {}, () => {
    // Vérifier que la session est chargée
    if (socket.request.session) {
      console.log('Session chargée dans Socket.IO:', { 
        id: socket.request.session.id,
        hasUser: !!socket.request.session.user,
        isAdmin: socket.request.session.user ? !!socket.request.session.user.isAdmin : false
      });
      next();
    } else {
      console.error('Pas de session disponible dans Socket.IO');
      next(new Error('Session non disponible'));
    }
  });
});

// Middleware pour parser les formulaires
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Dossiers statiques
app.use(express.static(path.join(__dirname, 'public')));
// Exposer les dépendances nécessaires
app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap')));

// Initialiser la base de données au démarrage
initDatabase().catch(err => {
  console.error('Erreur lors de l\'initialisation de la base de données:', err);
});

// Routes
app.get('/', (req, res) => {
  res.redirect('/host');
});

// Page de login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/login/index.html'));
});

// Traitement du formulaire d'authentification
app.post('/auth', async (req, res) => {
  const { username, password } = req.body;
  
  // Vérifier les identifiants
  console.log('Tentative de connexion:', username);
  const user = await verifyCredentials(username, password);
  console.log('Utilisateur trouvé:', user);
  
  if (user) {
    // Stocker l'utilisateur dans la session
    req.session.user = user;
    
    // Forcer la sauvegarde de la session
    req.session.save(err => {
      if (err) {
        console.error('Erreur lors de la sauvegarde de la session:', err);
      }
      
      // Rediriger vers la page host dans tous les cas
      res.redirect('/host');
    });
  } else {
    res.redirect('/login?error=1');
  }
});

// Route de déconnexion
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Route protégée
app.get('/host', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/host/index.html'));
});

app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/play/index.html'));
});

// Route pour rejoindre un quiz directement avec un code de session
app.get('/play/:sessionCode', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/play/index.html'));
});

// Nouvelle route pour l'interface screen
app.get('/screen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/screen/index.html'));
});

// Nouvelle route pour l'interface admin
app.get('/admin', requireAuth, (req, res) => {
  // Rediriger vers la page host, qui contient maintenant les fonctionnalités admin
  res.redirect('/host');
});

// API pour obtenir une nouvelle session (utile pour intégration future)
app.get('/api/session', requireAuth, (req, res) => {
  res.json({ sessionCode: gameState.sessionCode });
});

// États du jeu
let gameState = {
  isActive: false,
  currentQuestionIndex: -1,
  scores: {},
  players: {},
  sessionCode: generateSessionCode(),
  timePerQuestion: 20, // secondes
  timer: null,
  activeQuiz: null
};

// Chargement initial du quiz actif
async function loadActiveQuiz() {
  gameState.activeQuiz = await getActiveQuiz();
  return gameState.activeQuiz;
}

// Charger initialement le quiz actif
loadActiveQuiz().catch(err => {
  console.error('Erreur lors du chargement du quiz actif:', err);
});

function generateSessionCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
  console.log('Nouvelle connexion:', socket.id);

  // Quand un hôte se connecte
  socket.on('host-join', async () => {
    socket.join('host-room');
    
    // S'assurer que le quiz actif est chargé
    gameState.activeQuiz = await getActiveQuiz();
    
    // Récupérer la session
    const session = socket.request.session;
    const isAdmin = !!(session && session.user && session.user.isAdmin);
    const username = session && session.user ? session.user.username : 'Non connecté';
    
    socket.emit('game-setup', { 
      sessionCode: gameState.sessionCode,
      playerCount: Object.keys(gameState.players).length,
      questions: gameState.activeQuiz.questions.map(q => ({
        question: q.question,
        options: q.options
      })),
      appVersion: appVersion,
      isAdmin: isAdmin,
      username: username
    });
  });

  // Quand un écran de présentation se connecte
  socket.on('screen-join', async () => {
    socket.join('screen-room');
    
    // S'assurer que le quiz actif est chargé
    gameState.activeQuiz = await getActiveQuiz();
    
    socket.emit('game-setup', { 
      sessionCode: gameState.sessionCode,
      playerCount: Object.keys(gameState.players).length,
      questions: gameState.activeQuiz.questions.map(q => ({
        question: q.question,
        options: q.options
      })),
      appVersion: appVersion,
      baseUrl: baseUrl
    });
  });

  // Quand un joueur tente de vérifier un code de session
  socket.on('verify-session', (data) => {
    const { sessionCode } = data;
    
    // Vérifier si le code de session est valide
    if (sessionCode !== gameState.sessionCode) {
      return socket.emit('session-invalid', { error: 'Code de session invalide' });
    }
    
    // Vérifier si un jeu est déjà en cours
    if (gameState.isActive && gameState.currentQuestionIndex >= 0) {
      return socket.emit('session-invalid', { error: 'Un quiz est déjà en cours, veuillez attendre le prochain' });
    }
    
    // Le code est valide
    socket.emit('session-verified', { success: true });
  });

  // Quand un joueur tente de rejoindre
  socket.on('player-join', (data) => {
    const { playerName, sessionCode } = data;
    
    // Vérifier si le code de session est valide
    if (sessionCode !== gameState.sessionCode) {
      return socket.emit('join-error', { error: 'Code de session invalide' });
    }
    
    // Vérifier si un jeu est déjà en cours
    if (gameState.isActive && gameState.currentQuestionIndex >= 0) {
      return socket.emit('join-error', { error: 'Un quiz est déjà en cours, veuillez attendre le prochain' });
    }
    
    // Générer un ID unique pour le joueur
    const playerId = uuidv4();

    // Enregistrer le joueur
    gameState.players[playerId] = {
      id: playerId,
      name: playerName,
      socketId: socket.id
    };
    
    // Initialiser le score du joueur
    gameState.scores[playerId] = 0;
    
    // Rejoindre la salle de jeu
    socket.join('game-room');
    
    // Dire au joueur que tout s'est bien passé
    socket.emit('join-success', { 
      playerId,
      playerName
    });
    
    // Informer l'hôte et l'écran qu'un nouveau joueur a rejoint
    io.to('host-room').emit('player-joined', {
      playerId,
      playerName,
      playerCount: Object.keys(gameState.players).length
    });
    
    io.to('screen-room').emit('player-joined', {
      playerId,
      playerName,
      playerCount: Object.keys(gameState.players).length
    });
  });

  // Quand un hôte démarre le jeu
  socket.on('start-game', async () => {
    // Vérifier que le quiz actif est chargé
    if (!gameState.activeQuiz) {
      gameState.activeQuiz = await getActiveQuiz();
      if (!gameState.activeQuiz) {
        return socket.emit('game-error', { error: 'Aucun quiz actif disponible' });
      }
    }
    
    // Vérifier qu'il y a au moins un joueur
    if (Object.keys(gameState.players).length === 0) {
      return socket.emit('game-error', { error: 'Aucun joueur connecté' });
    }

    // Indiquer que le jeu est actif
    gameState.isActive = true;
    gameState.currentQuestionIndex = -1;
    
    // Réinitialiser les scores
    for (const playerId in gameState.scores) {
      gameState.scores[playerId] = 0;
    }
    
    // Informer tous les joueurs que le jeu a commencé
    io.to('game-room').emit('game-started');
    io.to('screen-room').emit('game-started');
    io.to('host-room').emit('game-started');
    
    // Passer à la première question
    nextQuestion();
  });

  // Quand un joueur répond à une question
  socket.on('player-answer', (data) => {
    // Vérifier que le jeu est actif
    if (!gameState.isActive) {
      return;
    }
    
    const { playerId, answerIndex } = data;
    
    // Vérifier que le joueur existe
    if (!gameState.players[playerId]) {
      return;
    }
    
    const currentQuestion = gameState.activeQuiz.questions[gameState.currentQuestionIndex];
    
    // Vérifier si la réponse est correcte
    const isCorrect = answerIndex === currentQuestion.correctIndex;
    
    // Calculer les points en fonction du temps restant
    let pointsEarned = 0;
    if (isCorrect) {
      // Si le timer est toujours en cours, les points dépendent du temps restant
      if (gameState.timer) {
        const timeRatio = Math.max(0, gameState.timeLeft / (currentQuestion.timer || gameState.timePerQuestion));
        pointsEarned = Math.round(1000 * timeRatio);
      }
      // Points minimum si la réponse est correcte
      pointsEarned = Math.max(pointsEarned, 500);
      
      // Mettre à jour le score
      gameState.scores[playerId] += pointsEarned;
    }
    
    // Enregistrer la réponse du joueur pour les statistiques
    if (!currentQuestion.playerAnswers) {
      currentQuestion.playerAnswers = {};
    }
    
    currentQuestion.playerAnswers[playerId] = {
      answerIndex,
      isCorrect,
      pointsEarned
    };
    
    // Informer le joueur du résultat de sa réponse
    io.to(socket.id).emit('answer-result', {
      isCorrect,
      pointsEarned,
      totalScore: gameState.scores[playerId]
    });
    
    // Informer l'hôte et l'écran qu'un joueur a répondu
    const playerName = gameState.players[playerId].name;
    io.to('host-room').emit('player-answer', {
      playerId,
      playerName,
      answerIndex
    });
    
    io.to('screen-room').emit('player-answer', {
      playerId,
      playerName,
      answerIndex
    });
  });
  
  // Quand un hôte passe à la question suivante
  socket.on('next-question', () => {
    nextQuestion();
  });

  // Quand l'hôte force la fin du timer
  socket.on('question-timer-ended', () => {
    forceEndTimer();
  });

  // Quand un hôte veut démarrer un nouveau jeu
  socket.on('new-game', () => {
    resetGame();
  });
  
  // Gestion des déconnexions
  socket.on('disconnect', () => {
    // Chercher si c'était un joueur
    for (const playerId in gameState.players) {
      if (gameState.players[playerId].socketId === socket.id) {
        // Supprimer le joueur
        const playerName = gameState.players[playerId].name;
        delete gameState.players[playerId];
        delete gameState.scores[playerId];
        
        // Informer l'hôte et l'écran qu'un joueur est parti
        io.to('host-room').emit('player-left', {
          playerId,
          playerName,
          playerCount: Object.keys(gameState.players).length
        });
        
        io.to('screen-room').emit('player-left', {
          playerId,
          playerName,
          playerCount: Object.keys(gameState.players).length
        });
        break;
      }
    }
  });
  
  // Gestion des événements d'administration (CRUD des quiz)
  socket.on('get-quizzes', async () => {
    const quizzes = await getAllQuizzes();
    socket.emit('quizzes-list', { quizzes });
  });
  
  // Gestionnaire pour admin-init (utilisé par le client)
  socket.on('admin-init', async () => {
    try {
      const quizzes = await getAllQuizzes();
      socket.emit('admin-init-response', { 
        success: true,
        quizzes: quizzes,
        appVersion: appVersion
      });
    } catch (error) {
      console.error('Erreur lors de l\'initialisation admin:', error);
      socket.emit('admin-init-response', { 
        success: false,
        error: error.message 
      });
    }
  });
  
  // Gestionnaire pour get-quiz-list (utilisé par le client)
  socket.on('get-quiz-list', async () => {
    try {
      const quizzes = await getAllQuizzes();
      socket.emit('quiz-list-updated', { quizzes });
    } catch (error) {
      console.error('Erreur lors de la récupération de la liste des quiz:', error);
      socket.emit('quiz-list-updated', { quizzes: [] });
    }
  });
  
  // Gestionnaire pour save-quiz (utilisé par le client lors de la création/modification)
  socket.on('save-quiz', async (data) => {
    try {
      console.log('💾 [DEBUG] Sauvegarde du quiz:', data.name);
      
      if (data.id) {
        // Mode édition - mettre à jour un quiz existant
        const success = await updateQuiz(data.id, {
          name: data.name,
          description: data.description,
          questions: data.questions
        });
        
        if (success) {
          socket.emit('quiz-saved', { success: true, message: 'Quiz mis à jour avec succès' });
        } else {
          socket.emit('quiz-saved', { success: false, message: 'Erreur lors de la mise à jour du quiz' });
        }
      } else {
        // Mode création - créer un nouveau quiz
        const quizId = require('uuid').v4();
        const success = await createQuiz({
          id: quizId,
          name: data.name,
          description: data.description,
          questions: data.questions,
          active: false
        });
        
        if (success) {
          socket.emit('quiz-saved', { success: true, message: 'Quiz créé avec succès', quizId });
        } else {
          socket.emit('quiz-saved', { success: false, message: 'Erreur lors de la création du quiz' });
        }
      }
    } catch (error) {
      console.error('❌ [ERROR] Erreur lors de la sauvegarde du quiz:', error);
      socket.emit('quiz-saved', { success: false, message: 'Erreur serveur: ' + error.message });
    }
  });
  
  socket.on('create-quiz', async (data) => {
    try {
      const result = await createQuiz(data.quiz);
      socket.emit('quiz-created', { success: true, quizId: result.quizId });
    } catch (error) {
      socket.emit('quiz-created', { success: false, error: error.message });
    }
  });
  
  socket.on('update-quiz', async (data) => {
    try {
      await updateQuiz(data.quiz);
      socket.emit('quiz-updated', { success: true });
    } catch (error) {
      socket.emit('quiz-updated', { success: false, error: error.message });
    }
  });
  
  socket.on('activate-quiz', async (data) => {
    try {
      await activateQuiz(data.id);
      
      // Recharger le quiz actif
        gameState.activeQuiz = await getActiveQuiz();
        
        socket.emit('quiz-activated', { success: true });
    } catch (error) {
      socket.emit('quiz-activated', { success: false, error: error.message });
    }
  });
  
  socket.on('delete-quiz', async (data) => {
    try {
      await deleteQuiz(data.id);
      socket.emit('quiz-deleted', { success: true });
    } catch (error) {
      socket.emit('quiz-deleted', { success: false, error: error.message });
    }
  });
  
  // Gestion des emails des gagnants
  socket.on('submit-winner-email', async (data) => {
    const { playerId, email } = data;
    
    // Vérifier que c'est bien le gagnant
    let isWinner = false;
    let topScore = 0;
    let topPlayerId = null;
    
    for (const pid in gameState.scores) {
      if (gameState.scores[pid] > topScore) {
        topScore = gameState.scores[pid];
        topPlayerId = pid;
      }
    }
    
    isWinner = (playerId === topPlayerId);
    
    if (isWinner) {
      try {
        // Envoyer l'email au gagnant
        const playerName = gameState.players[playerId].name;
        await sendWinnerEmail(email, playerName, topScore);
        socket.emit('email-success', { message: 'Email envoyé avec succès' });
      } catch (error) {
        socket.emit('email-error', { error: 'Erreur lors de l\'envoi de l\'email: ' + error.message });
      }
    } else {
      socket.emit('email-error', { error: 'Vous n\'êtes pas le gagnant de ce quiz' });
    }
  });
});

// Fonctions de gestion du jeu
  async function nextQuestion() {
  // Incrémenter l'index de question
    gameState.currentQuestionIndex++;
    
  // Vérifier si on a terminé toutes les questions
    if (gameState.currentQuestionIndex >= gameState.activeQuiz.questions.length) {
    return endGame();
    }
    
  // Récupérer la question courante
    const currentQuestion = gameState.activeQuiz.questions[gameState.currentQuestionIndex];
  
  // Réinitialiser les réponses des joueurs pour cette question
  currentQuestion.playerAnswers = {};
  
  // Préparer les données à envoyer aux clients
  const questionData = {
    questionNumber: gameState.currentQuestionIndex + 1,
    totalQuestions: gameState.activeQuiz.questions.length,
      question: currentQuestion.question,
      options: currentQuestion.options,
    timeLimit: currentQuestion.timer || gameState.timePerQuestion
  };
  
  // Envoyer la question à tous les joueurs
  io.to('game-room').emit('new-question', questionData);
  
  // Envoyer la question à l'hôte (avec l'index de la réponse correcte)
  io.to('host-room').emit('new-question', {
    ...questionData,
    correctIndex: currentQuestion.correctIndex
  });
  
  // Envoyer la question à l'écran (sans l'index de la réponse correcte)
  io.to('screen-room').emit('new-question', questionData);
  
  // Démarrer le timer
  startTimer(currentQuestion.timer || gameState.timePerQuestion);
}

function startTimer(seconds) {
  // Initialiser le temps restant
  gameState.timeLeft = seconds;
  
  // Arrêter tout timer existant
  if (gameState.timer) {
    clearInterval(gameState.timer);
  }
  
  // Envoyer le temps initial à tous les clients
  io.to('game-room').emit('timer-update', { timeLeft: gameState.timeLeft });
  io.to('host-room').emit('timer-update', { timeLeft: gameState.timeLeft });
  io.to('screen-room').emit('timer-update', { timeLeft: gameState.timeLeft });
  
  // Créer un nouveau timer
    gameState.timer = setInterval(() => {
    // Décrémenter le temps
      gameState.timeLeft--;
      
      // Envoyer la mise à jour du timer à tous les clients
      io.to('game-room').emit('timer-update', { timeLeft: gameState.timeLeft });
      io.to('host-room').emit('timer-update', { timeLeft: gameState.timeLeft });
      io.to('screen-room').emit('timer-update', { timeLeft: gameState.timeLeft });
      
    // Vérifier si le temps est écoulé
      if (gameState.timeLeft <= 0) {
        clearInterval(gameState.timer);
      gameState.timer = null;
      
      // Envoyer l'événement time-up aux clients
      io.to('game-room').emit('time-up');
      io.to('host-room').emit('time-up');
      io.to('screen-room').emit('time-up');
      
      // Envoyer les résultats de la question après un court délai
      setTimeout(() => {
        sendQuestionResults();
      }, 1000);
      }
    }, 1000);
  }

  function forceEndTimer() {
  // Arrêter le timer s'il est actif
  if (gameState.timer) {
    clearInterval(gameState.timer);
    gameState.timer = null;
  }
  
  // Mettre le temps restant à 0
  gameState.timeLeft = 0;
  
  // Envoyer la mise à jour du timer à tous les clients
  io.to('game-room').emit('timer-update', { timeLeft: 0 });
  io.to('host-room').emit('timer-update', { timeLeft: 0 });
  io.to('screen-room').emit('timer-update', { timeLeft: 0 });
  
  // Envoyer l'événement time-up aux clients
  io.to('game-room').emit('time-up');
  io.to('host-room').emit('time-up');
  io.to('screen-room').emit('time-up');
  
  // Envoyer les résultats de la question après un court délai
  setTimeout(() => {
    sendQuestionResults();
  }, 1000);
}
  
  function sendQuestionResults() {
  // Récupérer la question courante
    const currentQuestion = gameState.activeQuiz.questions[gameState.currentQuestionIndex];
    
  // Préparer les données de score pour l'affichage
  const scoresData = Object.entries(gameState.scores).map(([playerId, score]) => ({
    playerId,
    playerName: gameState.players[playerId].name,
    score
  }));
  
  // Envoyer les résultats de la question à tous les joueurs
  io.to('game-room').emit('question-results', {
    correctIndex: currentQuestion.correctIndex,
    correctAnswer: currentQuestion.options[currentQuestion.correctIndex],
    explanation: currentQuestion.explanation,
    scores: scoresData
  });
  
  // Envoyer les résultats à l'hôte et à l'écran
  const resultsData = {
      correctIndex: currentQuestion.correctIndex,
    explanation: currentQuestion.explanation,
    scores: scoresData,
    playerAnswers: currentQuestion.playerAnswers || {}
  };
  
  io.to('host-room').emit('question-results', resultsData);
  io.to('screen-room').emit('question-results', resultsData);
  }
  
  async function endGame() {
  // Indiquer que le jeu est terminé
    gameState.isActive = false;
    
  // Préparer les données de score pour l'affichage
  const leaderboard = Object.entries(gameState.scores)
    .map(([playerId, score]) => ({
      playerId,
      playerName: gameState.players[playerId].name,
      score
    }))
    .sort((a, b) => b.score - a.score);
    
    // Déterminer le gagnant
  const winner = leaderboard.length > 0 ? leaderboard[0] : null;
  
  // Enregistrer le jeu dans l'historique
  try {
    await addGameToHistory({
      date: new Date(),
      quizName: gameState.activeQuiz.name,
      quizId: gameState.activeQuiz.id,
      players: Object.keys(gameState.players).length,
      scores: gameState.scores,
      winner: winner ? winner.playerName : null
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du jeu dans l\'historique:', error);
  }
  
  // Envoyer les résultats finaux à tous les joueurs
  io.to('game-room').emit('game-end', {
    winner,
    leaderboard
  });
  
  // Envoyer les résultats à l'hôte et à l'écran
  io.to('host-room').emit('game-end', {
    winner,
    leaderboard
  });
  
  io.to('screen-room').emit('game-end', {
    winner,
    leaderboard
  });
  }
  
  function resetGame() {
  // Réinitialiser l'état du jeu
    gameState.isActive = false;
    gameState.currentQuestionIndex = -1;
  
  // Générer un nouveau code de session
    gameState.sessionCode = generateSessionCode();
    
  // Vider les listes de joueurs et de scores
  gameState.players = {};
  gameState.scores = {};
  
  // Informer tous les clients
  io.to('host-room').emit('game-reset', {
    sessionCode: gameState.sessionCode
  });
  
  io.to('game-room').emit('game-reset');
  
  io.to('screen-room').emit('game-reset', {
    sessionCode: gameState.sessionCode
  });
  
  // Déconnecter tous les joueurs
  io.in('game-room').disconnectSockets();
}

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
  console.log(`Version de l'application: ${appVersion}`);
  console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
});