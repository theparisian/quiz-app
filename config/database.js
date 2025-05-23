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
        is_admin BOOLEAN DEFAULT FALSE,
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
    
    // Création de la table des quiz
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        questions JSON NOT NULL,
        active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Création de la table d'historique des parties
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quiz_id VARCHAR(36) NOT NULL,
        quiz_name VARCHAR(255) NOT NULL,
        player_count INT NOT NULL,
        winner_name VARCHAR(255),
        winner_email VARCHAR(255),
        winner_score INT,
        leaderboard JSON NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        'INSERT INTO quiz_host_credentials (username, password_hash, is_admin) VALUES (?, ?, ?)',
        ['admin', hashedPassword, true]
      );
      
      console.log('Compte administrateur par défaut créé (admin/admin123)');
    } else {
      // Vérifier si les comptes existants ont le champ is_admin défini
      try {
        // Cette requête peut échouer si la colonne n'existe pas encore, ce qui est normal
        // lors de la première mise à jour
        await pool.query('UPDATE quiz_host_credentials SET is_admin = TRUE WHERE username = ?', ['admin']);
        console.log('Permissions d\'administrateur mises à jour');
      } catch (err) {
        console.log('Note: Mise à jour des permissions ignorée, sera effectuée après le redémarrage');
      }
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
    
    // Vérifier si des quiz existent déjà
    const [quizRows] = await pool.query('SELECT COUNT(*) as count FROM quizzes');
    
    if (quizRows[0].count === 0) {
      // Si aucun quiz n'existe, créer un quiz par défaut avec les questions de la base de données
      const [questions] = await pool.query('SELECT * FROM questions');
      
      const formattedQuestions = questions.map(q => {
        let options;
        try {
          // Vérifier si options est déjà un objet ou une chaîne à parser
          if (typeof q.options === 'string') {
            options = JSON.parse(q.options);
          } else if (q.options && typeof q.options === 'object') {
            options = q.options;
          } else {
            // Fallback au cas où le format ne serait pas reconnu
            console.warn('Format d\'options non reconnu:', typeof q.options, q.options);
            options = Array.isArray(q.options) ? q.options : [];
          }
        } catch (err) {
          console.error('Erreur lors du parsing des options:', err, q.options);
          // Utiliser un tableau vide en cas d'erreur
          options = [];
        }
        
        return {
          question: q.question,
          options: options,
          correctIndex: q.correct_index,
          explanation: q.explanation
        };
      });
      
      if (formattedQuestions.length > 0) {
        const uuid = require('uuid').v4();
        await pool.query(
          'INSERT INTO quizzes (id, name, description, questions, active) VALUES (?, ?, ?, ?, ?)',
          [
            uuid,
            'Quiz par défaut',
            'Quiz généré automatiquement',
            JSON.stringify(formattedQuestions),
            true
          ]
        );
        console.log('Quiz par défaut créé avec succès');
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
            username: user.username,
            isAdmin: user.is_admin === 1 // Convertir en booléen car MySQL retourne 0/1
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
      return rows.map(row => {
        let options;
        try {
          // Vérifier si options est déjà un objet ou une chaîne à parser
          if (typeof row.options === 'string') {
            options = JSON.parse(row.options);
          } else if (row.options && typeof row.options === 'object') {
            options = row.options;
          } else {
            // Fallback au cas où le format ne serait pas reconnu
            console.warn('Format d\'options non reconnu:', typeof row.options, row.options);
            options = Array.isArray(row.options) ? row.options : [];
          }
        } catch (err) {
          console.error('Erreur lors du parsing des options:', err, row.options);
          // Utiliser un tableau vide en cas d'erreur
          options = [];
        }
        
        return {
          question: row.question,
          options: options,
          correctIndex: row.correct_index,
          explanation: row.explanation
        };
      });
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
  
  // Méthode pour récupérer tous les quiz
  async getAllQuizzes() {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return [];
      }

      const [rows] = await pool.query('SELECT * FROM quizzes ORDER BY created_at DESC');
      return rows.map(row => {
        let questions;
        try {
          // Vérifier si questions est déjà un objet ou une chaîne à parser
          if (typeof row.questions === 'string') {
            questions = JSON.parse(row.questions);
          } else if (row.questions && typeof row.questions === 'object') {
            questions = row.questions;
          } else {
            // Fallback au cas où le format ne serait pas reconnu
            console.warn('Format de questions non reconnu:', typeof row.questions);
            questions = [];
          }
        } catch (err) {
          console.error('Erreur lors du parsing des questions du quiz:', err);
          // Utiliser un tableau vide en cas d'erreur
          questions = [];
        }

        return {
          id: row.id,
          name: row.name,
          description: row.description,
          questions: questions,
          active: row.active === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des quiz:', error);
      return [];
    }
  },
  
  // Méthode pour récupérer le quiz actif
  async getActiveQuiz() {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return null;
      }

      const [rows] = await pool.query('SELECT * FROM quizzes WHERE active = TRUE LIMIT 1');
      
      if (rows.length === 0) {
        // Si aucun quiz actif, retourner le premier quiz
        const [allQuizzes] = await pool.query('SELECT * FROM quizzes LIMIT 1');
        if (allQuizzes.length === 0) return null;
        
        let questions;
        try {
          // Vérifier si questions est déjà un objet ou une chaîne à parser
          if (typeof allQuizzes[0].questions === 'string') {
            questions = JSON.parse(allQuizzes[0].questions);
          } else if (allQuizzes[0].questions && typeof allQuizzes[0].questions === 'object') {
            questions = allQuizzes[0].questions;
          } else {
            // Fallback au cas où le format ne serait pas reconnu
            console.warn('Format de questions non reconnu:', typeof allQuizzes[0].questions);
            questions = [];
          }
        } catch (err) {
          console.error('Erreur lors du parsing des questions du quiz:', err);
          // Utiliser un tableau vide en cas d'erreur
          questions = [];
        }
        
        return {
          id: allQuizzes[0].id,
          name: allQuizzes[0].name,
          description: allQuizzes[0].description,
          questions: questions,
          active: allQuizzes[0].active === 1,
          createdAt: allQuizzes[0].created_at,
          updatedAt: allQuizzes[0].updated_at
        };
      }
      
      let questions;
      try {
        // Vérifier si questions est déjà un objet ou une chaîne à parser
        if (typeof rows[0].questions === 'string') {
          questions = JSON.parse(rows[0].questions);
        } else if (rows[0].questions && typeof rows[0].questions === 'object') {
          questions = rows[0].questions;
        } else {
          // Fallback au cas où le format ne serait pas reconnu
          console.warn('Format de questions non reconnu:', typeof rows[0].questions);
          questions = [];
        }
      } catch (err) {
        console.error('Erreur lors du parsing des questions du quiz:', err);
        // Utiliser un tableau vide en cas d'erreur
        questions = [];
      }
      
      return {
        id: rows[0].id,
        name: rows[0].name,
        description: rows[0].description,
        questions: questions,
        active: rows[0].active === 1,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at
      };
    } catch (error) {
      console.error('Erreur lors de la récupération du quiz actif:', error);
      return null;
    }
  },
  
  // Méthode pour créer un nouveau quiz
  async createQuiz(quizData) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return false;
      }

      await pool.query(
        'INSERT INTO quizzes (id, name, description, questions, active) VALUES (?, ?, ?, ?, ?)',
        [quizData.id, quizData.name, quizData.description, JSON.stringify(quizData.questions), quizData.active || false]
      );
      return true;
    } catch (error) {
      console.error('Erreur lors de la création du quiz:', error);
      return false;
    }
  },
  
  // Méthode pour mettre à jour un quiz
  async updateQuiz(id, quizData) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return false;
      }

      await pool.query(
        'UPDATE quizzes SET name = ?, description = ?, questions = ? WHERE id = ?',
        [quizData.name, quizData.description, JSON.stringify(quizData.questions), id]
      );
      return true;
    } catch (error) {
      console.error('Erreur lors de la mise à jour du quiz:', error);
      return false;
    }
  },
  
  // Méthode pour activer un quiz
  async activateQuiz(id) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return false;
      }

      // Désactiver tous les quiz d'abord
      await pool.query('UPDATE quizzes SET active = FALSE');
      
      // Puis activer celui sélectionné
      await pool.query('UPDATE quizzes SET active = TRUE WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'activation du quiz:', error);
      return false;
    }
  },
  
  // Méthode pour supprimer un quiz
  async deleteQuiz(id) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return false;
      }

      // Vérifier si le quiz est actif
      const [activeCheck] = await pool.query('SELECT active FROM quizzes WHERE id = ?', [id]);
      if (activeCheck.length > 0 && activeCheck[0].active) {
        return { success: false, reason: 'active' };
      }
      
      // Vérifier s'il s'agit du dernier quiz
      const [countCheck] = await pool.query('SELECT COUNT(*) as count FROM quizzes');
      if (countCheck[0].count <= 1) {
        return { success: false, reason: 'last' };
      }
      
      await pool.query('DELETE FROM quizzes WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la suppression du quiz:', error);
      return { success: false, reason: 'error' };
    }
  },
  
  // Méthode pour ajouter une entrée dans l'historique des parties
  async addGameHistory(gameData) {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return false;
      }

      await pool.query(
        `INSERT INTO game_history 
         (quiz_id, quiz_name, player_count, winner_name, winner_email, winner_score, leaderboard) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          gameData.quizId,
          gameData.quizName,
          gameData.players,
          gameData.winner ? gameData.winner.name : null,
          gameData.winner ? gameData.winner.email : null,
          gameData.winner ? gameData.winner.score : null,
          JSON.stringify(gameData.leaderboard)
        ]
      );
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'ajout dans l\'historique des parties:', error);
      return false;
    }
  },
  
  // Méthode pour récupérer l'historique des parties
  async getGameHistory() {
    try {
      if (!pool) {
        console.error('Aucune connexion à la base de données disponible');
        return [];
      }

      const [rows] = await pool.query('SELECT * FROM game_history ORDER BY timestamp DESC');
      return rows.map(row => {
        let leaderboard;
        try {
          // Vérifier si leaderboard est déjà un objet ou une chaîne à parser
          if (typeof row.leaderboard === 'string') {
            leaderboard = JSON.parse(row.leaderboard);
          } else if (row.leaderboard && typeof row.leaderboard === 'object') {
            leaderboard = row.leaderboard;
          } else {
            // Fallback au cas où le format ne serait pas reconnu
            console.warn('Format de leaderboard non reconnu:', typeof row.leaderboard);
            leaderboard = [];
          }
        } catch (err) {
          console.error('Erreur lors du parsing du leaderboard:', err);
          // Utiliser un tableau vide en cas d'erreur
          leaderboard = [];
        }

        return {
          id: row.id,
          quizId: row.quiz_id,
          quizName: row.quiz_name,
          players: row.player_count,
          winner: row.winner_name ? {
            name: row.winner_name,
            email: row.winner_email,
            score: row.winner_score
          } : null,
          leaderboard: leaderboard,
          timestamp: row.timestamp
        };
      });
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique des parties:', error);
      return [];
    }
  },
  
  // Exposez le pool pour des cas spécifiques
  pool: pool
};

module.exports = {
  ...database,
  initDatabase
}; 