const mysql = require('mysql2/promise');
const api = require('./api-client');

// Configuration de la base de données
const dbConfig = {
  host: 'localhost',    // On utilisera l'API, pas de connexion directe
  user: 'local_user',   // Valeurs de fallback pour le développement local
  password: 'local_password',
  database: 'local_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Création du pool de connexions (pour le développement local si nécessaire)
let pool = null;
try {
  pool = mysql.createPool(dbConfig);
} catch (error) {
  console.warn('Fallback local database pool not created:', error.message);
}

// Fonction pour initialiser la base de données via l'API
async function initDatabase() {
  try {
    // Test de connexion avec l'API
    const testResult = await api.testConnection();
    
    if (testResult.error) {
      console.error('Erreur lors de la connexion à l\'API:', testResult.message);
      console.warn('Tentative d\'utilisation de la base de données locale...');
      
      // Utiliser la base de données locale si l'API échoue
      if (pool) {
        // Créer les tables localement pour le développement
        await pool.query(`
          CREATE TABLE IF NOT EXISTS quiz_host_credentials (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
        
        console.log('Base de données locale initialisée avec succès');
        
        // Vérifier si un compte existe déjà en local
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM quiz_host_credentials');
        
        if (rows[0].count === 0) {
          // Si aucun compte n'existe, en créer un par défaut en local
          const bcrypt = require('bcrypt');
          const defaultPassword = 'admin123'; // Mot de passe par défaut, à changer après la première connexion
          const hashedPassword = await bcrypt.hash(defaultPassword, 10);
          
          await pool.query(
            'INSERT INTO quiz_host_credentials (username, password_hash) VALUES (?, ?)',
            ['admin', hashedPassword]
          );
          
          console.log('Compte administrateur par défaut créé en local');
        }
      } else {
        throw new Error('Aucune connexion disponible: ni API, ni base de données locale');
      }
    } else {
      console.log('Connexion à l\'API réussie:', testResult.message);
    }
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de la base de données:', error);
  }
}

// Exports des méthodes adaptées pour accéder aux données via l'API
const database = {
  // Méthode pour vérifier les identifiants (utilisée par auth.js)
  async verifyCredentials(username, password) {
    try {
      const result = await api.login(username, password);
      
      if (result.error) {
        // Fallback vers la base de données locale si l'API échoue
        if (pool) {
          console.log('Tentative d\'authentification locale...');
          const [rows] = await pool.query('SELECT * FROM quiz_host_credentials WHERE username = ?', [username]);
          
          if (rows.length > 0) {
            const bcrypt = require('bcrypt');
            const user = rows[0];
            const passwordMatch = await bcrypt.compare(password, user.password_hash);
            
            if (passwordMatch) {
              return {
                id: user.id,
                username: user.username
              };
            }
          }
        }
        return null;
      }
      
      return {
        id: result.user_id,
        username: result.username,
        token: result.token
      };
    } catch (error) {
      console.error('Erreur lors de la vérification des identifiants:', error);
      return null;
    }
  },
  
  // Méthode pour récupérer toutes les questions
  async getQuestions() {
    try {
      const result = await api.getQuestions();
      
      if (result.error) {
        // Fallback vers le fichier JSON local si l'API échoue
        console.log('Échec de récupération des questions via API, utilisation du fichier local...');
        const fs = require('fs');
        const path = require('path');
        const questionsFilePath = path.join(__dirname, '../data/questions.json');
        
        if (fs.existsSync(questionsFilePath)) {
          const questionsData = fs.readFileSync(questionsFilePath, 'utf8');
          return JSON.parse(questionsData);
        } else {
          return [];
        }
      }
      
      return result;
    } catch (error) {
      console.error('Erreur lors de la récupération des questions:', error);
      return [];
    }
  },
  
  // Autres méthodes selon vos besoins...
  
  // Exposez le pool pour des cas spécifiques
  pool: pool,
  
  // Exposez l'API client directement
  api: api
};

module.exports = {
  ...database,
  initDatabase
}; 