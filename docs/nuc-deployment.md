# Déploiement NUC — documentation technique (pilote Quiz App)

Guide pour **installer de zéro** un poste Ubuntu Server destiné au **player** (`apps/player`) sous Chromium kiosque, puis le relier au cloud existant. Public : équipe projet / exploitation technique désignée.

> Le personnel de salle ne suit **`docs/runbook-cinema.md`** (sans commandes système).

---

## 1. Matériel requis

| Élément                                      | Notes                                                     |
| -------------------------------------------- | --------------------------------------------------------- |
| NUC Intel **x86_64**                         | Pas Raspberry / hors ARM pilote PR9                       |
| Écran HDMI ou DisplayPort                    | Selon équipement salle existant                           |
| Câbles vidéo + alimentations                 |                                                           |
| Réseau Ethernet filaire recommandé en cabine |                                                           |
| Clé USB (≥ 8 Go)                             | Image Ubuntu Server officielle téléchargée sur ubuntu.com |

---

## 2. Installation système Ubuntu Server LTS (amd64)

> **Hors scope du script bash** (`D2` projet).

### 2.1 Clé USB d’installation

1. Télécharger l’ISO **Ubuntu Server LTS amd64** depuis ubuntu.com (version supportée jusqu’à sa fin de vie standard).
2. Flasher avec Rufus, balenaEtcher, `dd`, etc.

### 2.2 Boot NUC et installation minimale

1. Brancher HDMI/DP à un écran de contrôle pour le wizard.
2. Brancher Ethernet (réseau autorisé sortant HTTPS + WebSockets vers l’infra Quiz App déployée).
3. Répondre aux questions du wizard : langue française, clavier, disque système tel que politique infra site.
4. **Ne pas installer** de desktop GNOME Ubuntu — objectif environnement léger puisque le script utilisera **`xserver-xorg`** + **`xinit`** uniquement au moment du kiosk.
5. Activer **OpenSSH Server** lorsque proposé (accès `ssh` après premier boot pour maintenance et mises à jour).
6. Créer utilisateur UNIX humain exploitant (**sudo**) — distinct utilisateur kiosk applicatif automatique (**`quizkiosk`**) créé par le provisioning.

Une fois première connexion **`ssh`** opérationnelle : passer §4 avec le dossier **`scripts/nuc/`** copié sur la machine (repo complet ou sous-arborescence extraite depuis une release projet).

Pour couper veille téléviseur / écran HDMI : poursuivez vos réglages matériels habituel cabine après déploiement applicatif (**en plus** des indications `xset` du script kiosk interne automatique lorsque utilisateur kiosk est actif sur X : 0).

---

## 3. Création de la NUC dans le super‑admin

Avant `./provision-nuc.sh` :

| Interface D                                                                                    | À récupérer                                            |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Créer / sélectionner salle puis **nouvelle entrée device NUC physique** (`nucsService.create`) | **`nuc_uid`** + **`auth_key` affichée une seule fois** |

⚠️ Ne pas publier ces valeurs hors canaux projet sécurisés.

Flux applicatif : première navigation Chromium ouvre (**tant que** `/etc/quiz-app/provisioned` **absent**) une URL :

```text
{PLAYER_URL}/provision?nuc_uid=…&auth_key=…
```

La page `apps/player/app/provision/page.tsx` appelle **`POST /api/nucs/auth`**, pose `localStorage.setItem('nuc_uid')` + cookie `nuc_session`, puis **`router.replace('/screen')`**.

Une fois fichier témoin posé après confirmation opérateur : redémarrage Chromium passe par **`{PLAYER_URL}/`** — logique **`apps/player/app/page.tsx`** redirige vers **`/screen`** si `localStorage` non vide sinon erreur configurée niveau projet.

Cas **profil navigateur purge / localStorage perdu alors que fichier `provisioned` existe** ⇒ **ré‑provisionnement conscient** : voir **`scripts/nuc/provision-nuc.sh` option **[R]** ou **[N]\*\*, ou doc support interne équipe projet — sans nouvelle évolution automatique code applicatif PR9 hors périmètre acté.

---

## 4. Exécuter `sudo ./provision-nuc.sh`

