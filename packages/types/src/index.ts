export type CinemaStatus = 'active' | 'paused' | 'trial';
export type ScreenStatus = 'active' | 'inactive' | 'maintenance';
export type NucStatus = 'online' | 'offline' | 'error' | 'provisioning';
export type UserRole = 'player' | 'projectionist' | 'cinema_admin' | 'super_admin' | 'sponsor';
export type OAuthProvider = 'google' | 'apple';
export type QuizType = 'standard' | 'sponsored' | 'custom';
export type QuizStatus = 'draft' | 'published' | 'archived';
export type AnswerPosition = 'A' | 'B' | 'C' | 'D';
export type SessionState = 'lobby' | 'running' | 'paused' | 'ended' | 'aborted';
export type PlayerStatus = 'active' | 'disconnected' | 'kicked';
export type PrizeType = 'discount_qr' | 'video' | 'other';
export type EventLevel = 'info' | 'warn' | 'error' | 'critical';
export type AiGenerationStatus = 'success' | 'failed' | 'partial';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type InvitationRole = 'projectionist' | 'cinema_admin' | 'sponsor';
export type GameKind = 'internal' | 'sponsored';
export type GameStatus = 'draft' | 'published' | 'archived';
export type RoundState = 'pending' | 'running' | 'ended' | 'skipped';

export interface HealthCheckResponse {
  status: 'ok';
}

export interface PingPayload {
  timestamp: string;
}

export interface PongPayload {
  timestamp: string;
  serverTime: string;
}
