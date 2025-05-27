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
    const winnerForm = document.getElementById('winner-form');
    const winnerEmailInput = document.getElementById('winner-email');
    const submitEmailBtn = document.getElementById('submit-email-btn');
    const emailSuccess = document.getElementById('email-success');
    const emailError = document.getElementById('email-error');
    
    // Écrans
    const joinScreen = document.getElementById('join-screen');
    const waitingScreen = document.getElementById('waiting-screen');
    const questionScreen = document.getElementById('question-screen');
    const answerResultScreen = document.getElementById('answer-result-screen');
    const questionResultsScreen = document.getElementById('question-results-screen');
    const finalScreen = document.getElementById('final-screen');
    
    // Connexion Socket.IO
    const socket = io({
        withCredentials: true
    });
    
    // Variables d'état local
    let playerName = '';
    let currentScore = 0;
    let currentOptions = [];
    let selectedAnswerIndex = null;
    let hasAnswered = false;
    let answerResultData = null; // Stocker les données de résultat pour les afficher plus tard
    let isWinner = false; // Indique si le joueur est le gagnant
    
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
    
    // Événement pour soumettre l'email du gagnant
    submitEmailBtn.addEventListener('click', () => {
        const email = winnerEmailInput.value.trim();
        
        if (!email) {
            showEmailError('Veuillez entrer votre email.');
            return;
        }
        
        if (!isValidEmail(email)) {
            showEmailError('Veuillez entrer un email valide.');
            return;
        }
        
        // Envoyer l'email au serveur
        socket.emit('submit-winner-email', {
            playerName: playerName,
            playerEmail: email,
            score: currentScore
        });
        
        // Afficher le message de succès
        emailSuccess.classList.remove('hidden');
        setTimeout(() => {
            emailSuccess.classList.add('hidden');
        }, 5000);
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
        answerResultData = null;
        
        // Afficher les options
        optionsContainer.innerHTML = '';
        optionsContainer.classList.remove('active');
        currentOptions = data.options;
        
        data.options.forEach((option, index) => {
            const optionElement = document.createElement('button');
            optionElement.className = 'option-btn btn w-100 text-start';
            optionElement.textContent = option;
            optionElement.dataset.index = index;
            
            // Ajouter l'événement de clic
            optionElement.addEventListener('click', () => {
                if (hasAnswered) return;
                
                // Supprimer la sélection précédente
                const options = optionsContainer.querySelectorAll('.option-btn');
                options.forEach(opt => opt.classList.remove('active'));
                
                // Sélectionner cette option avec la classe 'active'
                optionElement.classList.add('active');
                
                // Ajouter la classe 'active' au conteneur parent
                optionsContainer.classList.add('active');
                
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
        const options = optionsContainer.querySelectorAll('.option-btn');
        options.forEach(opt => {
            opt.classList.add('disabled');
            opt.setAttribute('disabled', 'disabled');
        });
        
        // Si nous avons déjà reçu le résultat, l'afficher maintenant
        if (answerResultData) {
            displayAnswerResult(answerResultData);
        }
    });
    
    socket.on('answer-result', (data) => {
        // Stocker les données de résultat mais ne pas les afficher immédiatement
        answerResultData = data;
        
        // Mettre à jour le score dans la barre supérieure (discrètement)
        currentScore = data.totalScore;
        scoreValue.textContent = currentScore;
        
        // On n'affiche pas encore le résultat - on attend que le timer se termine
    });
    
    // Fonction pour afficher les résultats (appelée après la fin du timer)
    function displayAnswerResult(data) {
        // Mettre à jour l'affichage du score
        currentScoreValue.textContent = data.totalScore;
        
        // Afficher le résultat
        if (data.correct) {
            resultStatus.textContent = 'Correct!';
            resultStatus.className = 'mb-2 fs-5 fw-bold correct';
            pointsEarned.textContent = `+${data.points} points`;
        } else {
            resultStatus.textContent = 'Incorrect!';
            resultStatus.className = 'mb-2 fs-5 fw-bold incorrect';
            pointsEarned.textContent = '0 point';
        }
        
        showScreen(answerResultScreen);
    }
    
    socket.on('question-results', (data) => {
        // Afficher la réponse correcte
        correctAnswerText.textContent = currentOptions[data.correctIndex];
        explanationText.textContent = data.explanation || 'Pas d\'explication disponible.';
        
        showScreen(questionResultsScreen);
    });
    
    socket.on('game-over', (data) => {
        // Vérifier si le joueur est le gagnant (première position dans le classement)
        isWinner = false;
        if (data.leaderboard && data.leaderboard.length > 0) {
            const topPlayer = data.leaderboard[0];
            // Comparer avec le nom du joueur actuel
            if (topPlayer.name === playerName) {
                isWinner = true;
                winnerForm.classList.remove('hidden');
            }
        }
        
        // Afficher le classement final
        let leaderboardHTML = `
            <div class="quiz-end-message mb-4">
                <p>Votre score final: <strong>${currentScore}</strong> points</p>
            </div>
            <div class="card bg-light">
                <div class="card-header">
                    <h3 class="fs-5 mb-0">Classement final</h3>
                </div>
                <ul class="list-group list-group-flush">
        `;
        
        if (data.leaderboard && data.leaderboard.length > 0) {
            data.leaderboard.forEach((player, index) => {
                const isCurrentPlayer = player.name === playerName;
                leaderboardHTML += `
                    <li class="list-group-item d-flex justify-content-between align-items-center ${isCurrentPlayer ? 'bg-light' : ''}">
                        <span>${index + 1}. ${player.name} ${isCurrentPlayer ? '(Vous)' : ''}</span>
                        <span class="badge bg-primary rounded-pill">${player.score} pts</span>
                    </li>
                `;
            });
        } else {
            leaderboardHTML += `<li class="list-group-item">Aucun joueur dans le classement</li>`;
        }
        
        leaderboardHTML += `
                </ul>
            </div>
            <button onclick="window.location.href='/play'" class="btn btn-primary mt-4">Retour à l'accueil</button>
        `;
        
        finalResult.innerHTML = leaderboardHTML;
        showScreen(finalScreen);
    });
    
    socket.on('game-reset', () => {
        // Retour à l'écran de connexion
        showScreen(joinScreen);
        playerInfo.classList.add('hidden');
        currentScore = 0;
        scoreValue.textContent = currentScore;
        optionsContainer.classList.remove('active');
        
        // Réinitialiser le formulaire d'email
        winnerForm.classList.add('hidden');
        winnerEmailInput.value = '';
        emailSuccess.classList.add('hidden');
        emailError.classList.add('hidden');
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
        setTimeout(() => {
            joinError.classList.add('hidden');
        }, 5000);
    }
    
    function showEmailError(message) {
        emailError.textContent = message;
        emailError.classList.remove('hidden');
        setTimeout(() => {
            emailError.classList.add('hidden');
        }, 5000);
    }
    
    function getOrdinalSuffix(n) {
        if (n === 1) return 'ère';
        return 'ème';
    }
    
    function isValidEmail(email) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailPattern.test(email);
    }
});
