import { Router } from 'express';
import { requireAuth } from '../../shared/auth/index.js';
import { dashboardService } from './dashboard.service.js';

const router = Router();

const DASHBOARD_ROLES = ['super_admin', 'cinema_admin'] as const;

router.get('/health', requireAuth([...DASHBOARD_ROLES]), async (req, res, next) => {
  try {
    const user = req.user!;
    const scope = dashboardService.resolveScope(user);
    const data = await dashboardService.getHealth(scope);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.get('/today', requireAuth([...DASHBOARD_ROLES]), async (req, res, next) => {
  try {
    const user = req.user!;
    const scope = dashboardService.resolveScope(user);
    const data = await dashboardService.getToday(scope);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.get('/recent-errors', requireAuth([...DASHBOARD_ROLES]), async (req, res, next) => {
  try {
    const user = req.user!;
    const scope = dashboardService.resolveScope(user);
    const data = await dashboardService.getRecentErrors(scope);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.get('/recent-sessions', requireAuth([...DASHBOARD_ROLES]), async (req, res, next) => {
  try {
    const user = req.user!;
    const scope = dashboardService.resolveScope(user);
    const data = await dashboardService.getRecentSessions(scope);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

export { router as dashboardRouter };
