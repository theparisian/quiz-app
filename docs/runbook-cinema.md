# Fiche incidents — Quiz sur grand écran (cabine)

À destination du personnel du cinéma. En cas de doute ou de situation non couverte ci-dessous, passez au support (section 5).

---

## 1. D’abord : pas de panique

L’installation est prévue pour se réparer toute seule après la plupart des micro‑coupures réseau. Ce guide liste les gestes simples ensuite. Si ce n’est toujours pas normal après lecture et actions adaptées, téléphonez avec les éléments préparés sous **Référence support** (section 5).

---

## 2. C’est quoi « le boîtier » ?

C’est le petit calculateur branché sur le grand écran de la salle. Il diffuse le jeu aux spectateurs qui participent avec leur téléphone.

**Où se trouve ce boîtier physiquement dans la cabine / la salle pilote :**

`[À COMPLÉTER : emplacement exact (sous pupitre, placard, étagère…) ]`

---

## 3. Situations fréquentes

Modèle : ce que vous voyez → ce que cela signifie → ce que vous faites.

### A. Logo du cinéma, rien ne bouge

Souvent **normal** : la salle attend sans séance lancée depuis la régie.

1. Si aucune session prévue maintenant → rien à faire.
2. Si une session doit être en cours et rien ne bouge au bout d’un moment → vérifier avec la personne qui utilise **la console projectionniste** que la partie est bien lancée pour cette salle puis, si besoin, suivre la section **4**.

### B. Écran sombre avec « Reprise dans quelques instants » (parfois un temps affiché)

Connexion en cours de rétablissement automatique.

1. Attendre environ **une à deux minutes**.
2. Si après ce délai rien ne revient (logo ou jeu visible) → section **4**.

### C. Écran noir, gel prolongé, ou affichage « bizarre » pendant une séance

Blocage d’affichage possible.

1. Patienter **une trentaine de secondes** supplémentaires sans toucher le matériel.
2. Si pas d’amélioration → section **4**.

### D. Pas de QR alors qu’une partie est censée tourner

1. Vérifier avec la régie (console) que **la session est bien démarrée** pour cette salle.
2. Si oui de leur côté mais pas de changement sur grand écran → section **4**.

### E. QR visible mais les téléphones ne rejoignent pas la partie

1. Comparer le **nombre à quatre chiffres** grand écran avec celui saisi dans l’appli sur téléphone.
2. Demander de **taper le code à la main** comme solution de secours après échec du scan.
3. Si personne n’entre alors que l’accès Internet fonctionne ailleurs dans le bâtiment pour les mêmes mobiles → **support** (section **5**).

### F. Image ok mais pas de son

1. Monter le volume **téléviseur/projecteur** comme pour une bande‑annonce habituelle.
2. `[À COMPLÉTER : précisions audio du pilote (console son, ampli, HDMI avec retour son…).]`
3. Toujours sans son après ces vérifications → section **5**.

---

## 4. Redémarrage du boîtier (la méthode qui dépanne le plus souvent)

Redémarrer ainsi **ne détruit pas** vos parties enregistrées ni la configuration centrale : c’est comparable à redémarrer une borne de billetterie.

1. Repérer le bouton d’alimentation du petit calculateur `[À COMPLÉTER : préciser selon le modèle NUC livré]`.
2. L’**éteindre** (maintien court ou appui selon indications constructeur : `[À COMPLÉTER]`).
3. Si l’extinction n’est pas nette, débrancher **temporairement uniquement** son **cordon secteur**.
4. Attendre au moins **10 secondes**.
5. Le rebrancher puis le **rallumer**.
6. Laisser passer **1 à 2 minutes** : le logo ou le jeu doit réapparaître.

---

## 5. Quand appeler le support

Appelez si, après **redémarrage** + attente raisonnable décrite plus haut :

- l’écran reste anormalement figé ou noir ;
- aucun spectateur n’arrive à rejoindre malgré bon code saisi partout ;
- le matériel semble matériellement en panne hors de ce guide ;
- ou toute situation où vous préférez un avis externe.

**Coordonnées :**

- Contact ou équipe : `[À COMPLÉTER : nom]`
- Téléphone : `[À COMPLÉTER : numéro joignable soir / week‑end si pertinent]`
- Email : `[À COMPLÉTER : email]`
- Horaires ou délai de réponse attendu : `[À COMPLÉTER]`

**À avoir en tête avant / pendant l’appel :**

- Nom du cinéma ;
- Salle précise ;
- Ce qui était affiché à l’écran (description simple) ;
- Déjà tenté : oui / non la procédure de la section **4**.

---

## 6. Ce qu’il ne vaut mieux pas faire sans consigne

