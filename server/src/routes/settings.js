import { Router } from 'express';
import { getSetting, setSetting } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAdmin, (_req, res) => {
  res.json({
    registration_enabled: getSetting('registration_enabled', '1') === '1',
    invite_code: getSetting('invite_code', ''),
  });
});

router.put('/', requireAdmin, (req, res) => {
  if (req.body.registration_enabled !== undefined) {
    setSetting('registration_enabled', req.body.registration_enabled ? '1' : '0');
  }
  if (req.body.invite_code !== undefined) {
    setSetting('invite_code', String(req.body.invite_code || '').trim());
  }
  res.json({
    registration_enabled: getSetting('registration_enabled', '1') === '1',
    invite_code: getSetting('invite_code', ''),
  });
});

export default router;
