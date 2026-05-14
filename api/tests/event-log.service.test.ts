import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/shared/db/index.js';
import * as emailNs from '../src/shared/email/index.js';
import * as loggerNs from '../src/shared/logger/index.js';
import { logEvent } from '../src/shared/events/event-log.service.js';
import { __resetCriticalAlertThrottleForTests } from '../src/shared/events/critical-alert.service.js';

describe('event log service', () => {
  let sendEmailSpy: ReturnType<typeof vi.spyOn>;
  let errorLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetCriticalAlertThrottleForTests();
    await prisma.eventLog.deleteMany();
    delete process.env.ADMIN_ALERT_EMAILS;
    sendEmailSpy = vi.spyOn(emailNs, 'sendEmail').mockResolvedValue(undefined as never);
    errorLogSpy = vi.spyOn(loggerNs.logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    sendEmailSpy.mockRestore();
    errorLogSpy.mockRestore();
    __resetCriticalAlertThrottleForTests();
  });

  it('persiste une ligne events_log niveau info', async () => {
    logEvent({
      level: 'info',
      eventType: 'test.event',
      payload: { hello: 'world' },
    });
    await vi.waitUntil(async () => (await prisma.eventLog.count()) > 0);
    const row = await prisma.eventLog.findFirst();
    expect(row?.eventType).toBe('test.event');
    expect(row?.level).toBe('info');
  });

  it('persist échoue → ne throw pas, log erreur', async () => {
    const spy = vi.spyOn(prisma.eventLog, 'create').mockRejectedValueOnce(new Error('DB down'));
    logEvent({ level: 'info', eventType: 'test.fail_db' });
    await vi.waitUntil(() => errorLogSpy.mock.calls.length > 0);
    spy.mockRestore();
  });

  it('critical sans ADMIN_ALERT_EMAILS → uniquement persist', async () => {
    logEvent({ level: 'critical', eventType: 'critical.no_email', payload: {} });
    await vi.waitUntil(async () => (await prisma.eventLog.count()) > 0);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('critical envoie une alerte + throttle même eventType 60s', async () => {
    process.env.ADMIN_ALERT_EMAILS = 'alert1@test.local,alert2@test.local';

    logEvent({ level: 'critical', eventType: 'panic.one', payload: { n: 1 } });
    logEvent({ level: 'critical', eventType: 'panic.one', payload: { n: 2 } });
    await vi.waitUntil(async () => (await prisma.eventLog.count()) >= 2);
    await vi.waitUntil(() => sendEmailSpy.mock.calls.length >= 1);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);

    sendEmailSpy.mockClear();
    logEvent({ level: 'critical', eventType: 'panic.two', payload: {} });
    await vi.waitUntil(async () => (await prisma.eventLog.count()) >= 3);
    await vi.waitUntil(() => sendEmailSpy.mock.calls.length >= 1);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendEmailSpy.mock.calls[0]?.[0]?.subject).toContain('panic.two');
  });
});
