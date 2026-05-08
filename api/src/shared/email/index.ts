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

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const from = `"${process.env.SMTP_FROM_NAME ?? 'Quiz App'}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@quiz.app'}>`;
  const t = getTransporter();

  try {
    const info = await t.sendMail({ from, ...options });

    if (info.envelope) {
      logger.info({ to: options.to, subject: options.subject }, 'Email sent');
    } else {
      logger.info(
        { to: options.to, subject: options.subject, message: JSON.parse(info.message as string) },
        'Email logged (SMTP not configured)',
      );
    }
  } catch (error) {
    logger.error({ err: error, to: options.to, subject: options.subject }, 'Email send failed');
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
