import * as jose from 'jose';

export interface NucJwtPayload {
  nucId: string;
  screenId: string;
  type: 'nuc';
}

const NUC_JWT_EXPIRY = '30d';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is required');
  return new TextEncoder().encode(secret);
}

export async function signNucJwt(payload: Omit<NucJwtPayload, 'type'>): Promise<string> {
  return new jose.SignJWT({ nucId: payload.nucId, screenId: payload.screenId, type: 'nuc' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(NUC_JWT_EXPIRY)
    .sign(getSecret());
}

export async function verifyNucJwt(token: string): Promise<NucJwtPayload> {
  const { payload } = await jose.jwtVerify(token, getSecret());
  if (payload.type !== 'nuc') throw new Error('Invalid token type');
  return {
    nucId: payload.nucId as string,
    screenId: payload.screenId as string,
    type: 'nuc',
  };
}