1. Ne pas débrancher l’écran « pour voir » au milieu d’une séance sans raison claire.
2. Ne pas tirer sur les câbles réseau du calculateur ni du tableau pour déboguer seul.
3. Ne pas brancher un clavier puis tester des commandes incomprises.
4. Au‑delà du redémarrage standard et de la patience indiquée ici, éviter d’accumuler des manipulations hasardeuses : préférer l’appel prévu section **5**.

---

## 7. Déploiement (équipe technique uniquement)

Cette section ne concerne pas le personnel du cinéma. Elle décrit le déploiement de la plateforme sur le VPS (`.github/workflows/deploy.yml` puis `scripts/deploy.sh`).

### Fonctionnement normal

- Un push sur `master` lance la CI. Le déploiement ne part que si la CI de ce push est **verte**.
- Le déploiement est **refusé** (code 3, message « Déploiement refusé : N session(s) en cours ») si au moins une session est en cours : partie lancée, partie en pause, ou lobby de moins de 60 minutes avec au moins un joueur actif. Il ne coupe donc pas une séance.
- Après redémarrage, le script vérifie pendant 60 s maximum que l’API répond 200 sur `/health` et que les quatre apps (ports 4001 à 4004) répondent sans erreur serveur. Sinon, ou si l’installation, la compilation, les migrations ou le redémarrage échouent, il revient automatiquement à la version précédente.

### Prérequis avant le premier déploiement

- Secret GitHub `VPS_KNOWN_HOSTS` : la clé d’hôte du VPS au format `known_hosts`, par exemple la sortie de `ssh-keyscan -t ed25519 <hôte du VPS>`, **vérifiée** contre l’empreinte affichée sur le VPS (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`). Sans ce secret, le déploiement s’arrête avant toute connexion.
- Secret `HEALTH_CHECK_TOKEN` renseigné (il est écrit dans le `.env` du VPS). S’il est absent du `.env`, la garde des sessions en cours ne peut pas s’exécuter : le script affiche un avertissement et **déploie quand même**.

### Cas où la garde est ignorée ou bloque

- API qui ne répond pas (premier déploiement, API arrêtée) : la garde est ignorée et le déploiement continue.
- Version en place sans la route `/health/active-sessions` (premier déploiement de cette fonctionnalité) : garde ignorée.
- Autre réponse (401 par exemple, après un changement de `HEALTH_CHECK_TOKEN` : l’API en place connaît encore l’ancien jeton) : déploiement refusé. Vérifier qu’aucune séance n’est en cours, puis forcer.

### Forcer un déploiement

À réserver aux cas où aucune séance ne tourne réellement (lobby oublié, jeton changé) ou à une correction urgente acceptée en connaissance de cause : les séances en cours seront coupées.

- Depuis GitHub : Actions → « Deploy to VPS » → « Run workflow », choisir la branche (ou la saisir dans « branch »), cocher **force**.
- Sur le VPS, depuis la racine du projet : `BRANCH=master FORCE=1 bash scripts/deploy.sh`. Le `.env` n’est alors pas réécrit depuis les secrets GitHub.

Le lancement manuel (`workflow_dispatch`) ne dépend pas de la CI : vérifier qu’elle est verte sur le commit visé avant de lancer.

### Après un rollback

Le journal se termine par « ROLLBACK effectué vers <sha> » (ou « ROLLBACK ÉCHOUÉ », voir plus bas), et le workflow est en échec.

1. Vérifier que la version restaurée tourne : `pm2 status`, `curl -s http://127.0.0.1:4000/health`, et une page de chaque app.
2. Lire la cause dans le journal GitHub Actions (étape de compilation, de migration ou contrôle de santé) et dans `pm2 logs`.
3. Le dépôt du VPS est sur le commit restauré, mais `origin/master` contient toujours le commit fautif : corriger (ou `git revert`) sur `master`, puis laisser la CI redéployer.
4. Les migrations déjà appliquées **ne sont pas annulées** : la base reste au nouveau schéma, utilisé par l’ancien code.
5. Si le message est « ROLLBACK ÉCHOUÉ » ou si le contrôle de santé de la version restaurée échoue, intervenir à la main : `git log -1` pour voir la version présente, puis relancer les commandes de `scripts/deploy.sh` (install, build, `pm2 startOrReload ecosystem.config.js --update-env`).

### Règle des migrations

**Une migration doit rester compatible avec la version précédente du code.** Le rollback ne revient que sur le code, jamais sur la base : après une migration, l’ancienne version doit pouvoir tourner sur le nouveau schéma. Concrètement : ajouter des tables ou des colonnes (nullables ou avec valeur par défaut), ne pas supprimer ni renommer une colonne encore lue par la version en place ; une suppression se fait en deux déploiements (le code cesse de l’utiliser, puis une migration ultérieure la retire).
