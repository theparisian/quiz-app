const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
require('dotenv').config();
const { initDatabase } = require('./config/database');
const { verifyCredentials, requireAuth } = require('./config/auth');

// Récupération de la version depuis package.json
const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const appVersion = packageInfo.version;

// Initialisation de l'application Express
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware pour parser les formulaires
app.use(express.urlencoded({ extended: true }));

// Configuration des sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'quiz-master-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 } // 1 heure
}));

// Dossiers statiques
app.use(express.static(path.join(__dirname, 'public')));

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
  const user = await verifyCredentials(username, password);
  
  if (user) {
    // Stocker l'utilisateur dans la session
    req.session.user = user;
    res.redirect('/host');
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

// API pour obtenir une nouvelle session (utile pour intégration future)
app.get('/api/session', requireAuth, (req, res) => {
  res.json({ sessionCode: gameState.sessionCode });
});

// Chargement des questions du quiz
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/questions.json'), 'utf8'));

// États du jeu
let gameState = {
  isActive: false,
  currentQuestionIndex: -1,
  scores: {},
  players: {},
  sessionCode: generateSessionCode(),
  timePerQuestion: 20, // secondes
  timer: null
};

function generateSessionCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
  console.log('Nouvelle connexion:', socket.id);

  // Quand un hôte se connecte
  socket.on('host-join', () => {
    socket.join('host-room');
    socket.emit('game-setup', { 
      sessionCode: gameState.sessionCode,
      playerCount: Object.keys(gameState.players).length,
      questions: questions.map(q => ({
        question: q.question,
        options: q.options
      })),
      appVersion: appVersion
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
  socket.on('start-game', () => {
    if (Object.keys(gameState.players).length === 0) {
      socket.emit('game-error', { message: 'Aucun joueur connecté' });
      return;
    }

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
    
    const currentQuestion = questions[gameState.currentQuestionIndex];
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

  function nextQuestion() {
    clearTimeout(gameState.timer);
    gameState.currentQuestionIndex++;
    
    if (gameState.currentQuestionIndex >= questions.length) {
      endGame();
      return;
    }
    
    const currentQuestion = questions[gameState.currentQuestionIndex];
    gameState.timeLeft = gameState.timePerQuestion;
    
    // Envoyer la question à l'hôte et aux joueurs
    io.to('host-room').emit('new-question', {
      question: currentQuestion.question,
      options: currentQuestion.options,
      questionNumber: gameState.currentQuestionIndex + 1,
      totalQuestions: questions.length,
      timeLimit: gameState.timePerQuestion
    });
    
    io.to('player-room').emit('new-question', {
      options: currentQuestion.options,
      questionNumber: gameState.currentQuestionIndex + 1,
      totalQuestions: questions.length,
      timeLimit: gameState.timePerQuestion
    });
    
    startTimer();
  }
  
  function startTimer() {
    gameState.timer = setInterval(() => {
      gameState.timeLeft--;
      
      io.to('host-room').emit('timer-update', {
        timeLeft: gameState.timeLeft
      });
      
      if (gameState.timeLeft <= 0) {
        clearInterval(gameState.timer);
        sendQuestionResults();
      }
    }, 1000);
  }
  
  function sendQuestionResults() {
    const currentQuestion = questions[gameState.currentQuestionIndex];
    
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
  
  function endGame() {
    gameState.isActive = false;
    
    // Préparer le classement final
    const finalScores = Object.values(gameState.players)
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({
        position: index + 1,
        name: player.name,
        score: player.score
      }));
    
    // Déterminer le gagnant
    const winner = finalScores.length > 0 ? finalScores[0] : null;
    
    // Envoyer les résultats finaux
    io.to('host-room').emit('game-end', {
      winner: winner,
      leaderboard: finalScores
    });
    
    // Sauvegarder les résultats (pourrait être implémenté dans le futur)
    console.log('Fin du jeu, résultats:', finalScores);
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
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
  console.log(`Version de l'application: ${appVersion}`);
  console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
});