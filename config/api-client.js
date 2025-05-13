const axios = require('axios');

// Configuration de base pour axios
const apiClient = axios.create({
  baseURL: 'https://votre-hebergement-web.com/api', // Remplacez par l'URL de votre API
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Fonction pour gérer les erreurs de l'API
const handleApiError = (error) => {
  if (error.response) {
    // La requête a été faite et le serveur a répondu avec un code d'erreur
    console.error('Erreur API:', error.response.status, error.response.data);
    return {
      error: true,
      status: error.response.status,
      message: error.response.data.error || 'Erreur serveur',
      data: error.response.data
    };
  } else if (error.request) {
    // La requête a été faite mais aucune réponse n'a été reçue
    console.error('Erreur de connexion à l\'API:', error.request);
    return {
      error: true,
      message: 'Impossible de se connecter à l\'API (serveur inaccessible)'
    };
  } else {
    // Une erreur s'est produite lors de la configuration de la requête
    console.error('Erreur de configuration de la requête API:', error.message);
    return {
      error: true,
      message: 'Erreur lors de la préparation de la requête'
    };
  }
};

// Méthodes pour interagir avec l'API
const api = {
  // Authentification
  async login(username, password) {
    try {
      const response = await apiClient.post('/auth', { username, password });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  // Utilisateurs
  async getUsers() {
    try {
      const response = await apiClient.get('/users');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  async getUserById(id) {
    try {
      const response = await apiClient.get(`/users/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  async createUser(userData) {
    try {
      const response = await apiClient.post('/users', userData);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  // Questions
  async getQuestions() {
    try {
      const response = await apiClient.get('/questions');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  async getQuestionById(id) {
    try {
      const response = await apiClient.get(`/questions/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  async createQuestion(questionData) {
    try {
      const response = await apiClient.post('/questions', questionData);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  // Test de connexion
  async testConnection() {
    try {
      const response = await apiClient.get('/test');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  }
};

module.exports = api; 