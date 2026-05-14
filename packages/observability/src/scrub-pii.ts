const EMAIL_REGEX = /\S+@\S+/g;

/** Clés présentes dans quelque représentation d’erreur / contexte dont la valeur doit être masquée. */
const REDACT_KEYS = new Set(
  [
    'resumeToken',
    'resume_token',
    'authKey',
    'auth_key',
    'signature',
    'password',
    'passwordHash',
    'password_hash',
    'magicLinkToken',
    'magic_link_token',
    'PRIZE_HMAC_SECRET',
    'JWT_SECRET',
    'SESSION_SECRET',
    'cookie',
    'authorization',
  ].map((k) => k.toLowerCase()),
);

function scrubString(s: string): string {
  return s.replaceAll(EMAIL_REGEX, '[email]');
}

/** Sanitize un événement Sentry (mutation in-place compatible `beforeSend`). */
export function scrubPii<EventType>(event: EventType): EventType | null {
  if (event !== null && event !== undefined && typeof event === 'object') {
    scrubNode(event as unknown);
  }
  return event;
}

function scrubNode(node: unknown, keyHint?: string): void {
  if (node === null || node === undefined) return;

  if (typeof node === 'string') {
    // Les strings sous un objet sont mutées au niveau parent
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const entry = node[i];
      if (typeof entry === 'string') {
        (node as unknown[])[i] = scrubString(entry);
      } else {
        scrubNode(entry);
      }
    }
    return;
  }

  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const lower = k.toLowerCase();

      const v = o[k];
      const shouldRedactKey = REDACT_KEYS.has(lower);
      const isHeaderSensitive =
        lower === 'headers' && v !== null && typeof v === 'object' && !Array.isArray(v);

      if (shouldRedactKey) {
        o[k] = '[redacted]';
        continue;
      }

      if (isHeaderSensitive) {
        const headers = v as Record<string, unknown>;
        for (const hk of Object.keys(headers)) {
          const hl = hk.toLowerCase();
          if (hl === 'cookie' || hl === 'authorization') {
            headers[hk] = '[redacted]';
          }
        }
        scrubNode(headers);
        continue;
      }

      if (typeof v === 'string') {
        o[k] = scrubString(v);
      } else {
        scrubNode(v);
      }
    }
  }
}
