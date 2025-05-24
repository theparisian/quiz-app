document.addEventListener('DOMContentLoaded', () => {
    // Éléments DOM pour les onglets
    const adminTab = document.getElementById('admin-tab');
    const hostTab = document.getElementById('host-tab');
    const adminContent = document.getElementById('admin-content');
    const hostContent = document.getElementById('host-content');

    // Par défaut, masquer l'onglet admin
    adminTab.style.display = 'none';

    // Éléments DOM de la partie host
    const sessionCode = document.getElementById('session-code');
    const joinCode = document.getElementById('join-code');
    const serverAddress = document.getElementById('server-address');
    const playerCountValue = document.getElementById('player-count-value');
    const playerList = document.getElementById('player-list');
    const startGameBtn = document.getElementById('start-game-btn');
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
    
    const correctAnswerText = document.getElementById('correct-answer-text');
    const explanationText = document.getElementById('explanation-text');
    const scoreTableBody = document.getElementById('score-table-body');
    
    const nextQuestionBtn = document.getElementById('next-question-btn');
    const newGameBtn = document.getElementById('new-game-btn');

    // Éléments DOM de la partie admin
    const createQuizBtn = document.getElementById('create-quiz-btn');
    const quizList = document.getElementById('quiz-list');
    const quizEditor = document.getElementById('quiz-editor');
    const editorTitle = document.getElementById('editor-title');
    const questionsContainer = document.getElementById('questions-container');
    const addQuestionBtn = document.getElementById('add-question-btn');
    const saveQuizBtn = document.getElementById('save-quiz-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const quizNameInput = document.getElementById('quiz-name');
    const quizDescriptionInput = document.getElementById('quiz-description');
    
    // Modal elements
    const confirmationModal = document.getElementById('confirmation-modal');
    const modalMessage = document.getElementById('modal-message');
    const confirmActionBtn = document.getElementById('confirm-action-btn');
    const cancelActionBtn = document.getElementById('cancel-action-btn');
    
    // Templates
    const questionTemplate = document.getElementById('question-template');
    const quizRowTemplate = document.getElementById('quiz-row-template');
    
    // Variables d'état de la partie admin
    let quizzes = [];
    let currentEditingQuizId = null;
    let questionCounter = 0;
    let pendingAction = null;
    
    // Initialiser Socket.IO
    const socket = io({
        withCredentials: true
    });
    
    // Déterminer l'adresse IP du serveur pour l'affichage
    serverAddress.textContent = window.location.host;
    
    // Variables d'état de la partie host
    let currentQuestionData = null;

    // Fonctions d'initialisation
    function initTabs() {
        // Les onglets sont maintenant gérés par Bootstrap, donc nous n'avons pas besoin
        // d'ajouter des gestionnaires d'événements personnalisés pour les changements d'onglets
        
        // Par défaut, nous voulons vérifier si l'utilisateur est admin et afficher/masquer l'onglet admin en conséquence
        if (!isAdmin) {
            document.getElementById('admin-tab').parentElement.classList.add('d-none');
        }
    }
    
    // Rejoindre en tant qu'hôte
    socket.emit('host-join');
    
    // Événements Socket.IO communs
    socket.on('connect', () => {
        console.log('Connecté au serveur');
    });
    
    // Événements Socket.IO partie host
    socket.on('game-setup', (data) => {
        console.log('Game setup received:', data);
        sessionCode.textContent = data.sessionCode;
        joinCode.textContent = data.sessionCode;
        playerCountValue.textContent = data.playerCount;
        
        // Afficher le nom d'utilisateur connecté
        const usernameElement = document.getElementById('username');
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const isConnected = data.username && data.username !== 'Non connecté';
        
        if (usernameElement) {
            usernameElement.textContent = data.username || 'Non connecté';
        }
        
        // Afficher le bouton approprié en fonction de l'état de connexion
        if (loginBtn && logoutBtn) {
            if (isConnected) {
                loginBtn.style.display = 'none';
                logoutBtn.style.display = 'inline-block';
            } else {
                loginBtn.style.display = 'inline-block';
                logoutBtn.style.display = 'none';
            }
        }
        
        // Afficher la version de l'application
        if (data.appVersion) {
            appVersion.textContent = data.appVersion;
        }
        
        // Afficher l'onglet admin si l'utilisateur est administrateur
        if (data.isAdmin) {
            adminTab.style.display = 'block';
        }
        
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
    
    socket.on('game-end', (data) => {
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
    
    // Gestionnaires d'événements partie host
    startGameBtn.addEventListener('click', () => {
        socket.emit('start-game');
    });
    
    nextQuestionBtn.addEventListener('click', () => {
        socket.emit('request-next-question');
    });
    
    newGameBtn.addEventListener('click', () => {
        socket.emit('reset-game');
    });
    
    // Fonctions utilitaires partie host
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

    // Événements Socket.IO partie admin
    socket.on('admin-init-response', (data) => {
        // Vérifier s'il y a une erreur
        if (data.error) {
            showNotification('Erreur: ' + data.error, 'error');
            return;
        }
        
        // Afficher la version de l'application
        if (data.appVersion) {
            appVersion.textContent = data.appVersion;
        }
        
        // Charger la liste des quiz
        quizzes = data.quizzes || [];
        renderQuizList();
    });
    
    socket.on('quiz-list-updated', (data) => {
        quizzes = data.quizzes || [];
        renderQuizList();
    });
    
    socket.on('quiz-saved', (data) => {
        if (data.success) {
            // Fermer l'éditeur et rafraîchir la liste
            hideEditor();
            socket.emit('get-quiz-list');
            showNotification('Quiz enregistré avec succès!', 'success');
        } else {
            showNotification('Erreur lors de l\'enregistrement du quiz: ' + data.message, 'error');
        }
    });
    
    socket.on('quiz-deleted', (data) => {
        if (data.success) {
            socket.emit('get-quiz-list');
            showNotification('Quiz supprimé avec succès!', 'success');
        } else {
            showNotification('Erreur lors de la suppression du quiz: ' + data.message, 'error');
        }
    });
    
    socket.on('quiz-activated', (data) => {
        if (data.success) {
            socket.emit('get-quiz-list');
            showNotification('Le quiz a été activé avec succès!', 'success');
        } else {
            showNotification('Erreur lors de l\'activation du quiz: ' + data.message, 'error');
        }
    });

    // Gestionnaires d'événements partie admin
    if (createQuizBtn) {
        createQuizBtn.addEventListener('click', () => {
            showEditor();
        });
    }
    
    if (addQuestionBtn) {
        addQuestionBtn.addEventListener('click', () => {
            addNewQuestion();
        });
    }
    
    if (saveQuizBtn) {
        saveQuizBtn.addEventListener('click', () => {
            saveQuiz();
        });
    }
    
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            hideEditor();
        });
    }
    
    if (confirmActionBtn) {
        confirmActionBtn.addEventListener('click', () => {
            if (pendingAction) {
                pendingAction();
                pendingAction = null;
            }
            hideModal();
        });
    }
    
    if (cancelActionBtn) {
        cancelActionBtn.addEventListener('click', () => {
            pendingAction = null;
            hideModal();
        });
    }
    
    // Fonctions de gestion des quiz pour la partie admin
    function renderQuizList() {
        if (!quizList) return;
        
        quizList.innerHTML = '';
        
        if (quizzes.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="4" style="text-align: center;">Aucun quiz disponible</td>';
            quizList.appendChild(emptyRow);
            return;
        }
        
        quizzes.forEach(quiz => {
            const quizRow = quizRowTemplate.content.cloneNode(true);
            
            // Remplir les informations du quiz
            quizRow.querySelector('.quiz-name').textContent = quiz.name;
            quizRow.querySelector('.quiz-questions').textContent = quiz.questions ? quiz.questions.length : 0;
            
            const statusCell = quizRow.querySelector('.quiz-status');
            if (quiz.active) {
                statusCell.innerHTML = '<span class="status-active">Actif</span>';
                quizRow.querySelector('.activate-quiz-btn').disabled = true;
                quizRow.querySelector('.activate-quiz-btn').textContent = 'Actif';
            } else {
                statusCell.innerHTML = '<span class="status-inactive">Inactif</span>';
            }
            
            // Ajouter les gestionnaires d'événements pour les boutons
            quizRow.querySelector('.activate-quiz-btn').addEventListener('click', () => {
                activateQuiz(quiz.id);
            });
            
            quizRow.querySelector('.edit-quiz-btn').addEventListener('click', () => {
                editQuiz(quiz.id);
            });
            
            quizRow.querySelector('.delete-quiz-btn').addEventListener('click', () => {
                confirmDeleteQuiz(quiz.id, quiz.name);
            });
            
            quizList.appendChild(quizRow);
        });
    }
    
    function showEditor(quizData = null) {
        // Réinitialiser l'éditeur
        questionCounter = 0;
        questionsContainer.innerHTML = '';
        
        if (quizData) {
            // Mode édition
            currentEditingQuizId = quizData.id;
            editorTitle.textContent = 'Modifier Quiz';
            quizNameInput.value = quizData.name || '';
            quizDescriptionInput.value = quizData.description || '';
            
            // Ajouter les questions existantes
            if (quizData.questions && quizData.questions.length > 0) {
                quizData.questions.forEach(question => {
                    addNewQuestion(question);
                });
            }
        } else {
            // Mode création
            currentEditingQuizId = null;
            editorTitle.textContent = 'Créer un nouveau Quiz';
            quizNameInput.value = '';
            quizDescriptionInput.value = '';
            
            // Ajouter une question vide par défaut
            addNewQuestion();
        }
        
        // Afficher l'éditeur
        document.querySelector('.quiz-management-section').classList.add('hidden');
        quizEditor.classList.remove('hidden');
    }
    
    function hideEditor() {
        document.querySelector('.quiz-management-section').classList.remove('hidden');
        quizEditor.classList.add('hidden');
        currentEditingQuizId = null;
    }
    
    function addNewQuestion(questionData = null) {
        questionCounter++;
        
        // Cloner le template
        const newQuestion = questionTemplate.content.cloneNode(true);
        
        // Mettre à jour le numéro de question
        newQuestion.querySelector('.question-number').textContent = questionCounter;
        
        // Mettre à jour les noms des boutons radio pour ce groupe
        const radioInputs = newQuestion.querySelectorAll('.correct-option');
        radioInputs.forEach(input => {
            input.name = `correct-option-${questionCounter}`;
        });
        
        // Remplir les données si disponibles
        if (questionData) {
            newQuestion.querySelector('.question-text').value = questionData.question || '';
            newQuestion.querySelector('.question-explanation').value = questionData.explanation || '';
            
            // Remplir les options et sélectionner la correcte
            const optionInputs = newQuestion.querySelectorAll('.option-text');
            const radioInputs = newQuestion.querySelectorAll('.correct-option');
            
            questionData.options.forEach((option, index) => {
                if (index < optionInputs.length) {
                    optionInputs[index].value = option;
                }
            });
            
            // Sélectionner la bonne réponse
            if (questionData.correctIndex !== undefined && questionData.correctIndex < radioInputs.length) {
                radioInputs[questionData.correctIndex].checked = true;
            }
        }
        
        // Ajouter l'événement de suppression
        newQuestion.querySelector('.remove-question-btn').addEventListener('click', function() {
            this.closest('.question-item').remove();
            updateQuestionNumbers();
        });
        
        // Ajouter la question au conteneur
        questionsContainer.appendChild(newQuestion);
    }
    
    function updateQuestionNumbers() {
        const questions = document.querySelectorAll('.question-item');
        questions.forEach((question, index) => {
            question.querySelector('.question-number').textContent = index + 1;
        });
    }
    
    function saveQuiz() {
        // Valider le formulaire
        if (!quizNameInput.value) {
            alert('Veuillez entrer un nom pour le quiz');
            quizNameInput.focus();
            return;
        }
        
        // Récupérer les questions
        const questions = [];
        const questionItems = document.querySelectorAll('.question-item');
        
        if (questionItems.length === 0) {
            alert('Veuillez ajouter au moins une question');
            return;
        }
        
        for (let i = 0; i < questionItems.length; i++) {
            const item = questionItems[i];
            const questionText = item.querySelector('.question-text').value;
            const explanation = item.querySelector('.question-explanation').value;
            
            if (!questionText) {
                alert(`La question ${i+1} n'a pas de texte`);
                item.querySelector('.question-text').focus();
                return;
            }
            
            // Récupérer les options
            const options = [];
            const optionInputs = item.querySelectorAll('.option-text');
            let hasEmptyOption = false;
            
            optionInputs.forEach(input => {
                if (!input.value) {
                    hasEmptyOption = true;
                }
                options.push(input.value);
            });
            
            if (hasEmptyOption) {
                alert(`Une ou plusieurs options de la question ${i+1} sont vides`);
                return;
            }
            
            // Récupérer l'index de la réponse correcte
            const correctRadios = item.querySelectorAll('.correct-option');
            let correctIndex = -1;
            
            correctRadios.forEach((radio, index) => {
                if (radio.checked) {
                    correctIndex = index;
                }
            });
            
            if (correctIndex === -1) {
                alert(`Veuillez sélectionner une réponse correcte pour la question ${i+1}`);
                return;
            }
            
            questions.push({
                question: questionText,
                options: options,
                correctIndex: correctIndex,
                explanation: explanation
            });
        }
        
        // Créer l'objet quiz
        const quizData = {
            id: currentEditingQuizId,
            name: quizNameInput.value,
            description: quizDescriptionInput.value,
            questions: questions
        };
        
        // Envoyer au serveur
        socket.emit('save-quiz', quizData);
    }
    
    function editQuiz(quizId) {
        const quiz = quizzes.find(q => q.id === quizId);
        if (quiz) {
            showEditor(quiz);
        }
    }
    
    function confirmDeleteQuiz(quizId, quizName) {
        modalMessage.textContent = `Êtes-vous sûr de vouloir supprimer le quiz "${quizName}" ?`;
        pendingAction = () => deleteQuiz(quizId);
        showModal();
    }
    
    function deleteQuiz(quizId) {
        socket.emit('delete-quiz', { id: quizId });
    }
    
    function activateQuiz(quizId) {
        socket.emit('activate-quiz', { id: quizId });
    }
    
    function showModal() {
        confirmationModal.classList.remove('hidden');
    }
    
    function hideModal() {
        confirmationModal.classList.add('hidden');
    }
    
    function showNotification(message, type = 'info') {
        // Dans une application réelle, nous afficherions une notification
        console.log(`[${type}] ${message}`);
        
        // Alternative simple: utiliser alert()
        alert(message);
    }

    // Initialiser l'interface
    socket.emit('host-join');

    // Bootstrap Tab Events
    document.getElementById('admin-tab').addEventListener('shown.bs.tab', function (e) {
        // Initialiser la partie admin si elle n'a pas encore été chargée
        if (quizzes.length === 0) {
            socket.emit('admin-init');
        }
    });
});
