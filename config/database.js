const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Configuration de la base de données
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'local_user',
  password: process.env.DB_PASSWORD || 'local_password',
  database: process.env.DB_NAME || 'local_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Création du pool de connexions
let pool = null;
try {
  pool = mysql.createPool(dbConfig);
  console.log(`Pool de connexion à la base de données créé avec succès (${process.env.NODE_ENV || 'development'})`);
} catch (error) {
  console.error('Erreur lors de la création du pool de connexion:', error.message);
}

// Fonction pour initialiser la base de données
async function initDatabase() {
  try {
    if (!pool) {
      throw new Error('Aucune connexion à la base de données disponible');
    }

    // Créer les tables nécessaires
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_host_credentials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Création de la table questions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question TEXT NOT NULL,
        options JSON NOT NULL,
        correct_index INT NOT NULL,
        explanation TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Base de données initialisée avec succès');
    
    // Vérifier si un compte existe déjà
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM quiz_host_credentials');
    
    if (rows[0].count === 0) {
      // Si aucun compte n'existe, en créer un par défaut
      const defaultPassword = 'admin123'; // Mot de passe par défaut, à changer après la première connexion
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      
      await pool.query(
        'INSERT INTO quiz_host_credentials (username, password_hash) VALUES (?, ?)',
        ['admin', hashedPassword]
      );
      
      console.log('Compte administrateur par défaut créé (admin/admin123)');
    }

    // Vérifier si des questions existent déjà
    const [questionRows] = await pool.query('SELECT COUNT(*) as count FROM questions');
    
    if (questionRows[0].count === 0) {
      // Si aucune question n'existe, importer les questions du fichier JSON
      const questionsFilePath = path.join(__dirname, '../data/questions.json');
      if (fs.existsSync(questionsFilePath)) {
        const questionsData = JSON.parse(fs.readFileSync(questionsFilePath, 'utf8'));
        for (const q of questionsData) {
          await pool.query(
            'INSERT INTO questions (question, options, correct_index, explanation) VALUES (?, ?, ?, ?)',
            [q.question, JSON.stringify(q.options), q.correctIndex, q.explanation]
          );
        }
        console.log('Questions importées avec succès depuis le fichier JSON');
      }
    }
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de la base de données:', error);
  }
}

// Méthodes d'accès aux données
const database = {
  // Méthode pour vérifier les identifiants
  async verifyCredentials(username, password) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return null;
      }

      const [rows] = await pool.query('SELECT * FROM quiz_host_credentials WHERE username = ?', [username]);
      
      if (rows.length > 0) {
        const user = rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        
        if (passwordMatch) {
          return {
            id: user.id,
            username: user.username
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Erreur lors de la vérification des identifiants:', error);
      return null;
    }
  },
  
  // Méthode pour récupérer toutes les questions
  async getQuestions() {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return [];
      }

      const [rows] = await pool.query('SELECT * FROM questions ORDER BY id');
      return rows.map(row => ({
        question: row.question,
        options: JSON.parse(row.options),
        correctIndex: row.correct_index,
        explanation: row.explanation
      }));
    } catch (error) {
      console.error('Erreur lors de la récupération des questions:', error);
      return [];
    }
  },
  
  // Méthode pour enregistrer des scores (exemple d'extension future)
  async saveGameResults(gameData) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return false;
      }
      
      // Ici, vous pourriez implémenter la sauvegarde des résultats en base de données
      console.log('Résultats du jeu reçus pour sauvegarde:', gameData);
      return true;
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des résultats du jeu:', error);
      return false;
    }
  },
  
  // Méthode pour ajouter une nouvelle question
  async addQuestion(questionData) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return false;
      }

      await pool.query(
        'INSERT INTO questions (question, options, correct_index, explanation) VALUES (?, ?, ?, ?)',
        [questionData.question, JSON.stringify(questionData.options), questionData.correctIndex, questionData.explanation]
      );
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'ajout de la question:', error);
      return false;
    }
  },

  // Méthode pour mettre à jour une question
  async updateQuestion(id, questionData) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return false;
      }

      await pool.query(
        'UPDATE questions SET question = ?, options = ?, correct_index = ?, explanation = ? WHERE id = ?',
        [questionData.question, JSON.stringify(questionData.options), questionData.correctIndex, questionData.explanation, id]
      );
      return true;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la question:', error);
      return false;
    }
  },

  // Méthode pour supprimer une question
  async deleteQuestion(id) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return false;
      }

      await pool.query('DELETE FROM questions WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression de la question:', error);
      return false;
    }
  },
  
  // Exposez le pool pour des cas spécifiques
  pool: pool
};

module.exports = {
  ...database,
  initDatabase
}; 