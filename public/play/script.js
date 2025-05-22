// Player Interface JavaScript (public/play/script.js)
document.addEventListener('DOMContentLoaded', () => {
    // Éléments DOM
    const playerNameInput = document.getElementById('player-name');
    const sessionCodeInput = document.getElementById('session-code');
    const joinBtn = document.getElementById('join-btn');
    const joinError = document.getElementById('join-error');
    const playerNameDisplay = document.getElementById('player-name-display');
    const scoreValue = document.getElementById('score-value');
    const playerInfo = document.getElementById('player-info');
    
    const questionNumberSpan = document.getElementById('question-number');
    const totalQuestionsSpan = document.getElementById('total-questions');
    const timeLeftSpan = document.getElementById('time-left');
    const optionsContainer = document.getElementById('options-container');
    
    const resultStatus = document.getElementById('result-status');
    const pointsEarned = document.getElementById('points-earned');
    const currentScoreValue = document.getElementById('current-score-value');
    
    const correctAnswerText = document.getElementById('correct-answer-text');
    const explanationText = document.getElementById('explanation-text');
    
    const finalResult = document.getElementById('final-result');
    const finalLeaderboardBody = document.getElementById('final-leaderboard-body');
    
    // Écrans
    const joinScreen = document.getElementById('join-screen');
    const waitingScreen = document.getElementById('waiting-screen');
    const questionScreen = document.getElementById('question-screen');
    const answerResultScreen = document.getElementById('answer-result-screen');
    const questionResultsScreen = document.getElementById('question-results-screen');
    const finalScreen = document.getElementById('final-screen');
    
    // Connexion Socket.IO
    const socket = io();
    
    // Variables d'état local
    let playerName = '';
    let currentScore = 0;
    let currentOptions = [];
    let selectedAnswerIndex = null;
    let hasAnswered = false;
    
    // Gestionnaires d'événements
    joinBtn.addEventListener('click', () => {
        const name = playerNameInput.value.trim();
        const code = sessionCodeInput.value.trim();
        
        if (!name) {
            showError('Veuillez entrer votre nom.');
            return;
        }
        
        if (!code) {
            showError('Veuillez entrer le code de session.');
            return;
        }
        
        playerName = name;
        
        // Envoyer la demande de connexion
        socket.emit('player-join', {
            playerName: name,
            sessionCode: code
        });
    });
    
    // Événements Socket.IO
    socket.on('connect', () => {
        console.log('Connecté au serveur');
    });
    
    socket.on('session-error', (data) => {
        showError(data.message);
    });
    
    socket.on('join-success', (data) => {
        // Mettre à jour l'interface
        playerNameDisplay.textContent = data.playerName;
        playerInfo.classList.remove('hidden');
        
        showScreen(waitingScreen);
    });
    
    socket.on('new-question', (data) => {
        // Configurer l'écran de question
        questionNumberSpan.textContent = data.questionNumber;
        totalQuestionsSpan.textContent = data.totalQuestions;
        timeLeftSpan.textContent = data.timeLimit;
        
        // Réinitialiser l'état
        selectedAnswerIndex = null;
        hasAnswered = false;
        
        // Afficher les options
        optionsContainer.innerHTML = '';
        currentOptions = data.options;
        
        data.options.forEach((option, index) => {
            const optionElement = document.createElement('div');
            optionElement.className = 'option';
            optionElement.textContent = option;
            optionElement.dataset.index = index;
            
            // Ajouter l'événement de clic
            optionElement.addEventListener('click', () => {
                if (hasAnswered) return;
                
                // Supprimer la sélection précédente
                const options = optionsContainer.querySelectorAll('.option');
                options.forEach(opt => opt.classList.remove('selected'));
                
                // Sélectionner cette option
                optionElement.classList.add('selected');
                selectedAnswerIndex = index;
                
                // Envoyer la réponse
                socket.emit('submit-answer', {
                    answerIndex: parseInt(index)
                });
                
                hasAnswered = true;
            });
            
            optionsContainer.appendChild(optionElement);
        });
        
        showScreen(questionScreen);
    });
    
    socket.on('timer-update', (data) => {
        timeLeftSpan.textContent = data.timeLeft;
    });
    
    socket.on('time-up', () => {
        // Si le joueur n'a pas répondu, envoyer une réponse vide
        if (!hasAnswered && selectedAnswerIndex === null) {
            socket.emit('submit-answer', {
                answerIndex: -1 // Indique qu'aucune réponse n'a été donnée
            });
        }
        
        // Désactiver toutes les options
        const options = optionsContainer.querySelectorAll('.option');
        options.forEach(opt => {
            opt.style.pointerEvents = 'none';
            opt.style.opacity = '0.5';
        });
        
        // Forcer l'affichage de l'écran de résultat
        showScreen(answerResultScreen);
    });
    
    socket.on('answer-result', (data) => {
        // Mettre à jour le score
        currentScore = data.totalScore;
        scoreValue.textContent = currentScore;
        currentScoreValue.textContent = currentScore;
        
        // Afficher le résultat
        if (data.correct) {
            resultStatus.textContent = 'Correct!';
            resultStatus.className = 'correct-status';
            pointsEarned.textContent = `+${data.points} points`;
        } else {
            resultStatus.textContent = 'Incorrect!';
            resultStatus.className = 'incorrect-status';
            pointsEarned.textContent = '0 point';
        }
        
        showScreen(answerResultScreen);
    });
    
    socket.on('question-results', (data) => {
        // Afficher la réponse correcte
        correctAnswerText.textContent = currentOptions[data.correctIndex];
        explanationText.textContent = data.explanation || 'Pas d\'explication disponible.';
        
        showScreen(questionResultsScreen);
    });
    
    socket.on('game-over', (data) => {
        // Trouver ma position dans le classement
        const myPosition = data.leaderboard.findIndex(player => player.name === playerName) + 1;
        
        // Afficher le message final
        finalResult.innerHTML = `
            <p>Vous avez terminé à la <strong>${myPosition}${getOrdinalSuffix(myPosition)}</strong> place!</p>
            <p>Votre score final: <strong>${currentScore}</strong> points</p>
        `;
        
        // Mettre à jour le classement final
        finalLeaderboardBody.innerHTML = '';
        data.leaderboard.forEach((player, index) => {
            const row = document.createElement('tr');
            
            const positionCell = document.createElement('td');
            positionCell.textContent = index + 1;
            
            const nameCell = document.createElement('td');
            nameCell.textContent = player.name;
            if (player.name === playerName) {
                nameCell.style.fontWeight = 'bold';
            }
            
            const scoreCell = document.createElement('td');
            scoreCell.textContent = player.score;
            
            row.appendChild(positionCell);
            row.appendChild(nameCell);
            row.appendChild(scoreCell);
            finalLeaderboardBody.appendChild(row);
        });
        
        showScreen(finalScreen);
    });
    
    socket.on('game-reset', () => {
        // Retour à l'écran de connexion
        showScreen(joinScreen);
        playerInfo.classList.add('hidden');
        currentScore = 0;
        scoreValue.textContent = currentScore;
    });
    
    // Fonctions utilitaires
    function showScreen(screenToShow) {
        // Cacher tous les écrans
        joinScreen.classList.remove('active');
        waitingScreen.classList.remove('active');
        questionScreen.classList.remove('active');
        answerResultScreen.classList.remove('active');
        questionResultsScreen.classList.remove('active');
        finalScreen.classList.remove('active');
        
        // Afficher l'écran demandé
        screenToShow.classList.add('active');
    }
    
    function showError(message) {
        joinError.textContent = message;
        joinError.classList.remove('hidden');
        
        // Masquer l'erreur après 3 secondes
        setTimeout(() => {
            joinError.classList.add('hidden');
        }, 3000);
    }
    
    function getOrdinalSuffix(n) {
        if (n === 1) return 'ère';
        return 'ème';
    }
});
