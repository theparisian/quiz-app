import { afterEach, describe, expect, it } from 'vitest';
import { resolveCorsOrigins } from '../src/shared/cors-origins.js';
import { buildApp } from '../src/create-app.js';

describe('resolveCorsOrigins', () => {
  const saved = { cors: process.env.CORS_ORIGINS, env: process.env.NODE_ENV };

  afterEach(() => {
    if (saved.cors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = saved.cors;
    process.env.NODE_ENV = saved.env;
  });

  it('parses a comma-separated list and trims entries', () => {
    process.env.CORS_ORIGINS = ' https://a.example , https://b.example,, ';
    expect(resolveCorsOrigins()).toEqual(['https://a.example', 'https://b.example']);
  });

  it('allows every origin outside production when unset', () => {
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = 'development';
    expect(resolveCorsOrigins()).toBe(true);
  });

  it('fails app start in production without CORS_ORIGINS', () => {
    process.env.CORS_ORIGINS = '';
    process.env.NODE_ENV = 'production';
    expect(() => resolveCorsOrigins()).toThrow(/CORS_ORIGINS/);
    expect(() => buildApp()).toThrow(/CORS_ORIGINS/);
  });

  it('starts in production when CORS_ORIGINS is set', () => {
    process.env.CORS_ORIGINS = 'https://console.example';
    process.env.NODE_ENV = 'production';
    expect(() => buildApp()).not.toThrow();
  });
});
