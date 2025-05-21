# Quiz App

Application de quiz en temps réel utilisant Socket.IO, Express et Node.js.

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
- `data/` : Contient les questions du quiz
- `config/` : Configuration de l'application 
- `server.js` : Point d'entrée de l'application 