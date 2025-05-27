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
    let playerData = null; // Stocke les données du joueur, y compris son ID
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
            playerId: playerData.playerId,
            email: email
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
    
    socket.on('join-error', (data) => {
        showError(data.error);
    });
    
    socket.on('join-success', (data) => {
        // Stocker les données du joueur
        playerData = data;
        
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
                socket.emit('player-answer', {
                    playerId: playerData.playerId,
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
            socket.emit('player-answer', {
                playerId: playerData.playerId,
                answerIndex: null // Indique qu'aucune réponse n'a été donnée
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
    
    socket.on('game-end', (data) => {
        console.log('Game over:', data);
        
        // Mettre à jour le score final
        currentScoreValue.textContent = currentScore;
        
        // Afficher le résultat final
        finalResult.innerHTML = '';
        
        if (data.leaderboard && data.leaderboard.length > 0) {
            // Déterminer la position du joueur actuel
            let playerPosition = -1;
            let playerScore = 0;
            
            for (let i = 0; i < data.leaderboard.length; i++) {
                const player = data.leaderboard[i];
                if (player.playerName === playerName) {
                    playerPosition = i + 1;
                    playerScore = player.score;
                    
                    // Vérifier si le joueur est le gagnant
                    isWinner = (playerPosition === 1);
                    break;
                }
            }
            
            if (playerPosition > 0) {
                const positionText = getOrdinalSuffix(playerPosition);
                finalResult.innerHTML = `
                    <div class="alert ${playerPosition === 1 ? 'alert-success' : 'alert-primary'}">
                        <h3>Vous avez terminé à la ${positionText} place!</h3>
                        <p>Votre score final: ${playerScore}</p>
                    </div>
                `;
                
                // Afficher le formulaire d'email si le joueur est le gagnant
                if (isWinner) {
                    winnerForm.classList.remove('hidden');
                }
            } else {
                finalResult.innerHTML = `
                    <div class="alert alert-secondary">
                        <h3>Merci d'avoir participé!</h3>
                        <p>Votre score final: ${currentScore}</p>
                    </div>
                `;
            }
        } else {
            finalResult.innerHTML = `
                <div class="alert alert-secondary">
                    <h3>Fin du quiz</h3>
                    <p>Aucun classement disponible.</p>
                </div>
            `;
        }
        
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
