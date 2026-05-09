# Déploiement NUC (Chromium plein écran)

Guide opérationnel pour une borne / NUC Linux qui affiche l’app **player** (`apps/player`) en kiosque.

## Prérequis réseau

- Accès **HTTPS** (ou HTTP en lab uniquement) vers l’API (`NEXT_PUBLIC_API_URL`) et le WebSocket Socket.IO sur le **même origine hôte/port** que l’API, ou CORS + cookies `SameSite` cohérents avec votre domaine.
- Ports sortants : selon votre hébergement (ex. `443` vers l’API).
- Si le NUC et le téléphone joueurs sont sur des VLAN différents, vérifier la résolution DNS et l’absence de filtrage WebSocket.

## Flags Chromium recommandés (kiosque)

Lancer Chromium (ou Google Chrome) en mode application, sans barre d’UI, sur l’URL du player :

```bash
chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --disable-features=TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --app="https://player.example.com/screen"
```

Notes :

- **`--autoplay-policy=no-user-gesture-required`** : évite qu’une politique navigateur bloque les sons du quiz (voir aussi les réglages audio côté app).
- **`--app=URL`** : fenêtre sans onglets, proche du plein écran ; `--kiosk` force le plein écran strict (sortie souvent `Alt+F4` / configurée).

## Variables d’environnement (build / runtime)

Créer `apps/player/.env.local` (ou variables au build) :

- `NEXT_PUBLIC_API_URL` : URL publique de l’API (ex. `https://api.example.com`).

## Heartbeat et statut « online »

Le player appelle périodiquement l’API (`/api/nucs/heartbeat` avec cookie `nuc_session` après provisionnement).  
Côté serveur, un moniteur marque le NUC **offline** si aucun heartbeat valide n’est vu pendant ~90 s (voir implémentation PR6 : intervalle de contrôle 30 s).

## Watchdog systemd (reprise après crash navigateur)

Exemple de service qui relance Chromium si le processus se termine :

`/etc/systemd/system/quiz-nuc-chromium.service`

```ini
[Unit]
Description=Quiz NUC Chromium kiosk
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nuc
Environment=DISPLAY=:0
ExecStart=/usr/bin/chromium --kiosk --app=https://player.example.com/screen
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
```

Puis : `sudo systemctl enable --now quiz-nuc-chromium.service`

Adapter `User`, `DISPLAY`, chemin `chromium` et l’URL. Pour un gestionnaire de session graphique (auto-login + session X11/Wayland), ce service peut être lancé via un script au démarrage de la session si `DISPLAY` n’est pas disponible au boot.

## Événements temps réel

Les changements de statut NUC (`nuc:status_changed`) sont émis vers la room `screen:{screenId}` (et `nuc:{id}` sur le namespace player). La **console live** rejoint cette room après `console:join` / `console:resume` pour refléter hors-ligne / retour online.
