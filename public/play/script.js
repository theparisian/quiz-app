// Player Interface JavaScript (public/play/script.js)
document.addEventListener('DOMContentLoaded', () => {
    // Éléments DOM
    const playerNameInput = document.getElementById('player-name');
    const sessionCodeInput = document.getElementById('session-code');
    const verifyCodeBtn = document.getElementById('verify-code-btn');
    const joinBtn = document.getElementById('join-btn');
    const sessionError = document.getElementById('session-error');
    const nameError = document.getElementById('name-error');
    const codeDisplay = document.getElementById('code-display');
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
    
    const finalResult = document.getElementById('final-result');
    const winnerForm = document.getElementById('winner-form');
    const winnerEmailInput = document.getElementById('winner-email');
    const submitEmailBtn = document.getElementById('submit-email-btn');
    const emailSuccess = document.getElementById('email-success');
    const emailError = document.getElementById('email-error');
    
    // Écrans
    const sessionCodeScreen = document.getElementById('session-code-screen');
    const playerNameScreen = document.getElementById('player-name-screen');
    const waitingScreen = document.getElementById('waiting-screen');
    const questionScreen = document.getElementById('question-screen');
    const answerResultScreen = document.getElementById('answer-result-screen');
    const finalScreen = document.getElementById('final-screen');
    
    // Connexion Socket.IO
    const socket = io({
        withCredentials: true
    });
    
    // Variables d'état local
    let playerName = '';
    let sessionCode = '';
    let isSessionValid = false;
    let playerData = null; // Stocke les données du joueur, y compris son ID
    let currentScore = 0;
    let currentOptions = [];
    let selectedAnswerIndex = null;
    let hasAnswered = false;
    let answerResultData = null; // Stocker les données de résultat pour les afficher plus tard
    let isWinner = false; // Indique si le joueur est le gagnant
    let totalTime = 0; // Durée totale du timer
    let timerCircle = null; // Élément SVG du timer circulaire
    
    // Vérifier si un code de session est présent dans l'URL
    function checkSessionCodeInUrl() {
        // Récupérer le chemin de l'URL actuelle
        const pathParts = window.location.pathname.split('/');
        
        // Si l'URL est du type /play/123456, le code de session est dans pathParts[2]
        if (pathParts.length >= 3 && pathParts[1] === 'play') {
            const codeFromUrl = pathParts[2];
            
            if (codeFromUrl && codeFromUrl.length > 0) {
                // Enregistrer le code de session
                sessionCode = codeFromUrl;
                
                // Afficher le code dans l'écran de pseudonyme
                codeDisplay.textContent = sessionCode;
                
                // Vérifier le code de session
                socket.emit('verify-session', {
                    sessionCode: sessionCode
                });
                
                return true;
            }
        }
        
        return false;
    }
    
    // Initialisation
    function init() {
        // Vérifier si un code de session est présent dans l'URL
        if (!checkSessionCodeInUrl()) {
            // Si aucun code n'est présent, afficher l'écran de saisie du code
            showScreen(sessionCodeScreen);
        }
    }
    
    // Gestionnaires d'événements pour la vérification du code de session
    verifyCodeBtn.addEventListener('click', () => {
        console.log('Bouton verify-code-btn cliqué !');
        const code = sessionCodeInput.value.trim();
        console.log('Code saisi:', code);
        
        if (!code) {
            console.log('Code vide, affichage de l\'erreur');
            showSessionError('Veuillez entrer le code de session.');
            return;
        }
        
        console.log('Envoi de la demande de vérification au serveur...');
        // Envoyer la demande de vérification du code
        socket.emit('verify-session', {
            sessionCode: code
        });
        
        // Stocker le code de session temporairement
        sessionCode = code;
    });
    

    
    // Gestionnaire d'événement pour la connexion finale
    joinBtn.addEventListener('click', () => {
        const name = playerNameInput.value.trim();
        
        if (!name) {
            showNameError('Veuillez entrer votre pseudonyme.');
            return;
        }
        
        playerName = name;
        
        // Envoyer la demande de connexion
        socket.emit('player-join', {
            playerName: name,
            sessionCode: sessionCode
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
        console.log('Connecté au serveur avec l\'ID :', socket.id);
    });
    
    socket.on('disconnect', () => {
        console.log('Déconnecté du serveur');
    });
    
    socket.on('connect_error', (error) => {
        console.error('Erreur de connexion Socket.IO :', error);
    });
    
    // Réponse à la vérification du code session
    socket.on('session-verified', (data) => {
        console.log('Session vérifiée avec succès !', data);
        isSessionValid = true;
        
        // Afficher le code dans l'écran de pseudonyme
        codeDisplay.textContent = sessionCode;
        
        // Passer à l'écran de saisie du pseudonyme
        showScreen(playerNameScreen);
        
        // Focus sur le champ de pseudonyme
        playerNameInput.focus();
    });
    
    socket.on('session-invalid', (data) => {
        console.log('Session invalide :', data);
        showSessionError(data.error || 'Code de session invalide.');
    });
    
    socket.on('join-error', (data) => {
        showNameError(data.error);
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
        
        // Initialiser le timer circulaire
        totalTime = data.timeLimit;
        console.log('Initialisation timer avec totalTime:', totalTime);
        updateCircularTimer(data.timeLimit);
        
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
            optionElement.className = `option-btn w-100 text-center option-${index}`;
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
        console.log('Timer update reçu:', data.timeLeft);
        timeLeftSpan.textContent = data.timeLeft;
        updateCircularTimer(data.timeLeft);
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
        if (data.isCorrect) {
            resultStatus.textContent = 'Correct!';
            resultStatus.className = 'mb-2 fs-5 fw-bold correct';
            pointsEarned.textContent = `+${data.pointsEarned} points`;
        } else {
            resultStatus.textContent = 'Incorrect!';
            resultStatus.className = 'mb-2 fs-5 fw-bold incorrect';
            pointsEarned.textContent = '0 point';
        }
        
        showScreen(answerResultScreen);
    }
    
    socket.on('question-results', (data) => {
        // Ne rien faire ici, car les résultats sont affichés sur l'écran principal
        // Nous restons sur l'écran answer-result-screen jusqu'à la prochaine question
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
        resetGame();
    });
    
    // Fonctions utilitaires
    function showScreen(screenToShow) {
        // Cacher tous les écrans
        sessionCodeScreen.classList.remove('active');
        playerNameScreen.classList.remove('active');
        waitingScreen.classList.remove('active');
        questionScreen.classList.remove('active');
        answerResultScreen.classList.remove('active');
        finalScreen.classList.remove('active');
        
        // Afficher l'écran demandé
        screenToShow.classList.add('active');
        
        // Focus sur le champ d'entrée approprié si présent
        if (screenToShow === sessionCodeScreen) {
            sessionCodeInput.focus();
        } else if (screenToShow === playerNameScreen) {
            playerNameInput.focus();
        }
    }
    
    function resetGame() {
        // Réinitialiser les variables d'état
        playerName = '';
        sessionCode = '';
        isSessionValid = false;
        playerData = null;
        currentScore = 0;
        
        // Réinitialiser les champs de formulaire
        sessionCodeInput.value = '';
        playerNameInput.value = '';
        
        // Cacher les informations du joueur
        playerInfo.classList.add('hidden');
        scoreValue.textContent = '0';
        
        // Réinitialiser l'interface
        optionsContainer.classList.remove('active');
        
        // Réinitialiser le formulaire d'email
        winnerForm.classList.add('hidden');
        winnerEmailInput.value = '';
        emailSuccess.classList.add('hidden');
        emailError.classList.add('hidden');
        
        // Revenir à l'écran initial
        showScreen(sessionCodeScreen);
    }
    
    function showSessionError(message) {
        sessionError.textContent = message;
        sessionError.classList.remove('hidden');
        setTimeout(() => {
            sessionError.classList.add('hidden');
        }, 5000);
    }
    
    function showNameError(message) {
        nameError.textContent = message;
        nameError.classList.remove('hidden');
        setTimeout(() => {
            nameError.classList.add('hidden');
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
    
    function updateCircularTimer(timeLeft) {
        console.log('updateCircularTimer appelé avec timeLeft:', timeLeft, 'totalTime:', totalTime, 'timerCircle:', !!timerCircle);
        
        if (!timerCircle) {
            console.error('timerCircle non trouvé !');
            return;
        }
        
        if (totalTime === 0) {
            console.error('totalTime est 0 !');
            return;
        }
        
        // Calculer le pourcentage de temps écoulé
        const timeElapsed = totalTime - timeLeft;
        const percentage = timeElapsed / totalTime;
        
        // Calculer l'offset pour le stroke-dashoffset
        // La circonférence est 2 * π * r = 2 * π * 45 ≈ 283
        const circumference = 283;
        const offset = circumference - (percentage * circumference);
        
        console.log('Mise à jour timer: percentage:', percentage, 'offset:', offset);
        
        // Appliquer l'animation
        timerCircle.style.strokeDashoffset = offset;
    }
    
    // Initialiser le timer circulaire AVANT l'init
    timerCircle = document.getElementById('timer-circle');
    console.log('Timer circle element:', timerCircle);
    
    // Initialiser l'application
    init();
});