Arborescence attendue :

```
scripts/nuc/provision-nuc.sh
scripts/nuc/templates/{chromium-kiosk.sh, quiz-nuc-chromium.service, quiz-nuc-restart.service, quiz-nuc-restart.timer}
```

```bash
cd /chemin/vers/scripts/nuc
chmod +x ./provision-nuc.sh
sudo ./provision-nuc.sh
```

Questions et défauts proposés : voir tableau interactif fichier script (sommairement) :

| Champ                | Obligatoire                                                   |
| -------------------- | ------------------------------------------------------------- |
| `nuc_uid` admin      | ✅                                                            |
| `auth_key` (masquée) | ✅                                                            |
| URL API HTTPS        | Défaut `https://demo.uxii.fr`                                 |
| URL player           | Défaut `https://player.demo.uxii.fr` (confirmation opérateur) |
| `CINEMA_NAME`        | Optionnel fichier env diagnostic humain lecture               |

Ensuite : recap + confirmation **`o`**.

Modes installation rejouées quand dossier existe déjà (voir aussi sortie script elle‑même) :

| Touche interactive        | Effet projet                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R** Ré‑provisionnement  | Supprime **`/etc/quiz-app/provisioned`** ⇒ prochains starts Chromium repassent par `/provision…` jusqu’à re‑validation utilisateur après succès vue écran fonctionnel puis re‑création témoin.                                                                                                                                                                                                 |
| **M** Maj env seule       | Écrit uniquement nouveau `nuc.env`/`nuc-id` paramètres puis redéploie binaire kiosk + units ; **pas** nouveau cycle visuel forcé automatique hors actions déjà incluses ; utilisez si infra URL change mais profil Chromium encore présent fonctionnel ET identité NUC identique projet. Si `auth_key` change : réfléchir si **`R`** meilleur avant choix automatique M hors expertise locale. |
| **N** Reset complet local | Efface ancien fichiers config locaux projet (`nuc-id`, `nuc.env`, **`provisioned`**) ⇒ resaisie exhaustive identique première installation physique.                                                                                                                                                                                                                                           |

### Ce que fait techniquement l’automatisme après confirmation

Paquets types : détection **`chromium` vs chromium-browser Debian/Ubuntu** ; ajout couches X minimales : **`xserver-xorg-core`, `xinit`, `dbus-user-session`, `unclutter`, `xdotool`, `fonts-liberation`, `python3`**, utilitaires `x11-*` légers créant surface graphique kiosk **sans environnement GNOME**.

Créé utilisateur non root **`quizkiosk`** (groupes **`video,input,audio,tty`**), essaye **`loginctl enable-linger`** quand systemd-logind existe.

`/etc/quiz-app/nuc.env` exemple contenu lignes projet : `NUC_UID`, **`AUTH_KEY`**, **`API_URL`** (pour référence humaine infra — build Next doit déjà avoir `NEXT_PUBLIC_*` aligné durant mise en prod artefact hors scope script kiosk), **`PLAYER_URL`, `CINEMA_NAME`**.

Déploie systemd :

| Unité                           | Fonctionnement                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`quiz-nuc-chromium.service`** | `Restart=always` `RestartSec=5` • `ExecStart=/usr/bin/xinit /usr/local/bin/quiz-nuc-chromium-kiosk.sh -- /usr/bin/X :0 vt7 …` • `ExecStartPre=+xhost +SI:localuser:quizkiosk` aide accès DISPLAY `:0`.                                                                                           |
| **`quiz-nuc-restart.service`**  | Oneshot : `systemctl restart quiz-nuc-chromium.service`                                                                                                                                                                                                                                          |
| **`quiz-nuc-restart.timer`**    | `OnCalendar=*-*-* 04:00:00` `Persistent=yes` ⇒ redémarrage navigateur hors séances projet standard prédit **pas** équivalent sophistication watchdog fenêtre ; complément humain prévu runbook spectacle si freeze rare exceptionnel encore animé alors qu’Ubuntu process Chromium vit toujours. |

Fin phase installation : après message interactif projet : opérateur confirme visuel **`/screen` ou idle projet opérationnels** ⇒ script crée **`/etc/quiz-app/provisioned`** puis **`systemctl restart quiz-nuc-chromium`** pour que URL racine soit utilisée prochain passages boot **sans republication `auth_key` query string après ce moment.**

