const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '../data/game_history.json');

// Assurer que le fichier d'historique existe
const initHistoryFile = () => {
  // Vérifier si le dossier data existe
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  // Vérifier si le fichier d'historique existe
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
  }
};

/**
 * Charge l'historique des parties
 * @returns {Array} - Historique des parties
 */
const loadHistory = () => {
  try {
    initHistoryFile();
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (err) {
    console.error('Erreur lors du chargement de l\'historique:', err);
    return [];
  }
};

/**
 * Sauvegarde l'historique des parties
 * @param {Array} history - Historique des parties à sauvegarder
 * @returns {boolean} - Succès de la sauvegarde
 */
const saveHistory = (history) => {
  try {
    initHistoryFile();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    return true;
  } catch (err) {
    console.error('Erreur lors de la sauvegarde de l\'historique:', err);
    return false;
  }
};

/**
 * Ajoute une partie à l'historique
 * @param {Object} gameData - Données de la partie
 * @returns {boolean} - Succès de l'ajout
 */
const addGameToHistory = (gameData) => {
  try {
    const history = loadHistory();
    history.push({
      ...gameData,
      timestamp: new Date().toISOString()
    });
    return saveHistory(history);
  } catch (err) {
    console.error('Erreur lors de l\'ajout à l\'historique:', err);
    return false;
  }
};

module.exports = {
  loadHistory,
  saveHistory,
  addGameToHistory
}; 