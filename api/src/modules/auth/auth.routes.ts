import { Router } from 'express';
import { validate } from '../../shared/validation/index.js';
import { magicLinkRequestSchema, magicLinkVerifySchema } from './auth.schemas.js';
import { authService } from './auth.service.js';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
};

router.post('/magic-link/request', async (req, res, next) => {
  try {
    const { email } = validate(magicLinkRequestSchema, req.body);
    await authService.requestMagicLink(email);
    // Always 200, no information leak
    res.json({ message: 'If this email exists, a magic link has been sent.' });
  } catch (error) {
    next(error);
  }
});

router.post('/magic-link/verify', async (req, res, next) => {
  try {
    const { token } = validate(magicLinkVerifySchema, req.body);
    const result = await authService.verifyMagicLink(token);

    if (!result) {
      res.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Token is invalid or expired' },
      });
      return;
    }

    res.cookie('token', result.accessToken, COOKIE_OPTIONS);
    res.json({ user: result.user });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logged out' });
});

// OAuth scaffolding — will be activated in PR5
router.post('/oauth/google/callback', (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Google OAuth not yet implemented' },
  });
});

router.post('/oauth/apple/callback', (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Apple OAuth not yet implemented' },
  });
});

export { router as authRouter };
