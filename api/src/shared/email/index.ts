import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../logger/index.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT ?? '465', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      logger.warn('SMTP not configured — emails will be logged to console');
      transporter = nodemailer.createTransport({ jsonTransport: true });
      return transporter;
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

function escapeHtmlForEmail(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface SendEmailOptions {
  /** Destinataire(s) SMTP (virgules acceptées). */
  to: string | string[];
  subject: string;
  /** Si absent, dérivé d’un gabarit minimal à partir de `text` (pour alertes ops). */
  html?: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const from = `"${process.env.SMTP_FROM_NAME ?? 'Quiz App'}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@quiz.app'}>`;
  const t = getTransporter();

  const toField = Array.isArray(options.to) ? options.to.join(',') : options.to;
  let htmlBody = options.html;
  let textBody = options.text ?? '';
  if (htmlBody === undefined) {
    if (textBody.trim() !== '') {
      htmlBody = `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace">${escapeHtmlForEmail(textBody)}</pre>`;
    } else {
      htmlBody = '';
    }
  }
  if (textBody.trim() === '' && htmlBody.length > 0) {
    textBody = '[HTML body]';
  }

  try {
    const info = await t.sendMail({
      from,
      to: toField,
      subject: options.subject,
      html: htmlBody || undefined,
      text: textBody || undefined,
    });

    if (info.envelope) {
      logger.info({ to: toField, subject: options.subject }, 'Email sent');
    } else {
      logger.info(
        { to: toField, subject: options.subject, message: JSON.parse(info.message as string) },
        'Email logged (SMTP not configured)',
      );
    }
  } catch (error) {
    logger.error({ err: error, to: toField, subject: options.subject }, 'Email send failed');
    throw error;
  }
}

const templateCache = new Map<string, string>();

export function renderTemplate(name: string, data: Record<string, string>): string {
  let template = templateCache.get(name);
  if (!template) {
    const templatePath = resolve(import.meta.dirname, 'templates', `${name}.html`);
    template = readFileSync(templatePath, 'utf-8');
    templateCache.set(name, template);
  }

  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replaceAll(`{{ ${key} }}`, value);
  }
  return result;
}
