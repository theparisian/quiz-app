<?php
// Paramètres de connexion à la base de données de l'hébergement
$host = 'theparisosql.mysql.db';  // L'adresse du serveur MySQL de votre hébergement
$user = 'theparisosql';           // Votre nom d'utilisateur MySQL
$password = 'Tonyo75000';         // Votre mot de passe MySQL
$database = 'theparisosql';       // Le nom de votre base de données

// Tentative de connexion à la base de données
try {
    // Création d'une nouvelle connexion PDO
    $connexion = new PDO("mysql:host=$host;dbname=$database", $user, $password);
    
    // Configuration pour afficher les erreurs PDO
    $connexion->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Message de succès
    echo "Connexion réussie à la base de données '$database' depuis le VPS\n";
    
    // Test de requête simple
    $requete = $connexion->query("SHOW TABLES");
    $tables = $requete->fetchAll(PDO::FETCH_COLUMN);
    
    echo "Tables disponibles dans la base de données:\n";
    if (count($tables) > 0) {
        foreach ($tables as $table) {
            echo "- $table\n";
        }
    } else {
        echo "Aucune table trouvée.\n";
    }
    
} catch (PDOException $e) {
    // Affichage des erreurs de connexion
    echo "Erreur de connexion: " . $e->getMessage() . "\n";
}

// Fermeture de la connexion
$connexion = null;
?>