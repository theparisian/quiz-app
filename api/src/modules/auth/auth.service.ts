import { nanoid } from 'nanoid';
import { prisma } from '../../shared/db/index.js';
import { sendEmail, renderTemplate } from '../../shared/email/index.js';
import { getBrandLogoUrl } from '../../shared/brand.js';
import { signJwt } from '../../shared/auth/jwt.js';
import { logger } from '../../shared/logger/index.js';

const MAGIC_LINK_EXPIRY_MINUTES = 15;

export const authService = {
  async requestMagicLink(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });

    // No leak: always return success even if user not found
    if (!user || user.deletedAt) {
      logger.info({ email }, 'Magic link requested for non-existent email');
      return;
    }

    // Only admin roles can use magic link
    if (
      user.role !== 'super_admin' &&
      user.role !== 'projectionist' &&
      user.role !== 'cinema_admin'
    ) {
      logger.info({ email, role: user.role }, 'Magic link requested for non-admin role');
      return;
    }

    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { magicLinkToken: token, magicLinkExpiresAt: expiresAt },
    });

    const appUrl =
      user.role === 'super_admin'
        ? (process.env.APP_URL_ADMIN ?? 'http://localhost:3004')
        : (process.env.APP_URL_CONSOLE ?? 'http://localhost:3003');

    const link = `${appUrl}/auth/verify?token=${token}`;
    const html = renderTemplate('magic-link', {
      displayName: user.displayName ?? user.email ?? '',
      link,
      logoUrl: getBrandLogoUrl(),
    });

    await sendEmail({
      to: email,
      subject: 'Ton lien de connexion — Shh!',
      html,
      text: `Connecte-toi à Shh! : ${link} (expire dans 15 minutes)`,
    });

    logger.info({ userId: user.id.toString(), email }, 'Magic link generated and sent');
  },

  async verifyMagicLink(token: string): Promise<{
    accessToken: string;
    user: { id: string; email: string | null; displayName: string | null; role: string };
  } | null> {
    const user = await prisma.user.findFirst({
      where: {
        magicLinkToken: token,
        magicLinkExpiresAt: { gt: new Date() },
        deletedAt: null,
      },
    });

    if (!user) {
      logger.warn({ token: token.slice(0, 8) + '...' }, 'Invalid or expired magic link token');
      return null;
    }

    // Invalidate token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        magicLinkToken: null,
        magicLinkExpiresAt: null,
        lastLoginAt: new Date(),
      },
    });

    const accessToken = await signJwt({
      userId: user.id.toString(),
      role: user.role as 'super_admin' | 'projectionist' | 'cinema_admin' | 'player',
      cinemaId: user.cinemaId?.toString(),
    });

    logger.info({ userId: user.id.toString(), role: user.role }, 'Magic link login successful');

    return {
      accessToken,
      user: {
        id: user.id.toString(),
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  },
};
