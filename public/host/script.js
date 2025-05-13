document.addEventListener('DOMContentLoaded', () => {
    // Éléments DOM
    const sessionCode = document.getElementById('session-code');
    const joinCode = document.getElementById('join-code');
    const serverAddress = document.getElementById('server-address');
    const playerCountValue = document.getElementById('player-count-value');
    const playerList = document.getElementById('player-list');
    const startGameBtn = document.getElementById('start-game-btn');
    
    const waitingScreen = document.getElementById('waiting-screen');
    const questionScreen = document.getElementById('question-screen');
    const resultsScreen = document.getElementById('results-screen');
    const finalScreen = document.getElementById('final-screen');
    
    const questionNumber = document.getElementById('question-number');
    const totalQuestions = document.getElementById('total-questions');
    const timeLeft = document.getElementById('time-left');
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    
    const correctAnswerText = document.getElementById('correct-answer-text');
    const explanationText = document.getElementById('explanation-text');
    const scoreTableBody = document.getElementById('score-table-body');
    
    const nextQuestionBtn = document.getElementById('next-question-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    
    // Initialiser Socket.IO
    const socket = io();
    
    // Déterminer l'adresse IP du serveur pour l'affichage
    serverAddress.textContent = window.location.host;
    
    // Variables d'état
    let currentQuestionData = null;
    
    // Rejoindre en tant qu'hôte
    socket.emit('host-join');
    
    // Événements Socket.IO
    socket.on('connect', () => {
        console.log('Connecté au serveur en tant qu\'hôte');
    });
    
    socket.on('game-setup', (data) => {
        console.log('Game setup received:', data);
        sessionCode.textContent = data.sessionCode;
        joinCode.textContent = data.sessionCode;
        playerCountValue.textContent = data.playerCount;
        
        // Mettre à jour le bouton de démarrage
        updateStartButton(data.playerCount);
    });
    
    socket.on('player-joined', (data) => {
        console.log('Player joined:', data);
        playerCountValue.textContent = data.playerCount;
        
        // Ajouter le joueur à la liste
        const playerItem = document.createElement('li');
        playerItem.textContent = data.playerName;
        playerList.appendChild(playerItem);
        
        // Mettre à jour le bouton de démarrage
        updateStartButton(data.playerCount);
    });
    
    socket.on('player-left', (data) => {
        console.log('Player left:', data);
        playerCountValue.textContent = data.playerCount;
        
        // Note: Dans une application réelle, nous voudrions aussi supprimer le joueur de la liste
        // Mais comme on n'a pas l'ID du joueur qui part, on devrait faire un appel au serveur
        
        // Mettre à jour le bouton de démarrage
        updateStartButton(data.playerCount);
    });
    
    socket.on('new-question', (data) => {
        console.log('New question:', data);
        currentQuestionData = data;
        
        // Mettre à jour l'affichage
        questionNumber.textContent = data.questionNumber;
        totalQuestions.textContent = data.totalQuestions;
        timeLeft.textContent = data.timeLimit;
        questionText.textContent = data.question;
        
        // Générer les options
        optionsContainer.innerHTML = '';
        data.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            optionDiv.textContent = option;
            optionDiv.dataset.index = index;
            optionsContainer.appendChild(optionDiv);
        });
        
        // Afficher l'écran de question
        showScreen(questionScreen);
        
        // Démarrer le compteur
        startTimer(data.timeLimit);
    });
    
    socket.on('question-results', (data) => {
        console.log('Question results:', data);
        
        // Afficher la réponse correcte
        const correctOption = currentQuestionData.options[data.correctIndex];
        correctAnswerText.textContent = correctOption;
        
        // Afficher l'explication
        explanationText.textContent = data.explanation || 'Aucune explication disponible.';
        
        // Mettre à jour le tableau des scores
        scoreTableBody.innerHTML = '';
        data.scores.forEach(player => {
            const row = document.createElement('tr');
            
            const nameCell = document.createElement('td');
            nameCell.textContent = player.name;
            
            const scoreCell = document.createElement('td');
            scoreCell.textContent = player.score;
            
            row.appendChild(nameCell);
            row.appendChild(scoreCell);
            scoreTableBody.appendChild(row);
        });
        
        // Afficher l'écran des résultats
        showScreen(resultsScreen);
    });
    
    socket.on('game-over', (data) => {
        console.log('Game over:', data);
        
        // Afficher le gagnant
        const winnerDisplay = document.getElementById('winner-display');
        if (data.leaderboard.length > 0) {
            const winner = data.leaderboard[0];
            winnerDisplay.innerHTML = `<h3>Gagnant: ${winner.name}</h3><p>Score: ${winner.score}</p>`;
        } else {
            winnerDisplay.innerHTML = '<h3>Aucun joueur</h3>';
        }
        
        // Mettre à jour le classement final
        const leaderboardBody = document.getElementById('final-leaderboard-body');
        leaderboardBody.innerHTML = '';
        
        data.leaderboard.forEach((player, index) => {
            const row = document.createElement('tr');
            
            const positionCell = document.createElement('td');
            positionCell.textContent = index + 1;
            
            const nameCell = document.createElement('td');
            nameCell.textContent = player.name;
            
            const scoreCell = document.createElement('td');
            scoreCell.textContent = player.score;
            
            row.appendChild(positionCell);
            row.appendChild(nameCell);
            row.appendChild(scoreCell);
            leaderboardBody.appendChild(row);
        });
        
        // Afficher l'écran final
        showScreen(finalScreen);
    });
    
    socket.on('game-reset', (data) => {
        console.log('Game reset:', data);
        
        // Mettre à jour les informations de session
        sessionCode.textContent = data.sessionCode;
        joinCode.textContent = data.sessionCode;
        playerCountValue.textContent = data.playerCount;
        
        // Vider la liste des joueurs
        playerList.innerHTML = '';
        
        // Afficher l'écran d'attente
        showScreen(waitingScreen);
        
        // Mettre à jour le bouton de démarrage
        updateStartButton(data.playerCount);
    });
    
    socket.on('game-error', (data) => {
        console.error('Game error:', data.message);
        alert('Erreur: ' + data.message);
    });
    
    // Gestionnaires d'événements
    startGameBtn.addEventListener('click', () => {
        socket.emit('start-game');
    });
    
    nextQuestionBtn.addEventListener('click', () => {
        socket.emit('request-next-question');
    });
    
    newGameBtn.addEventListener('click', () => {
        socket.emit('reset-game');
    });
    
    // Fonctions utilitaires
    let timerInterval = null;
    
    function startTimer(seconds) {
        clearInterval(timerInterval);
        
        let remainingTime = seconds;
        timeLeft.textContent = remainingTime;
        
        timerInterval = setInterval(() => {
            remainingTime--;
            timeLeft.textContent = remainingTime;
            
            if (remainingTime <= 0) {
                clearInterval(timerInterval);
            }
        }, 1000);
    }
    
    function showScreen(screenToShow) {
        // Cacher tous les écrans
        waitingScreen.classList.remove('active');
        questionScreen.classList.remove('active');
        resultsScreen.classList.remove('active');
        finalScreen.classList.remove('active');
        
        // Afficher l'écran demandé
        screenToShow.classList.add('active');
    }
    
    function updateStartButton(playerCount) {
        if (playerCount > 0) {
            startGameBtn.disabled = false;
        } else {
            startGameBtn.disabled = true;
        }
    }
});
