import { prisma } from '../../shared/db/index.js';
import { nanoid } from 'nanoid';
import type { UserRole } from '@quiz-app/types';

export const usersService = {
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  async findById(id: bigint) {
    return prisma.user.findUnique({
      where: { id },
      include: { cinema: { select: { slug: true, name: true } } },
    });
  },

  async createSuperAdmin(email: string, displayName: string) {
    return prisma.user.create({
      data: {
        email,
        displayName,
        role: 'super_admin',
      },
    });
  },

  async createUser(data: {
    email: string;
    displayName: string;
    role: UserRole;
    cinemaId?: bigint;
    oauthProvider?: 'google' | 'apple';
    oauthId?: string;
  }) {
    return prisma.user.create({ data });
  },

  async updateDisplayName(userId: bigint, displayName: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { displayName },
    });
  },

  async softDeleteUser(userId: bigint) {
    const anonymizedEmail = `deleted-${nanoid()}@deleted.local`;
    return prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: anonymizedEmail,
        displayName: 'Utilisateur supprimé',
        magicLinkToken: null,
        magicLinkExpiresAt: null,
        oauthProvider: null,
        oauthId: null,
      },
    });
  },

  async updateLastLogin(userId: bigint) {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  },
};
