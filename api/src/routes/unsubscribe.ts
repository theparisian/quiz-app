import { Router } from 'express';

const router = Router();

/** Page publique RGPD : désinscription depuis le lien dans l'email lot. */
router.get('/unsubscribe', (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Désinscription</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 48px auto; padding: 0 16px; color: #111; }
    .msg { margin-top: 24px; line-height: 1.5; }
    .err { color: #b91c1c; }
    button { margin-top: 16px; padding: 10px 20px; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Désinscription</h1>
  <p id="status" class="msg">Traitement en cours…</p>
  <script>
    (function () {
      var code = ${JSON.stringify(code)};
      var sig = ${JSON.stringify(sig)};
      var statusEl = document.getElementById('status');
      if (!code || !sig) {
        statusEl.textContent = 'Lien invalide ou incomplet.';
        statusEl.className = 'msg err';
        return;
      }
      fetch('/api/prizes/unsubscribe/' + encodeURIComponent(code), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: sig }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (_ref) {
          var ok = _ref.ok;
          var j = _ref.j;
          if (ok && j.ok) {
            statusEl.textContent =
              "Tu ne recevras plus d'emails de notre part. Ton adresse a été supprimée.";
            return;
          }
          var msg = (j.error && j.error.message) || 'Une erreur est survenue.';
          statusEl.textContent = msg;
          statusEl.className = 'msg err';
        })
        .catch(function () {
          statusEl.textContent = 'Impossible de contacter le serveur.';
          statusEl.className = 'msg err';
        });
    })();
  </script>
</body>
</html>`;

  res.status(200).type('html').send(html);
});

export { router as unsubscribeRouter };
