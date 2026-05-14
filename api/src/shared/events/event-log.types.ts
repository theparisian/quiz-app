export type EventLevel = 'info' | 'warn' | 'error' | 'critical';

export interface LogEventInput {
  level: EventLevel;
  eventType: string;
  sessionId?: bigint;
  nucId?: bigint;
  cinemaId?: bigint;
  payload?: Record<string, unknown>;
}
