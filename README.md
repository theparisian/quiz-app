# Quiz App

Application de quiz en temps réel utilisant Socket.IO, Express et Node.js avec une base de données MySQL.

## Configuration

L'application utilise des variables d'environnement pour la configuration. Créez un fichier `.env` à la racine du projet avec les paramètres suivants :

```env
# Configuration de la base de données
DB_HOST=localhost
DB_USER=votre_utilisateur
DB_PASSWORD=votre_mot_de_passe
DB_NAME=votre_base_de_donnees

# Configuration de l'application
NODE_ENV=development
PORT=3000
SESSION_SECRET=votre_secret_session

# Configuration de Brevo pour l'envoi d'emails
BREVO_API_KEY=votre_cle_api_brevo
SENDER_EMAIL=votre_email_expediteur
```

### Configuration pour le développement local

Pour le développement local, utilisez les paramètres suivants :

```env
DB_HOST=localhost
DB_USER=local_user
DB_PASSWORD=local_password
DB_NAME=local_db
NODE_ENV=development
```

### Configuration pour la production (VPS)

Pour la production sur votre VPS, utilisez les paramètres suivants :

```env
DB_HOST=votre_vps_ip
DB_USER=votre_vps_user
DB_PASSWORD=votre_vps_password
DB_NAME=votre_vps_db
NODE_ENV=production
BREVO_API_KEY=votre_cle_api_brevo
SENDER_EMAIL=votre_email_expediteur
```

## Installation

```bash
npm install
```

## Déploiement

Pour déployer l'application avec incrémentation automatique de la version :

```bash
npm run deploy
```

Cette commande :
1. Incrémente automatiquement le numéro de version (patch) dans package.json
2. Démarre l'application 

## Fonctionnement de la version

Le numéro de version s'affiche en pied de page sur l'interface hôte. Il est automatiquement incrémenté à chaque déploiement, ce qui permet de vérifier que les modifications ont bien été appliquées.

## Développement

Pour lancer l'application en mode développement :

```bash
npm run dev
```

## Structure du projet

- `public/` : Contient tous les fichiers statiques (HTML, CSS, JS)
  - `host/` : Interface de l'hôte du quiz
  - `play/` : Interface des participants
  - `login/` : Interface de connexion
- `config/` : Configuration de l'application, connexion à la base de données et services externes
- `server.js` : Point d'entrée de l'application

## Base de données

L'application utilise une base de données MySQL pour stocker :
- Les identifiants des utilisateurs administrateurs
- Les questions et quiz disponibles
- L'historique des parties jouées

Un compte administrateur par défaut est créé lors de la première initialisation :
- Nom d'utilisateur : `admin`
- Mot de passe : `admin123`

Il est recommandé de changer ce mot de passe après la première connexion.

## Nouvelles fonctionnalités

### Collecte des emails des joueurs
Chaque joueur doit maintenant fournir son email en plus de son nom pour participer au quiz. Cela permet :
- D'identifier de manière unique les joueurs
- D'envoyer un email au gagnant à la fin de la partie
- De conserver un historique des scores associés aux emails

### Envoi d'emails au gagnant
À la fin de chaque partie, le gagnant reçoit automatiquement un email de félicitations grâce à l'intégration de Brevo (anciennement Sendinblue). Cela nécessite :
- Une clé API Brevo valide (à configurer dans `.env`)
- Un email d'expédition configuré (à configurer dans `.env`)

### Historique des parties
Toutes les parties jouées sont désormais enregistrées dans la base de données avec :
- Les informations sur le quiz joué
- Le nombre de participants
- Les coordonnées du gagnant (nom et email)
- Le classement final complet

## Déploiement sur VPS

1. Assurez-vous que MySQL est installé sur votre VPS
2. Créez une base de données et un utilisateur avec les permissions nécessaires
3. Configurez le fichier `.env` avec les paramètres de connexion à votre base de données VPS et votre clé API Brevo
4. Installez les dépendances avec `npm install`
5. Lancez l'application avec `npm start` 