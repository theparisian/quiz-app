import type { LogEventInput } from './event-log.types.js';
import { sendEmail } from '../email/index.js';
import { logger } from '../logger/index.js';

const CRITICAL_ALERT_COOLDOWN_MS = 60_000;

const lastSentByEventType = new Map<string, number>();

/** Tests only — resets in-memory throttle. */
export function __resetCriticalAlertThrottleForTests(): void {
  lastSentByEventType.clear();
}

export function parseAdminAlertEmails(): string[] {
  const raw = process.env.ADMIN_ALERT_EMAILS;
  if (raw === undefined || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isThrottled(eventType: string, nowMs: number): boolean {
  const last = lastSentByEventType.get(eventType);
  if (last === undefined) return false;
  return nowMs - last < CRITICAL_ALERT_COOLDOWN_MS;
}

function markSent(eventType: string, nowMs: number): void {
  lastSentByEventType.set(eventType, nowMs);
}

function buildCriticalAlertText(input: LogEventInput): string {
  const lines = [
    `eventType=${input.eventType}`,
    `timestamp=${new Date().toISOString()}`,
    `sessionId=${input.sessionId?.toString() ?? '—'}`,
    `nucId=${input.nucId?.toString() ?? '—'}`,
    `cinemaId=${input.cinemaId?.toString() ?? '—'}`,
    `payload=${JSON.stringify(input.payload ?? {}, null, 2)}`,
  ];
  return lines.join('\n');
}

export async function sendCriticalAlert(input: LogEventInput): Promise<void> {
  const recipients = parseAdminAlertEmails();
  if (recipients.length === 0) return;

  const nowMs = Date.now();
  if (isThrottled(input.eventType, nowMs)) {
    logger.info(
      { eventType: input.eventType },
      'Critical alert email suppressed (same eventType throttled)',
    );
    return;
  }
  markSent(input.eventType, nowMs);

  const text = buildCriticalAlertText(input);
  await sendEmail({
    to: recipients,
    subject: `[Quiz App - CRITICAL] ${input.eventType}`,
    text,
  });
}
