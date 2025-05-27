document.addEventListener('DOMContentLoaded', () => {
    // Éléments DOM pour l'affichage
    const sessionCode = document.getElementById('session-code');
    const joinCode = document.getElementById('join-code');
    const serverAddress = document.getElementById('server-address');
    const playerCountValue = document.getElementById('player-count-value');
    const playerList = document.getElementById('player-list');
    const appVersion = document.getElementById('app-version');
    
    const waitingScreen = document.getElementById('waiting-screen');
    const questionScreen = document.getElementById('question-screen');
    const resultsScreen = document.getElementById('results-screen');
    const finalScreen = document.getElementById('final-screen');
    
    const questionNumber = document.getElementById('question-number');
    const totalQuestions = document.getElementById('total-questions');
    const timeLeft = document.getElementById('time-left');
    const timerBar = document.getElementById('timer-bar');
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const playerAnswers = document.getElementById('player-answers');
    const detailedPlayerAnswers = document.getElementById('detailed-player-answers');
    
    const correctAnswerText = document.getElementById('correct-answer-text');
    const explanationText = document.getElementById('explanation-text');
    const scoreTableBody = document.getElementById('score-table-body');
    const winnerName = document.getElementById('winner-name');
    const finalLeaderboardBody = document.getElementById('final-leaderboard-body');
    
    // Variables d'état
    let currentQuestionData = null;
    let playerAnswersData = {};
    let timerInterval = null;

    // Initialiser Socket.IO
    const socket = io({
        withCredentials: true
    });
    
    // Déterminer l'adresse IP du serveur pour l'affichage
    serverAddress.textContent = window.location.host;
    
    // Rejoindre en tant qu'écran de présentation
    socket.emit('screen-join');
    
    // Événements Socket.IO communs
    socket.on('connect', () => {
        console.log('Connecté au serveur en tant qu\'écran');
    });
    
    // Gestion des événements Socket.IO spécifiques
    socket.on('game-setup', (data) => {
        console.log('Game setup received:', data);
        sessionCode.textContent = data.sessionCode;
        joinCode.textContent = data.sessionCode;
        playerCountValue.textContent = data.playerCount;
        
        // Afficher la version de l'application
        if (data.appVersion) {
            appVersion.textContent = data.appVersion;
        }
    });
    
    socket.on('player-joined', (data) => {
        console.log('Player joined:', data);
        playerCountValue.textContent = data.playerCount;
        
        // Ajouter le joueur à la liste avec un style attrayant
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item p-2 bg-primary bg-opacity-25 rounded text-center';
        playerItem.textContent = data.playerName;
        playerItem.dataset.playerId = data.playerId;
        playerList.appendChild(playerItem);
    });
    
    socket.on('player-left', (data) => {
        console.log('Player left:', data);
        playerCountValue.textContent = data.playerCount;
        
        // Supprimer le joueur de la liste
        const playerElement = document.querySelector(`.player-item[data-player-id="${data.playerId}"]`);
        if (playerElement) {
            playerElement.remove();
        }
    });
    
    socket.on('game-started', () => {
        console.log('Game started');
        // Rien à faire spécifiquement, le serveur enverra la première question
    });
    
    socket.on('new-question', (data) => {
        console.log('New question:', data);
        currentQuestionData = data;
        playerAnswersData = {}; // Réinitialiser les réponses des joueurs
        
        // Mettre à jour l'affichage
        questionNumber.textContent = data.questionNumber;
        totalQuestions.textContent = data.totalQuestions;
        timeLeft.textContent = data.timeLimit;
        questionText.textContent = data.question;
        
        // Réinitialiser la barre de progression du timer
        timerBar.style.width = '100%';
        
        // Générer les options
        optionsContainer.innerHTML = '';
        data.options.forEach((option, index) => {
            const optionCol = document.createElement('div');
            optionCol.className = 'col-md-6 mb-3';
            
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            optionDiv.textContent = option;
            optionDiv.dataset.index = index;
            
            optionCol.appendChild(optionDiv);
            optionsContainer.appendChild(optionCol);
        });
        
        // Vider le conteneur des réponses des joueurs
        playerAnswers.innerHTML = '';
        
        // Afficher l'écran de question
        showScreen(questionScreen);
        
        // Démarrer le compteur
        startTimer(data.timeLimit);
    });
    
    socket.on('player-answer', (data) => {
        console.log('Player answer:', data);
        
        // Stocker la réponse du joueur
        playerAnswersData[data.playerId] = {
            playerName: data.playerName,
            answerIndex: data.answerIndex
        };
        
        // Afficher que le joueur a répondu (sans montrer sa réponse)
        const playerAnswerElement = document.createElement('div');
        playerAnswerElement.className = 'player-answer';
        playerAnswerElement.textContent = data.playerName;
        playerAnswerElement.dataset.playerId = data.playerId;
        playerAnswers.appendChild(playerAnswerElement);
    });
    
    socket.on('question-results', (data) => {
        console.log('Question results:', data);
        
        // Afficher la réponse correcte
        const correctOption = currentQuestionData.options[data.correctIndex];
        correctAnswerText.textContent = correctOption;
        
        // Afficher l'explication
        explanationText.textContent = data.explanation || 'Aucune explication disponible.';
        
        // Afficher les réponses détaillées des joueurs
        detailedPlayerAnswers.innerHTML = '';
        
        // Trier les joueurs par ceux qui ont bien répondu d'abord
        const sortedPlayers = Object.entries(playerAnswersData).sort((a, b) => {
            const aCorrect = a[1].answerIndex === data.correctIndex;
            const bCorrect = b[1].answerIndex === data.correctIndex;
            return bCorrect - aCorrect; // Les corrects d'abord
        });
        
        for (const [playerId, playerData] of sortedPlayers) {
            const isCorrect = playerData.answerIndex === data.correctIndex;
            const playerAnswer = document.createElement('div');
            playerAnswer.className = `player-answer ${isCorrect ? 'correct-answer' : 'incorrect-answer'} mb-2`;
            
            const answerText = playerData.answerIndex !== undefined && playerData.answerIndex !== null
                ? currentQuestionData.options[playerData.answerIndex]
                : 'Pas de réponse';
            
            playerAnswer.innerHTML = `
                <strong>${playerData.playerName}:</strong> ${answerText}
                ${isCorrect ? ' ✓' : ' ✗'}
            `;
            
            detailedPlayerAnswers.appendChild(playerAnswer);
        }
        
        // Mettre à jour le tableau des scores
        scoreTableBody.innerHTML = '';
        const sortedScores = [...data.scores].sort((a, b) => b.score - a.score);
        
        sortedScores.forEach((playerScore) => {
            const scoreRow = document.createElement('tr');
            
            const nameCell = document.createElement('td');
            nameCell.textContent = playerScore.playerName;
            
            const scoreCell = document.createElement('td');
            scoreCell.textContent = playerScore.score;
            
            scoreRow.appendChild(nameCell);
            scoreRow.appendChild(scoreCell);
            scoreTableBody.appendChild(scoreRow);
        });
        
        // Arrêter le timer
        clearInterval(timerInterval);
        
        // Afficher l'écran de résultats
        showScreen(resultsScreen);
    });
    
    socket.on('game-end', (data) => {
        console.log('Game end:', data);
        
        // Afficher le gagnant
        if (data.winner) {
            winnerName.textContent = data.winner.playerName;
        } else {
            winnerName.textContent = 'Aucun gagnant';
        }
        
        // Mettre à jour le tableau des scores final
        finalLeaderboardBody.innerHTML = '';
        
        data.leaderboard.forEach((playerScore, index) => {
            const position = index + 1;
            const scoreRow = document.createElement('tr');
            
            const positionCell = document.createElement('td');
            positionCell.textContent = position;
            
            const nameCell = document.createElement('td');
            nameCell.textContent = playerScore.playerName;
            
            const scoreCell = document.createElement('td');
            scoreCell.textContent = playerScore.score;
            
            scoreRow.appendChild(positionCell);
            scoreRow.appendChild(nameCell);
            scoreRow.appendChild(scoreCell);
            finalLeaderboardBody.appendChild(scoreRow);
        });
        
        // Afficher l'écran final
        showScreen(finalScreen);
    });
    
    socket.on('game-reset', () => {
        console.log('Game reset');
        
        // Réinitialiser les variables d'état
        currentQuestionData = null;
        playerAnswersData = {};
        
        // Vider les listes
        playerList.innerHTML = '';
        
        // Afficher l'écran d'attente
        showScreen(waitingScreen);
    });
    
    // Fonctions utilitaires
    function startTimer(seconds) {
        // Arrêter tout timer en cours
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        
        // Définir la durée totale
        const totalTime = seconds;
        let timeRemaining = totalTime;
        
        // Mettre à jour l'affichage initial
        timeLeft.textContent = timeRemaining;
        timerBar.style.width = '100%';
        
        // Configurer l'intervalle pour mettre à jour le compteur
        timerInterval = setInterval(() => {
            timeRemaining -= 1;
            
            // Mettre à jour l'affichage
            timeLeft.textContent = timeRemaining;
            
            // Mettre à jour la barre de progression
            const percentage = (timeRemaining / totalTime) * 100;
            timerBar.style.width = `${percentage}%`;
            
            // Changer la couleur en fonction du temps restant
            if (percentage < 25) {
                timerBar.style.backgroundColor = '#dc3545'; // Rouge
            } else if (percentage < 50) {
                timerBar.style.backgroundColor = '#ffc107'; // Jaune
            }
            
            // Arrêter le timer quand il atteint zéro
            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
            }
        }, 1000);
    }
    
    function showScreen(screenToShow) {
        // Masquer tous les écrans
        waitingScreen.classList.remove('active');
        questionScreen.classList.remove('active');
        resultsScreen.classList.remove('active');
        finalScreen.classList.remove('active');
        
        // Afficher l'écran demandé
        screenToShow.classList.add('active');
    }
}); 