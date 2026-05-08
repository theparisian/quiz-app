import * as jose from 'jose';
import type { UserRole } from '@quiz-app/types';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  cinemaId?: string | undefined;
}

const JWT_EXPIRY = '30d';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is required');
  return new TextEncoder().encode(secret);
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  const jwtPayload: jose.JWTPayload = {
    userId: payload.userId,
    role: payload.role,
  };
  if (payload.cinemaId) jwtPayload.cinemaId = payload.cinemaId;

  return new jose.SignJWT(jwtPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getSecret());
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jose.jwtVerify(token, getSecret());
  return {
    userId: payload.userId as string,
    role: payload.role as UserRole,
    cinemaId: (payload.cinemaId as string) ?? undefined,
  };
}
