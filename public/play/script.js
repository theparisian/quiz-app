// Player Interface JavaScript (public/play/script.js)
document.addEventListener('DOMContentLoaded', () => {
    // Éléments DOM
    const playerNameInput = document.getElementById('player-name');
    const playerEmailInput = document.getElementById('player-email');
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
    let playerEmail = '';
    let currentScore = 0;
    let currentOptions = [];
    let selectedAnswerIndex = null;
    let hasAnswered = false;
    
    // Gestionnaires d'événements
    joinBtn.addEventListener('click', () => {
        const name = playerNameInput.value.trim();
        const email = playerEmailInput.value.trim();
        const code = sessionCodeInput.value.trim();
        
        if (!name) {
            showError('Veuillez entrer votre nom.');
            return;
        }
        
        if (!email) {
            showError('Veuillez entrer votre email.');
            return;
        }
        
        if (!isValidEmail(email)) {
            showError('Veuillez entrer un email valide.');
            return;
        }
        
        if (!code) {
            showError('Veuillez entrer le code de session.');
            return;
        }
        
        playerName = name;
        playerEmail = email;
        
        // Envoyer la demande de connexion
        socket.emit('player-join', {
            playerName: name,
            playerEmail: email,
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
            resultStatus.className = 'mb-2 fs-5 fw-bold correct';
            pointsEarned.textContent = `+${data.points} points`;
        } else {
            resultStatus.textContent = 'Incorrect!';
            resultStatus.className = 'mb-2 fs-5 fw-bold incorrect';
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
        // Afficher un message simple de fin de quiz
        finalResult.innerHTML = `
            <div class="quiz-end-message">
                <h2>Quiz Terminé!</h2>
                <p>Merci d'avoir participé au quiz.</p>
                <p>Votre score final: <strong>${currentScore}</strong> points</p>
                <button onclick="window.location.href='/play'" class="btn primary-btn">Retour à l'accueil</button>
            </div>
        `;
        
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
        setTimeout(() => {
            joinError.classList.add('hidden');
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
