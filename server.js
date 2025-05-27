const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
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
// Ajouter Bootstrap
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

  // Quand un joueur se connecte
  socket.on('player-join', (data) => {
    if (data.sessionCode !== gameState.sessionCode) {
      socket.emit('session-error', { message: 'Code de session incorrect' });
      return;
    }

    // Enregistrer le joueur
    gameState.players[socket.id] = {
      id: socket.id,
      name: data.playerName,
      score: 0
    };
    
    gameState.scores[socket.id] = 0;
    
    socket.join('player-room');
    
    // Informer l'hôte qu'un nouveau joueur a rejoint
    io.to('host-room').emit('player-joined', {
      playerCount: Object.keys(gameState.players).length,
      playerName: data.playerName
    });
    
    // Confirmer au joueur qu'il a rejoint
    socket.emit('join-success', {
      playerName: data.playerName
    });
  });

  // Quand l'hôte démarre le jeu
  socket.on('start-game', async () => {
    if (Object.keys(gameState.players).length === 0) {
      socket.emit('game-error', { message: 'Aucun joueur connecté' });
      return;
    }

    // S'assurer que le quiz actif est chargé
    gameState.activeQuiz = await getActiveQuiz();

    gameState.isActive = true;
    gameState.currentQuestionIndex = -1;
    Object.keys(gameState.players).forEach(id => {
      gameState.scores[id] = 0;
      gameState.players[id].score = 0;
    });

    nextQuestion();
  });

  // Quand un joueur répond
  socket.on('submit-answer', (data) => {
    if (!gameState.isActive) return;
    
    const currentQuestion = gameState.activeQuiz.questions[gameState.currentQuestionIndex];
    if (!currentQuestion) return;
    
    const isCorrect = data.answerIndex === currentQuestion.correctIndex;
    
    if (isCorrect) {
      // Calcul du score (plus rapide = plus de points)
      const timeLeft = gameState.timeLeft || 1;
      const points = Math.ceil(timeLeft * 10);
      
      gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + points;
      gameState.players[socket.id].score += points;
      
      socket.emit('answer-result', {
        correct: true,
        points: points,
        totalScore: gameState.scores[socket.id]
      });
    } else {
      socket.emit('answer-result', {
        correct: false,
        points: 0,
        totalScore: gameState.scores[socket.id] || 0
      });
    }
  });

  // Quand l'hôte passe à la question suivante
  socket.on('request-next-question', () => {
    nextQuestion();
  });

  // Quand l'hôte reset le jeu
  socket.on('reset-game', () => {
    resetGame();
    io.to('host-room').emit('game-reset', {
      sessionCode: gameState.sessionCode,
      playerCount: Object.keys(gameState.players).length
    });
    io.to('player-room').emit('game-reset');
  });

  // Événements de l'admin
  socket.on('admin-init', async () => {
    const session = socket.request.session;
    console.log('admin-init event, session:', {
      hasSession: !!session,
      hasUser: !!(session && session.user),
      isAdmin: !!(session && session.user && session.user.isAdmin),
      sessionId: session ? session.id : null
    });
    
    // Dans la nouvelle conception, nous permettons d'accéder aux fonctionnalités admin depuis la page host,
    // mais seulement si l'utilisateur est un administrateur
    if (!session || !session.user || !session.user.isAdmin) {
      socket.emit('admin-init-response', { 
        error: 'Non autorisé',
        quizzes: []
      });
      return;
    }
    
    const quizzes = await getAllQuizzes();
    
    socket.emit('admin-init-response', {
      username: session.user.username,
      userId: session.user.id,
      userInfo: {
        username: session.user.username,
        isAdmin: session.user.isAdmin
      },
      appVersion: appVersion,
      quizzes: quizzes
    });
  });
  
  socket.on('get-quiz-list', async () => {
    const session = socket.request.session;
    if (!session || !session.user || !session.user.isAdmin) {
      socket.emit('quiz-list-updated', { 
        error: 'Non autorisé',
        quizzes: []
      });
      return;
    }
    
    const quizzes = await getAllQuizzes();
    
    socket.emit('quiz-list-updated', {
      quizzes: quizzes
    });
  });
  
  socket.on('save-quiz', async (data) => {
    const session = socket.request.session;
    if (!session || !session.user || !session.user.isAdmin) {
      socket.emit('quiz-saved', { success: false, message: 'Non autorisé' });
      return;
    }
    
    try {
      // Valider les données du quiz
      if (!data.name || !data.name.trim()) {
        socket.emit('quiz-saved', { success: false, message: 'Le nom du quiz est requis' });
        return;
      }
      
      if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
        socket.emit('quiz-saved', { success: false, message: 'Le quiz doit contenir au moins une question' });
        return;
      }
      
      // Valider chaque question
      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i];
        
        // Valider le timer de la question s'il existe
        if (q.timer !== undefined) {
          const timer = parseInt(q.timer);
          if (isNaN(timer) || timer < 5 || timer > 120) {
            socket.emit('quiz-saved', { 
              success: false, 
              message: `Le temps limite pour la question ${i+1} doit être entre 5 et 120 secondes` 
            });
            return;
          }
          // S'assurer que timer est un nombre
          q.timer = timer;
        }
      }
      
      let success = false;
      
      if (data.id) {
        // Modifier un quiz existant
        success = await updateQuiz(data.id, {
          name: data.name,
          description: data.description,
          questions: data.questions
        });
      } else {
        // Créer un nouveau quiz
        success = await createQuiz({
          id: uuidv4(),
          name: data.name,
          description: data.description,
          questions: data.questions,
          active: false
        });
      }
      
      if (success) {
        socket.emit('quiz-saved', { success: true });
      } else {
        socket.emit('quiz-saved', { success: false, message: 'Erreur lors de la sauvegarde' });
      }
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du quiz:', err);
      socket.emit('quiz-saved', { success: false, message: err.message });
    }
  });
  
  socket.on('delete-quiz', async (data) => {
    const session = socket.request.session;
    if (!session || !session.user || !session.user.isAdmin) {
      socket.emit('quiz-deleted', { success: false, message: 'Non autorisé' });
      return;
    }
    
    try {
      const result = await deleteQuiz(data.id);
      
      if (result.success) {
        socket.emit('quiz-deleted', { success: true });
      } else {
        if (result.reason === 'active') {
          socket.emit('quiz-deleted', { success: false, message: 'Impossible de supprimer le quiz actif' });
        } else if (result.reason === 'last') {
          socket.emit('quiz-deleted', { success: false, message: 'Impossible de supprimer le dernier quiz' });
        } else {
          socket.emit('quiz-deleted', { success: false, message: 'Erreur lors de la suppression' });
        }
      }
    } catch (err) {
      console.error('Erreur lors de la suppression du quiz:', err);
      socket.emit('quiz-deleted', { success: false, message: err.message });
    }
  });
  
  socket.on('activate-quiz', async (data) => {
    const session = socket.request.session;
    if (!session || !session.user || !session.user.isAdmin) {
      socket.emit('quiz-activated', { success: false, message: 'Non autorisé' });
      return;
    }
    
    try {
      const success = await activateQuiz(data.id);
      
      if (success) {
        // Mettre à jour le quiz actif dans le gameState
        gameState.activeQuiz = await getActiveQuiz();
        
        socket.emit('quiz-activated', { success: true });
      } else {
        socket.emit('quiz-activated', { success: false, message: 'Erreur lors de l\'activation' });
      }
    } catch (err) {
      console.error('Erreur lors de l\'activation du quiz:', err);
      socket.emit('quiz-activated', { success: false, message: err.message });
    }
  });

  // Nouvel événement pour recevoir l'email du gagnant
  socket.on('submit-winner-email', async (data) => {
    console.log('Email du gagnant reçu:', data);
    
    // Enregistrer l'email dans les données du joueur
    if (gameState.players[socket.id]) {
      gameState.players[socket.id].email = data.playerEmail;
      
      // Informer l'hôte de la mise à jour de l'email
      io.to('host-room').emit('winner-email-submitted', {
        playerName: data.playerName,
        playerEmail: data.playerEmail,
        score: data.score
      });
      
      // Envoyer un email au gagnant
      try {
        await sendWinnerEmail({
          name: data.playerName,
          email: data.playerEmail,
          score: data.score
        }, gameState.activeQuiz.name);
        console.log(`Email envoyé au gagnant: ${data.playerEmail}`);
      } catch (error) {
        console.error('Erreur lors de l\'envoi de l\'email au gagnant:', error);
      }
    }
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log('Déconnexion:', socket.id);
    
    if (gameState.players[socket.id]) {
      delete gameState.players[socket.id];
      delete gameState.scores[socket.id];
      
      io.to('host-room').emit('player-left', {
        playerCount: Object.keys(gameState.players).length
      });
    }
  });

  async function nextQuestion() {
    clearTimeout(gameState.timer);
    gameState.currentQuestionIndex++;
    
    // S'assurer que le quiz actif est chargé
    gameState.activeQuiz = await getActiveQuiz();
    
    if (gameState.currentQuestionIndex >= gameState.activeQuiz.questions.length) {
      endGame();
      return;
    }
    
    const currentQuestion = gameState.activeQuiz.questions[gameState.currentQuestionIndex];
    // Utiliser le timer spécifique de la question ou la valeur par défaut
    const questionTimer = currentQuestion.timer || gameState.timePerQuestion;
    gameState.timeLeft = questionTimer;
    
    // Envoyer la question à l'hôte et aux joueurs
    io.to('host-room').emit('new-question', {
      question: currentQuestion.question,
      options: currentQuestion.options,
      questionNumber: gameState.currentQuestionIndex + 1,
      totalQuestions: gameState.activeQuiz.questions.length,
      timeLimit: questionTimer
    });
    
    io.to('player-room').emit('new-question', {
      options: currentQuestion.options,
      questionNumber: gameState.currentQuestionIndex + 1,
      totalQuestions: gameState.activeQuiz.questions.length,
      timeLimit: questionTimer
    });
    
    startTimer();
  }
  
  function startTimer() {
    gameState.timer = setInterval(() => {
      gameState.timeLeft--;
      
      // Envoyer la mise à jour du timer à l'hôte et aux joueurs
      io.to('host-room').emit('timer-update', {
        timeLeft: gameState.timeLeft
      });
      io.to('player-room').emit('timer-update', {
        timeLeft: gameState.timeLeft
      });
      
      if (gameState.timeLeft <= 0) {
        clearInterval(gameState.timer);
        // Informer tous les clients que le temps est écoulé
        io.to('host-room').emit('time-up');
        io.to('player-room').emit('time-up');
        sendQuestionResults();
      }
    }, 1000);
  }
  
  function sendQuestionResults() {
    const currentQuestion = gameState.activeQuiz.questions[gameState.currentQuestionIndex];
    
    if (!currentQuestion) return;
    
    // Préparer le classement actuel
    const scores = Object.values(gameState.players)
      .sort((a, b) => b.score - a.score)
      .map(player => ({ name: player.name, score: player.score }));
    
    // Envoyer les résultats à tous
    io.to('host-room').emit('question-results', {
      correctIndex: currentQuestion.correctIndex,
      correctText: currentQuestion.options[currentQuestion.correctIndex],
      explanation: currentQuestion.explanation || "Pas d'explication disponible",
      scores: scores
    });
  }
  
  async function endGame() {
    gameState.isActive = false;
    
    // Préparer le classement final
    const finalScores = Object.values(gameState.players)
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({
        position: index + 1,
        name: player.name,
        email: player.email || '',
        score: player.score
      }));
    
    // Déterminer le gagnant
    const winner = finalScores.length > 0 ? finalScores[0] : null;
    
    // Envoyer les résultats finaux à l'hôte
    io.to('host-room').emit('game-end', {
      winner: winner,
      leaderboard: finalScores
    });
    
    // Envoyer les résultats finaux aux joueurs
    io.to('player-room').emit('game-over', {
      leaderboard: finalScores
    });
    
    // Sauvegarder les résultats dans l'historique
    console.log('Fin du jeu, résultats:', finalScores);
    
    // Enregistrer l'historique de la partie
    if (finalScores.length > 0) {
      await addGameToHistory({
        quizId: gameState.activeQuiz.id,
        quizName: gameState.activeQuiz.name,
        players: finalScores.length,
        winner: winner ? {
          name: winner.name,
          email: winner.email,
          score: winner.score
        } : null,
        leaderboard: finalScores
      });
      
      // Note: L'email du gagnant sera envoyé lorsqu'il soumettra son email via l'événement 'submit-winner-email'
    }
  }
  
  function resetGame() {
    clearTimeout(gameState.timer);
    gameState.isActive = false;
    gameState.currentQuestionIndex = -1;
    gameState.sessionCode = generateSessionCode();
    
    // Réinitialiser les scores des joueurs connectés
    Object.keys(gameState.players).forEach(id => {
      gameState.scores[id] = 0;
      gameState.players[id].score = 0;
    });
    
    // S'assurer que le quiz actif est chargé
    gameState.activeQuiz = loadActiveQuiz();
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
  console.log(`Version de l'application: ${appVersion}`);
  console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
});