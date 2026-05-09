export interface PrizeEmailData {
  pseudo: string;
  rank: number;
  quizTitle: string;
  cinemaName: string;
  cinemaLogoUrl: string | null;
  prizeLabel: string;
  redeemUrl: string;
  redeemCode: string;
  unsubscribeUrl: string;
  qrCodeDataUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function buildPrizeEmail(data: PrizeEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Bravo ! Tu as gagné un lot au quiz ${data.cinemaName}`;
  const logoBlock = data.cinemaLogoUrl
    ? `<img src="${escapeHtml(data.cinemaLogoUrl)}" alt="" width="160" style="max-width:160px;height:auto;display:block;margin:0 auto 16px;" />`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #eee;text-align:center;">
          ${logoBlock}
          <div style="font-size:13px;color:#666;">${escapeHtml(data.cinemaName)}</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0 0 16px;font-size:20px;font-weight:700;">Bravo ${escapeHtml(data.pseudo)} ! 🎉</p>
          <p style="margin:0 0 12px;line-height:1.5;color:#333;">
            Tu as terminé #${data.rank} au quiz « ${escapeHtml(data.quizTitle)} » au ${escapeHtml(data.cinemaName)}.
          </p>
          <p style="margin:16px 0 8px;font-weight:600;">Ton lot :</p>
          <p style="margin:0 0 20px;font-size:17px;color:#111;">${escapeHtml(data.prizeLabel)}</p>
          <div style="text-align:center;margin:24px 0;">
            <img src="${data.qrCodeDataUrl}" alt="QR code lot" width="400" height="400" style="width:400px;max-width:100%;height:auto;border-radius:8px;"/>
          </div>
          <p style="margin:0 0 16px;line-height:1.5;color:#444;font-size:14px;">
            Présente ce code à la confiserie pour bénéficier de ton avantage.
          </p>
          <p style="margin:0 0 24px;font-family:ui-monospace,monospace;font-size:13px;color:#555;">
            Code : <strong>${escapeHtml(data.redeemCode)}</strong><br/>
            <span style="font-size:12px;color:#888;">(en cas de problème, communique-le manuellement)</span>
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px 28px;border-top:1px solid #eee;font-size:12px;color:#777;line-height:1.5;">
          Tu ne souhaites plus recevoir de mails de notre part ?
          <a href="${escapeHtml(data.unsubscribeUrl)}" style="color:#2563eb;">Se désinscrire</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Bravo ${data.pseudo} !`,
    '',
    `Tu as terminé #${data.rank} au quiz "${data.quizTitle}" au ${data.cinemaName}.`,
    '',
    `Ton lot : ${data.prizeLabel}`,
    '',
    `Lien pour utiliser ton lot : ${data.redeemUrl}`,
    '',
    `Code : ${data.redeemCode}`,
    '',
    `Ne plus recevoir d'e-mails : ${data.unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}
