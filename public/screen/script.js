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
    

    const explanationText = document.getElementById('explanation-text');
    const scoreTableBody = document.getElementById('score-table-body');
    const winnerName = document.getElementById('winner-name');
    const finalLeaderboardBody = document.getElementById('final-leaderboard-body');
    
    // Éléments audio pour nouvelle question et options
    const newQuestionSound = document.getElementById('new-question-sound');
    const backgroundMusic = document.getElementById('background-music');
    const correctAnswerSound = document.getElementById('correct-answer-sound');
    const optionSounds = [
        document.getElementById('option-0-sound'),
        document.getElementById('option-1-sound'),
        document.getElementById('option-2-sound'),
        document.getElementById('option-3-sound')
    ];
    
    // Debug: vérifier que les éléments audio sont trouvés
    console.log('New question sound:', newQuestionSound);
    console.log('Background music:', backgroundMusic);
    console.log('Correct answer sound:', correctAnswerSound);
    console.log('Option sounds:', optionSounds.filter(s => s !== null));
    
    // Variables d'état
    let currentQuestionData = null;
    let playerAnswersData = {};
    let connectedPlayers = {}; // Liste des joueurs connectés
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
    
    // Test automatique de l'autoplay
    function testAutoplay() {
        if (newQuestionSound) {
            newQuestionSound.play().then(() => {
                // L'autoplay fonctionne !
                newQuestionSound.pause();
                newQuestionSound.currentTime = 0;
                console.log('✅ Autoplay déjà autorisé, masquage du bouton');
                
                // Masquer le bouton car l'autoplay fonctionne
                const btn = document.getElementById('audio-enable-btn');
                if (btn) {
                    btn.style.display = 'none';
                }
            }).catch(() => {
                // L'autoplay est bloqué, garder le bouton visible
                console.log('⚠️ Autoplay bloqué, bouton d\'activation visible');
            });
        }
    }
    
    // Tester l'autoplay au chargement de la page
    setTimeout(testAutoplay, 1000);
    
    // Fonction globale pour activer l'audio manuellement
    window.enableAudioManually = function() {
        console.log('🔊 Activation manuelle de l\'audio...');
        
        // Essayer de débloquer tous les sons
        if (newQuestionSound) {
            newQuestionSound.play().then(() => {
                newQuestionSound.pause();
                newQuestionSound.currentTime = 0;
                console.log('✅ Son de nouvelle question débloqué');
            }).catch(() => {});
        }
        
        // Débloquer le son de bonne réponse
        if (correctAnswerSound) {
            correctAnswerSound.play().then(() => {
                correctAnswerSound.pause();
                correctAnswerSound.currentTime = 0;
                console.log('✅ Son de bonne réponse débloqué');
            }).catch(() => {});
        }

        optionSounds.forEach((sound, index) => {
            if (sound) {
                sound.play().then(() => {
                    sound.pause();
                    sound.currentTime = 0;
                    console.log(`✅ Son option ${index} débloqué`);
                }).catch(() => {});
            }
        });
        
        // Masquer le bouton après activation
        const btn = document.getElementById('audio-enable-btn');
        if (btn) {
            btn.style.display = 'none';
        }
        
        console.log('🎵 Audio activé ! Les sons devraient maintenant fonctionner.');
    };
    
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
        
        // Ajouter le joueur à la liste locale
        connectedPlayers[data.playerId] = {
            name: data.playerName,
            id: data.playerId
        };
        
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
        
        // Supprimer le joueur de la liste locale
        delete connectedPlayers[data.playerId];
        
        // Supprimer le joueur de la liste
        const playerElement = document.querySelector(`.player-item[data-player-id="${data.playerId}"]`);
        if (playerElement) {
            playerElement.remove();
        }
    });
    
    socket.on('game-started', () => {
        console.log('Game started');
        startBackgroundMusic();
        // Rien à faire spécifiquement, le serveur enverra la première question
    });
    
    socket.on('new-question', (data) => {
        console.log('🔥 EVENT new-question reçu côté screen:', data);
        
        // Vérification de sécurité
        if (!data || !data.options || !Array.isArray(data.options)) {
            console.error('❌ Données de question invalides:', data);
            return;
        }
        
        console.log('✅ Données de question valides, traitement en cours...');
        
        currentQuestionData = data;
        playerAnswersData = {}; // Réinitialiser les réponses des joueurs
        
        // Jouer le son de nouvelle question
        playNewQuestionSound();
        
        // Mettre à jour l'affichage
        if (questionNumber) questionNumber.textContent = data.questionNumber || '';
        if (totalQuestions) totalQuestions.textContent = data.totalQuestions || '';
        if (timeLeft) timeLeft.textContent = data.timeLimit || '';
        if (questionText) questionText.textContent = data.question || '';
        
        // Générer les options
        optionsContainer.innerHTML = '';
        data.options.forEach((option, index) => {
            const optionCol = document.createElement('div');
            optionCol.className = 'col-md-6 mb-3 position-relative';
            
            const optionDiv = document.createElement('div');
            optionDiv.className = `option fw-bold w-100 shadow fs-125 option-${index}`;
            optionDiv.textContent = option;
            optionDiv.dataset.index = index;
            
            optionCol.appendChild(optionDiv);
            optionsContainer.appendChild(optionCol);
            
            // Ajouter la classe "show" avec un délai progressif
            // 1ère option: 1 seconde, 2ème option: 2 secondes, etc.
            setTimeout(() => {
                try {
                    optionDiv.classList.add('show');
                    // Jouer le son correspondant à cette option
                    playOptionSound(index);
                } catch (error) {
                    console.error('Erreur lors de l\'ajout de la classe show ou du son:', error);
                }
            }, (index + 1) * 1000);
        });
        
        // Vider le conteneur des réponses des joueurs
        playerAnswers.innerHTML = '';
        
        // Créer tous les éléments player-answer pour les joueurs connectés
        Object.values(connectedPlayers).forEach(player => {
            const playerAnswerElement = document.createElement('div');
            playerAnswerElement.className = 'player-answer';
            playerAnswerElement.textContent = player.name;
            playerAnswerElement.dataset.playerId = player.id;
            playerAnswers.appendChild(playerAnswerElement);
        });
        
        // Afficher l'écran de question
        console.log('🖥️ Tentative d\'affichage de l\'écran de question...');
        showScreen(questionScreen);
        console.log('✅ Écran de question affiché');
        
        // Démarrer le compteur
        console.log('⏰ Démarrage du timer:', data.timeLimit);
        startTimer(data.timeLimit);
    });
    
    socket.on('player-answer', (data) => {
        console.log('Player answer:', data);
        
        // Stocker la réponse du joueur
        playerAnswersData[data.playerId] = {
            playerName: data.playerName,
            answerIndex: data.answerIndex
        };
        
        // Ajouter la classe "active" à l'élément player-answer existant
        const playerAnswerElement = document.querySelector(`.player-answer[data-player-id="${data.playerId}"]`);
        if (playerAnswerElement) {
            playerAnswerElement.classList.add('active');
        }
    });
    
    socket.on('question-results', (data) => {
        console.log('Question results:', data);
        

        
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
        
        // Ajouter la classe "correct" à la bonne option pour l'animation
        const correctOptionElement = document.querySelector(`.option[data-index="${data.correctIndex}"]`);
        if (correctOptionElement) {
            correctOptionElement.classList.add('correct');
            console.log('Classe "correct" ajoutée à l\'option', data.correctIndex);
            
            // Jouer le son de bonne réponse
            playCorrectAnswerSound();
        }
        
        // Attendre 10 secondes puis afficher l'écran de résultats
        setTimeout(() => {
            showScreen(resultsScreen);
        }, 100000); // 10 secondes = 10000 millisecondes
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
        
        // Arrêter la musique de fond
        stopBackgroundMusic();
        
        // Réinitialiser les variables d'état
        currentQuestionData = null;
        playerAnswersData = {};
        connectedPlayers = {};
        
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
        // Initialiser l'audio de nouvelle question
        if (newQuestionSound) {
            // Définir le volume (optionnel, entre 0.0 et 1.0)
            newQuestionSound.volume = 0.7;
            // Précharger l'audio
            newQuestionSound.load();
        }
        
        // Initialiser la musique de fond
        if (backgroundMusic) {
            backgroundMusic.volume = 0.3; // Volume plus bas pour ne pas gêner
            backgroundMusic.load();
        }

        // Initialiser le son de bonne réponse
        if (correctAnswerSound) {
            correctAnswerSound.volume = 0.8; // Volume un peu plus fort pour l'effet
            correctAnswerSound.load();
        }
        
        // Initialiser les sons d'options
        if (optionSounds) {
            optionSounds.forEach((sound, index) => {
                if (sound) {
                    sound.volume = 0.5; // Volume un peu plus bas pour les options
                    sound.load();
                } else {
                    console.log(`Element audio option-${index} non trouvé`);
                }
            });
        }
        
        // Ajouter un gestionnaire d'événement pour activer l'audio sur la première interaction
        const enableAudio = () => {
            if (newQuestionSound) {
                // Jouer et mettre immédiatement en pause pour "débloquer" l'audio
                newQuestionSound.play().then(() => {
                    newQuestionSound.pause();
                    newQuestionSound.currentTime = 0;
                    console.log('Audio de nouvelle question initialisé');
                }).catch(() => {
                    // Ignorer les erreurs d'initialisation
                });
            }
            
            // Initialiser la musique de fond
            if (backgroundMusic) {
                backgroundMusic.play().then(() => {
                    backgroundMusic.pause();
                    backgroundMusic.currentTime = 0;
                    console.log('Musique de fond initialisée');
                }).catch(() => {
                    // Ignorer les erreurs d'initialisation
                });
            }

            // Initialiser le son de bonne réponse
            if (correctAnswerSound) {
                correctAnswerSound.play().then(() => {
                    correctAnswerSound.pause();
                    correctAnswerSound.currentTime = 0;
                    console.log('Audio de bonne réponse initialisé');
                }).catch(() => {
                    // Ignorer les erreurs d'initialisation
                });
            }
            
            // Initialiser tous les sons d'options
            if (optionSounds) {
                optionSounds.forEach((sound, index) => {
                    if (sound) {
                        sound.play().then(() => {
                            sound.pause();
                            sound.currentTime = 0;
                            console.log(`Audio option ${index} initialisé`);
                        }).catch(() => {
                            // Ignorer les erreurs d'initialisation
                        });
                    }
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
    
    function playCorrectAnswerSound() {
        if (correctAnswerSound) {
            try {
                // Réinitialiser le son au début
                correctAnswerSound.currentTime = 0;
                
                // Jouer le son
                const playPromise = correctAnswerSound.play();
                
                // Gérer les navigateurs modernes qui requièrent une interaction utilisateur
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('🎉 Son de bonne réponse joué');
                    }).catch(error => {
                        console.log('Impossible de jouer le son de bonne réponse:', error);
                    });
                }
            } catch (error) {
                console.error('Erreur lors de la lecture du son de bonne réponse:', error);
            }
        }
    }

    function playOptionSound(optionIndex) {
        // Vérification de sécurité
        if (!optionSounds || optionIndex < 0 || optionIndex >= optionSounds.length) {
            console.log(`Index d'option invalide: ${optionIndex}`);
            return;
        }
        
        const sound = optionSounds[optionIndex];
        if (sound) {
            try {
                // Réinitialiser le son au début
                sound.currentTime = 0;
                
                // Jouer le son
                const playPromise = sound.play();
                
                // Gérer les navigateurs modernes qui requièrent une interaction utilisateur
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log(`Son de l'option ${optionIndex} joué`);
                    }).catch(error => {
                        console.log(`Impossible de jouer le son de l'option ${optionIndex}:`, error);
                    });
                }
            } catch (error) {
                console.error(`Erreur lors de la lecture du son de l'option ${optionIndex}:`, error);
            }
        } else {
            console.log(`Element audio pour l'option ${optionIndex} non trouvé`);
        }
    }
    
    function startBackgroundMusic() {
        if (backgroundMusic) {
            try {
                backgroundMusic.currentTime = 0;
                const playPromise = backgroundMusic.play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('🎵 Musique de fond démarrée');
                    }).catch(error => {
                        console.log('Impossible de jouer la musique de fond:', error);
                    });
                }
            } catch (error) {
                console.error('Erreur lors du démarrage de la musique de fond:', error);
            }
        }
    }
    
    function stopBackgroundMusic() {
        if (backgroundMusic) {
            try {
                backgroundMusic.pause();
                backgroundMusic.currentTime = 0;
                console.log('🎵 Musique de fond arrêtée');
            } catch (error) {
                console.error('Erreur lors de l\'arrêt de la musique de fond:', error);
            }
        }
    }
    
    function showScreen(screenToShow) {
        console.log('📺 showScreen appelé pour:', screenToShow.id);
        
        // Masquer tous les écrans
        waitingScreen.classList.remove('active');
        questionScreen.classList.remove('active');
        resultsScreen.classList.remove('active');
        finalScreen.classList.remove('active');
        
        // Afficher l'écran demandé
        screenToShow.classList.add('active');
        
        console.log('📺 Écran actuel:', screenToShow.id);
    }
}); 