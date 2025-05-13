const bcrypt = require('bcrypt');
const { pool } = require('./database');

/**
 * Vérifie les identifiants d'un utilisateur
 * @param {string} username - Nom d'utilisateur
 * @param {string} password - Mot de passe en clair
 * @returns {Promise<Object|null>} - Données utilisateur ou null si échec
 */
async function verifyCredentials(username, password) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM quiz_host_credentials WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return null;
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (passwordMatch) {
      // Ne pas renvoyer le mot de passe hashé
      delete user.password_hash;
      return user;
    }

    return null;
  } catch (error) {
    console.error('Erreur lors de la vérification des identifiants:', error);
    return null;
  }
}

/**
 * Vérifie si l'utilisateur est authentifié
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @param {Function} next - Fonction suivante
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  
  // Rediriger vers la page de connexion
  res.redirect('/login');
}

module.exports = {
  verifyCredentials,
  requireAuth
}; 