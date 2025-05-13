const mysql = require('mysql2/promise');

// Configuration de la base de données
const dbConfig = {
  host: 'theparisosql.mysql.db',
  user: 'theparisosql',
  password: 'Tonyo75000',
  database: 'theparisosql',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Création du pool de connexions
const pool = mysql.createPool(dbConfig);

// Fonction pour initialiser la base de données
async function initDatabase() {
  try {
    // Création de la table des identifiants si elle n'existe pas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_host_credentials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Base de données initialisée avec succès');
    
    // Vérifier si un compte existe déjà
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM quiz_host_credentials');
    
    if (rows[0].count === 0) {
      // Si aucun compte n'existe, en créer un par défaut
      const bcrypt = require('bcrypt');
      const defaultPassword = 'admin123'; // Mot de passe par défaut, à changer après la première connexion
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      
      await pool.query(
        'INSERT INTO quiz_host_credentials (username, password_hash) VALUES (?, ?)',
        ['admin', hashedPassword]
      );
      
      console.log('Compte administrateur par défaut créé');
    }
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de la base de données:', error);
  }
}

module.exports = {
  pool,
  initDatabase
}; 