---

## 5. Contrôler l’installation

| Attendu                                         | Comment                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Écran passe état projet attendu après provision | observation directe après validation script                                          |
| NUC passe **online** admin monitor              | quelques dizaines secondes suivant projet monitor interne après heartbeats réguliers |
| Service actif unité principale                  | `systemctl status quiz-nuc-chromium`                                                 |
| Journal récent kiosk                            | `journalctl -u quiz-nuc-chromium -b -n200 --no-pager`                                |

---

## 6. Routes heartbeat disponibles serveur projet

Pour clarifier divergence ancienne littérature projet : **deux routes différentes** existent encore volontairement :

| Méthode + chemin HTTP                 | Mécanisme d’authentification                                                 | Client standard associé projet                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /api/nucs/heartbeat`            | Cookie JWT `nuc_session` posé après auth provision navigateur (**httpOnly**) | **`apps/player` actuel après login `POST /api/nucs/auth` — corps heartbeat `{}`** |
| `POST /api/nuc/heartbeat` (singulier) | Corps avec `nucUid` **+ `authKey` + version / infos**                        | usages outillage / automatisation hors navigateur kiosque intégrant Next          |

**Ne fusionnez PAS** comportements entre elles inadvertance debugging.

Référence monitoring : trois échecs consécutifs des appels heartbeat côté player mènent à `/error?reason=heartbeat_failed` ; cette page relance ensuite un **rechargement complet automatique environ 30 s après l’affichage** (valeur projet PR9 synchronisée avec le texte utilisateur). Côté serveur, absence de heartbeat valide **~ 90 s** ⇒ NUC considéré hors ligne dans l’admin (voir implémentation moniteur NUC projet).

---

## 7. Mise à niveau artefacts player sur le terrain (SSH pilotage)

Voir architecture **`PROJECT_REFERENCE` § 4.4** : **manuel SSH commence** jusqu’outil balena envisagé post‑pilote hors PR9 :

1. `ssh utilisateurHumain@${ip_nuc}`
2. Récupérer release build artefacts Next officielle `apps/player` + variables environnement compilées (**`NEXT_PUBLIC_API_URL`** cohérente API déployée, etc.).
3. Déployer selon playbook interne (PM2/serveur nginx statique/front Next adapté infra site).
4. `sudo systemctl restart quiz-nuc-chromium`.

---

## 8. Réseaux / accès distant optionnels hors script projet

Provisioning **PR9 ne configure pas automatiquement** Tailscale VPN privé projet : suivre playbook sécurité site ciné exploitation **manuellement** après validation équipe infra (voir § 4.4 MDM projet).

---

## 9. Dépannage express technique + renvois équipe spectacle

Liste diagnostics rapides opérateur technique projet :

```bash
systemctl status quiz-nuc-chromium
journalctl -u quiz-nuc-chromium --since "10 minutes ago" --no-pager
sudo cat /etc/quiz-app/nuc-id           # doit correspondre valeur admin projet
sudo test -f /etc/quiz-app/provisioned && echo témoin_présent || echo premier_passage_browser_provision_needed
sudo systemctl list-timers quiz-nuc-restart.timer
```

Ensuite problèmes d’experience **grand public spectacle** ⇒ **`docs/runbook-cinema.md`**.

---

## 10. Rappels flags Chromium (alignés infra PR précédentes)

Le script kiosk combine notamment : `--kiosk`, `--noerrdialogs`, `--disable-infobars`, `--disable-session-crashed-bubble`, `--disable-translate`, désactivation **`TranslateUI`**, `--check-for-update-interval` large valeur, **`--autoplay-policy=no-user-gesture-required`** (audio début partie).

---

### Historisation doc

| PR  | Livraison notable                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR6 | Bases chromium / exemple unit systemd                                                                                                                                                                            |
| PR9 | Procédure OS complète Ubuntu, script dossier officiel **`scripts/nuc/`**, fichier témoin `provisioned` + stratégie URL provision unique phase initiale puis racine ensuite, clarification double route heartbeat |
