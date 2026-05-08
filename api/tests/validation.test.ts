import { describe, it, expect } from 'vitest';
import { validate } from '../src/shared/validation/index.js';
import { createCinemaSchema } from '../src/modules/cinemas/cinemas.schemas.js';
import { magicLinkRequestSchema } from '../src/modules/auth/auth.schemas.js';
import { createInvitationSchema } from '../src/modules/invitations/invitations.schemas.js';

describe('Zod validation', () => {
  describe('createCinemaSchema', () => {
    it('should accept valid cinema data', () => {
      const result = validate(createCinemaSchema, { name: 'Le Quai' });
      expect(result.name).toBe('Le Quai');
    });

    it('should reject empty name', () => {
      expect(() => validate(createCinemaSchema, { name: '' })).toThrow('Validation failed');
    });

    it('should reject invalid slug', () => {
      expect(() => validate(createCinemaSchema, { name: 'Test', slug: 'INVALID SLUG' })).toThrow();
    });
  });

  describe('magicLinkRequestSchema', () => {
    it('should accept valid email', () => {
      const result = validate(magicLinkRequestSchema, { email: 'test@test.com' });
      expect(result.email).toBe('test@test.com');
    });

    it('should reject invalid email', () => {
      expect(() => validate(magicLinkRequestSchema, { email: 'notanemail' })).toThrow();
    });
  });

  describe('createInvitationSchema', () => {
    it('should accept valid invitation data', () => {
      const result = validate(createInvitationSchema, {
        email: 'proj@cinema.fr',
        role: 'projectionist',
        cinemaId: '1',
      });
      expect(result.role).toBe('projectionist');
    });

    it('should reject invalid role', () => {
      expect(() =>
        validate(createInvitationSchema, {
          email: 'test@test.com',
          role: 'admin',
          cinemaId: '1',
        }),
      ).toThrow();
    });
  });
});
