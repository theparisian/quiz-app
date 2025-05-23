const database = require('./database');

/**
 * Ajoute une partie à l'historique
 * @param {Object} gameData - Données de la partie
 * @returns {boolean} - Succès de l'ajout
 */
const addGameToHistory = async (gameData) => {
  try {
    return await database.addGameHistory(gameData);
  } catch (err) {
    console.error('Erreur lors de l\'ajout à l\'historique:', err);
    return false;
  }
};

/**
 * Charge l'historique des parties
 * @returns {Array} - Historique des parties
 */
const loadHistory = async () => {
  try {
    return await database.getGameHistory();
  } catch (err) {
    console.error('Erreur lors du chargement de l\'historique:', err);
    return [];
  }
};

module.exports = {
  loadHistory,
  addGameToHistory
}; 