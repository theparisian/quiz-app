import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../src/shared/email/index.js';

describe('Email templates', () => {
  it('should render magic-link template with variables', () => {
    const html = renderTemplate('magic-link', {
      displayName: 'Anzio',
      link: 'https://admin.app/auth/verify?token=abc123',
      logoUrl: 'https://admin.app/logo.png',
    });
    expect(html).toContain('Anzio');
    expect(html).toContain('https://admin.app/auth/verify?token=abc123');
    expect(html).toContain('15 minutes');
    expect(html).toContain('https://admin.app/logo.png');
  });

  it('should render invitation template with variables', () => {
    const html = renderTemplate('invitation', {
      inviterName: 'Anzio',
      cinemaName: 'Le Quai',
      role: 'projectionniste',
      link: 'https://console.app/invitations/accept?token=xyz',
      logoUrl: 'https://admin.app/logo.png',
    });
    expect(html).toContain('Anzio');
    expect(html).toContain('Le Quai');
    expect(html).toContain('projectionniste');
    expect(html).toContain('7 jours');
    expect(html).toContain('https://admin.app/logo.png');
  });
});
