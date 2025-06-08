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
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const playerAnswers = document.getElementById('player-answers');
    const detailedPlayerAnswers = document.getElementById('detailed-player-answers');
    
    const correctAnswerText = document.getElementById('correct-answer-text');
    const explanationText = document.getElementById('explanation-text');
    const scoreTableBody = document.getElementById('score-table-body');
    const winnerName = document.getElementById('winner-name');
    const finalLeaderboardBody = document.getElementById('final-leaderboard-body');
    
    // Élément audio pour nouvelle question
    const newQuestionSound = document.getElementById('new-question-sound');
    
    // Variables d'état
    let currentQuestionData = null;
    let playerAnswersData = {};
    let timerInterval = null;
    let screenTimerCircle = null; // Élément SVG du timer circulaire
    let totalTimerTime = 0; // Durée totale du timer

    // Initialiser Socket.IO
    const socket = io({
        withCredentials: true
    });
    
    // Déterminer l'adresse IP du serveur pour l'affichage
    serverAddress.textContent = window.location.host;
    
    // Initialiser le timer circulaire
    screenTimerCircle = document.getElementById('screen-timer-circle');
    
    // Initialiser l'audio
    initializeAudio();
    
    // Rejoindre en tant qu'écran de présentation
    socket.emit('screen-join');
    
    // Événements Socket.IO communs
    socket.on('connect', () => {
        console.log('Connecté au serveur en tant qu\'écran');
    });
    
    // Gestion des événements Socket.IO spécifiques
    socket.on('game-setup', (data) => {
        console.log('Game setup received:', data);
        // Mettre à jour les codes de session
        if (sessionCode) sessionCode.textContent = data.sessionCode;
        if (joinCode) joinCode.textContent = data.sessionCode;
        if (playerCountValue) playerCountValue.textContent = data.playerCount;
        
        // Afficher la version de l'application
        if (data.appVersion && appVersion) {
            appVersion.textContent = data.appVersion;
        }
        
        // Générer le QR code pour rejoindre directement avec le code de session
        const qrcodeContainer = document.getElementById('qrcode');
        if (qrcodeContainer) {
            // Vider le conteneur au cas où
            qrcodeContainer.innerHTML = '';
            
            // Construire l'URL directe
            const baseUrl = data.baseUrl || window.location.origin;
            const directUrl = `${baseUrl}/play/${data.sessionCode}`;
            
            // Générer le QR code avec qrcode-generator
            try {
                // Vérifier que la bibliothèque est chargée
                if (typeof qrcode !== 'undefined') {
                    // Créer une instance du générateur QR code (type=0 pour QR code standard)
                    const qr = qrcode(0, 'L');
                    // Ajouter les données (URL)
                    qr.addData(directUrl);
                    // Calculer la matrice QR code
                    qr.make();
                    
                    // Ajouter le QR code au conteneur avec une taille de module plus grande pour une meilleure qualité
                    qrcodeContainer.innerHTML = qr.createImgTag(20);
                    
                    console.log('QR Code généré avec succès pour URL:', directUrl);
                } else {
                    throw new Error('Bibliothèque QR code non disponible');
                }
            } catch (error) {
                console.error('Erreur lors de la génération du QR code:', error);
                qrcodeContainer.innerHTML = `<p class="text-dark">URL directe: <a href="${directUrl}" target="_blank">${directUrl}</a></p>`;
            }
        }
    });
    
    socket.on('player-joined', (data) => {
        console.log('Player joined:', data);
        playerCountValue.textContent = data.playerCount;
        
        // Ajouter le joueur à la liste avec un style attrayant
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item p-2 bg-white text-black fw-bold rounded text-center';
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
        
        // Jouer le son de nouvelle question
        playNewQuestionSound();
        
        // Mettre à jour l'affichage
        questionNumber.textContent = data.questionNumber;
        totalQuestions.textContent = data.totalQuestions;
        timeLeft.textContent = data.timeLimit;
        questionText.textContent = data.question;
        
        // Générer les options
        optionsContainer.innerHTML = '';
        data.options.forEach((option, index) => {
            const optionCol = document.createElement('div');
            optionCol.className = 'col-md-6 mb-3';
            
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option text-black fw-bold shadow fs-125';
            optionDiv.textContent = option;
            optionDiv.dataset.index = index;
            
            optionCol.appendChild(optionDiv);
            optionsContainer.appendChild(optionCol);
            
            // Ajouter la classe "show" avec un délai progressif
            // 1ère option: 1 seconde, 2ème option: 2 secondes, etc.
            setTimeout(() => {
                optionDiv.classList.add('show');
            }, (index + 1) * 1000);
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
        totalTimerTime = seconds;
        let timeRemaining = totalTimerTime;
        
        // Mettre à jour l'affichage initial
        timeLeft.textContent = timeRemaining;
        updateScreenCircularTimer(timeRemaining);
        
        // Configurer l'intervalle pour mettre à jour le compteur
        timerInterval = setInterval(() => {
            timeRemaining -= 1;
            
            // Mettre à jour l'affichage
            timeLeft.textContent = timeRemaining;
            updateScreenCircularTimer(timeRemaining);
            
            // Arrêter le timer quand il atteint zéro
            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
            }
        }, 1000);
    }
    
    function updateScreenCircularTimer(timeLeft) {
        if (!screenTimerCircle || totalTimerTime === 0) return;
        
        // Calculer le pourcentage de temps écoulé
        const timeElapsed = totalTimerTime - timeLeft;
        const percentage = timeElapsed / totalTimerTime;
        
        // Calculer l'offset pour le stroke-dashoffset
        // La circonférence est 2 * π * r = 2 * π * 45 ≈ 283
        const circumference = 283;
        const offset = circumference - (percentage * circumference);
        
        // Appliquer l'animation
        screenTimerCircle.style.strokeDashoffset = offset;
    }
    
    function initializeAudio() {
        if (newQuestionSound) {
            // Définir le volume (optionnel, entre 0.0 et 1.0)
            newQuestionSound.volume = 0.7;
            
            // Précharger l'audio
            newQuestionSound.load();
            
            // Ajouter un gestionnaire d'événement pour activer l'audio sur la première interaction
            const enableAudio = () => {
                if (newQuestionSound) {
                    // Jouer et mettre immédiatement en pause pour "débloquer" l'audio
                    newQuestionSound.play().then(() => {
                        newQuestionSound.pause();
                        newQuestionSound.currentTime = 0;
                        console.log('Audio initialisé et prêt');
                    }).catch(() => {
                        // Ignorer les erreurs d'initialisation
                    });
                }
                
                // Supprimer les gestionnaires d'événements après la première interaction
                document.removeEventListener('click', enableAudio);
                document.removeEventListener('keydown', enableAudio);
                document.removeEventListener('touchstart', enableAudio);
            };
            
            // Écouter les interactions utilisateur pour activer l'audio
            document.addEventListener('click', enableAudio, { once: true });
            document.addEventListener('keydown', enableAudio, { once: true });
            document.addEventListener('touchstart', enableAudio, { once: true });
        }
    }
    
    function playNewQuestionSound() {
        if (newQuestionSound) {
            try {
                // Réinitialiser le son au début
                newQuestionSound.currentTime = 0;
                
                // Jouer le son
                const playPromise = newQuestionSound.play();
                
                // Gérer les navigateurs modernes qui requièrent une interaction utilisateur
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('Son de nouvelle question joué');
                    }).catch(error => {
                        console.log('Impossible de jouer le son automatiquement:', error);
                        // Le navigateur bloque la lecture automatique
                        // On pourrait afficher un message à l'utilisateur ou ignorer silencieusement
                    });
                }
            } catch (error) {
                console.error('Erreur lors de la lecture du son:', error);
            }
        }
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