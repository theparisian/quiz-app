// Admin Interface JavaScript (public/admin/script.js)
document.addEventListener('DOMContentLoaded', () => {
    // Éléments DOM
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
    const username = document.getElementById('username');
    const appVersion = document.getElementById('app-version');
    
    // Modal elements
    const confirmationModal = document.getElementById('confirmation-modal');
    const modalMessage = document.getElementById('modal-message');
    const confirmActionBtn = document.getElementById('confirm-action-btn');
    const cancelActionBtn = document.getElementById('cancel-action-btn');
    
    // Templates
    const questionTemplate = document.getElementById('question-template');
    const quizRowTemplate = document.getElementById('quiz-row-template');
    
    // Variables d'état
    let quizzes = [];
    let currentEditingQuizId = null;
    let questionCounter = 0;
    let pendingAction = null;

    // Connexion Socket.IO
    const socket = io();
    
    // Événements Socket.IO
    socket.on('connect', () => {
        console.log('Connecté au serveur en tant qu\'administrateur');
        // Récupérer les informations d'utilisateur et la liste des quiz
        socket.emit('admin-init');
    });
    
    socket.on('admin-init-response', (data) => {
        // Afficher le nom d'utilisateur
        username.textContent = data.username || 'Admin';
        
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
    
    // Gestionnaires d'événements
    createQuizBtn.addEventListener('click', () => {
        showEditor();
    });
    
    addQuestionBtn.addEventListener('click', () => {
        addNewQuestion();
    });
    
    saveQuizBtn.addEventListener('click', () => {
        saveQuiz();
    });
    
    cancelEditBtn.addEventListener('click', () => {
        hideEditor();
    });
    
    confirmActionBtn.addEventListener('click', () => {
        if (pendingAction) {
            pendingAction();
            pendingAction = null;
        }
        hideModal();
    });
    
    cancelActionBtn.addEventListener('click', () => {
        pendingAction = null;
        hideModal();
    });
    
    // Fonctions de gestion des quiz
    function renderQuizList() {
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
                statusCell.innerHTML = '<span class="active">Actif</span>';
                quizRow.querySelector('.activate-quiz-btn').disabled = true;
                quizRow.querySelector('.activate-quiz-btn').textContent = 'Actif';
            } else {
                statusCell.textContent = 'Inactif';
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
            
            // Sélectionner l'option correcte
            if (questionData.correctIndex !== undefined && questionData.correctIndex < radioInputs.length) {
                radioInputs[questionData.correctIndex].checked = true;
            }
        }
        
        // Ajouter le gestionnaire d'événement pour supprimer la question
        newQuestion.querySelector('.remove-question-btn').addEventListener('click', (e) => {
            e.target.closest('.question-item').remove();
            // Mettre à jour les numéros de questions
            updateQuestionNumbers();
        });
        
        // Ajouter la nouvelle question au conteneur
        questionsContainer.appendChild(newQuestion);
    }
    
    function updateQuestionNumbers() {
        const questions = questionsContainer.querySelectorAll('.question-item');
        questions.forEach((question, index) => {
            question.querySelector('.question-number').textContent = index + 1;
        });
        questionCounter = questions.length;
    }
    
    function saveQuiz() {
        // Vérifier le nom du quiz
        const quizName = quizNameInput.value.trim();
        if (!quizName) {
            showNotification('Veuillez entrer un nom pour le quiz', 'error');
            return;
        }
        
        // Récupérer les questions
        const questionItems = questionsContainer.querySelectorAll('.question-item');
        if (questionItems.length === 0) {
            showNotification('Veuillez ajouter au moins une question', 'error');
            return;
        }
        
        const questions = [];
        let isValid = true;
        
        questionItems.forEach((item, index) => {
            const questionText = item.querySelector('.question-text').value.trim();
            if (!questionText) {
                showNotification(`La question ${index + 1} n'a pas de texte`, 'error');
                isValid = false;
                return;
            }
            
            const optionTexts = Array.from(item.querySelectorAll('.option-text')).map(input => input.value.trim());
            if (optionTexts.some(option => !option)) {
                showNotification(`La question ${index + 1} a des options vides`, 'error');
                isValid = false;
                return;
            }
            
            const correctOptionRadio = item.querySelector('.correct-option:checked');
            if (!correctOptionRadio) {
                showNotification(`Veuillez sélectionner la bonne réponse pour la question ${index + 1}`, 'error');
                isValid = false;
                return;
            }
            
            const correctIndex = parseInt(correctOptionRadio.value);
            const explanation = item.querySelector('.question-explanation').value.trim();
            
            questions.push({
                question: questionText,
                options: optionTexts,
                correctIndex: correctIndex,
                explanation: explanation
            });
        });
        
        if (!isValid) return;
        
        // Créer l'objet quiz
        const quizData = {
            id: currentEditingQuizId,
            name: quizName,
            description: quizDescriptionInput.value.trim(),
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
    
    // Fonctions utilitaires
    function showModal() {
        confirmationModal.classList.remove('hidden');
    }
    
    function hideModal() {
        confirmationModal.classList.add('hidden');
    }
    
    function showNotification(message, type = 'info') {
        // Simple notification (alert pour le moment)
        alert(message);
        
        // Dans une application réelle, on utiliserait une notification plus élégante
    }
    
    // Initialisation
    socket.emit('get-quiz-list');
}); 