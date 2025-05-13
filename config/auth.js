const bcrypt = require('bcrypt');
const { pool } = require('./database');
const database = require('./database');

/**
 * Vérifie les identifiants d'un utilisateur
 * @param {string} username - Nom d'utilisateur
 * @param {string} password - Mot de passe en clair
 * @returns {Promise<Object|null>} - Données utilisateur ou null si échec
 */
async function verifyCredentials(username, password) {
  return await database.verifyCredentials(username, password);
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