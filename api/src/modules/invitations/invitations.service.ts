import { nanoid } from 'nanoid';
import { prisma } from '../../shared/db/index.js';
import { signJwt } from '../../shared/auth/jwt.js';
import { sendEmail, renderTemplate } from '../../shared/email/index.js';
import { getBrandLogoUrl } from '../../shared/brand.js';
import { logger } from '../../shared/logger/index.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { InvitationRole } from '@quiz-app/types';

const INVITATION_EXPIRY_DAYS = 7;

export const invitationsService = {
  async create(data: {
    email: string;
    role: InvitationRole;
    cinemaId: bigint;
    invitedBy: { id: bigint; displayName: string | null };
  }) {
    const cinema = await prisma.cinema.findUnique({ where: { id: data.cinemaId } });
    if (!cinema) throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');

    const existing = await prisma.invitation.findFirst({
      where: {
        email: data.email,
        cinemaId: data.cinemaId,
        status: 'pending',
      },
    });
    if (existing)
      throw new AppError(
        'A pending invitation already exists for this email and cinema',
        409,
        'INVITATION_ALREADY_EXISTS',
      );

    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        email: data.email,
        role: data.role,
        cinemaId: data.cinemaId,
        invitedByUserId: data.invitedBy.id,
        token,
        expiresAt,
      },
      include: { cinema: true },
    });

    const consoleUrl = process.env.APP_URL_CONSOLE ?? 'http://localhost:3003';
    const link = `${consoleUrl}/invitations/accept?token=${token}`;
    const roleLabel = data.role === 'projectionist' ? 'projectionniste' : 'administrateur cinéma';

    const html = renderTemplate('invitation', {
      inviterName: data.invitedBy.displayName ?? 'Un administrateur',
      cinemaName: cinema.name,
      role: roleLabel,
      link,
      logoUrl: getBrandLogoUrl(),
    });

    await sendEmail({
      to: data.email,
      subject: `Invitation à rejoindre ${cinema.name} — Shh!`,
      html,
      text: `Tu as été invité à rejoindre ${cinema.name} en tant que ${roleLabel}. Lien : ${link}`,
    });

    logger.info(
      {
        invitationId: invitation.id.toString(),
        email: data.email,
        cinemaId: data.cinemaId.toString(),
        role: data.role,
      },
      'Invitation created and email sent',
    );

    return invitation;
  },

  async accept(token: string, displayName: string) {
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { cinema: true },
    });

    if (!invitation) throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
    if (invitation.status !== 'pending')
      throw new AppError(`Invitation is ${invitation.status}`, 400, 'INVITATION_NOT_PENDING');
    if (invitation.expiresAt < new Date()) {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'expired' } });
      throw new AppError('Invitation has expired', 400, 'INVITATION_EXPIRED');
    }

    const userRole =
      invitation.role === 'projectionist' ? ('projectionist' as const) : ('cinema_admin' as const);

    let user = await prisma.user.findUnique({ where: { email: invitation.email } });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          role: userRole,
          cinemaId: invitation.cinemaId,
          displayName,
          lastLoginAt: new Date(),
        },
      });
      user = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    } else {
      user = await prisma.user.create({
        data: {
          email: invitation.email,
          displayName,
          role: userRole,
          cinemaId: invitation.cinemaId,
        },
      });
    }

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });

    const accessToken = await signJwt({
      userId: user.id.toString(),
      role: user.role as 'projectionist' | 'cinema_admin',
      cinemaId: user.cinemaId?.toString(),
    });

    logger.info(
      {
        invitationId: invitation.id.toString(),
        userId: user.id.toString(),
        role: user.role,
      },
      'Invitation accepted',
    );

    return {
      accessToken,
      user: {
        id: user.id.toString(),
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        cinemaId: user.cinemaId?.toString() ?? null,
      },
    };
  },

  async revoke(invitationId: bigint) {
    const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
    if (invitation.status !== 'pending')
      throw new AppError('Only pending invitations can be revoked', 400, 'INVITATION_NOT_PENDING');

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'revoked' },
    });

    logger.info({ invitationId: invitationId.toString() }, 'Invitation revoked');
  },

  async getByToken(token: string) {
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { cinema: { select: { name: true, slug: true } } },
    });

    if (!invitation) throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
    if (invitation.status !== 'pending')
      throw new AppError(`Invitation is ${invitation.status}`, 400, 'INVITATION_NOT_PENDING');
    if (invitation.expiresAt < new Date()) {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'expired' } });
      throw new AppError('Invitation has expired', 400, 'INVITATION_EXPIRED');
    }

    return {
      email: invitation.email,
      role: invitation.role,
      cinemaName: invitation.cinema.name,
      cinemaSlug: invitation.cinema.slug,
    };
  },

  async list(filters: {
    status?: string | undefined;
    cinemaId?: bigint | undefined;
    page: number;
    limit: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.cinemaId) where.cinemaId = filters.cinemaId;

    const [items, total] = await Promise.all([
      prisma.invitation.findMany({
        where,
        include: {
          cinema: { select: { name: true, slug: true } },
          invitedBy: { select: { displayName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.invitation.count({ where }),
    ]);

    return {
      items: items.map((i) => ({
        id: i.id.toString(),
        email: i.email,
        role: i.role,
        status: i.status,
        cinemaName: i.cinema.name,
        cinemaSlug: i.cinema.slug,
        invitedBy: i.invitedBy.displayName ?? i.invitedBy.email,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
        acceptedAt: i.acceptedAt?.toISOString() ?? null,
      })),
      total,
      page: filters.page,
      limit: filters.limit,
    };
  },
};
