// mapsprove/backend/src/routes/settingsRoutes.js
import { Router } from 'express';
import {
  listSettings, saveSettings, revealSetting, applySettings
} from '../controllers/settingsController.js';

const r = Router();
// TODO: middleware de auth/role admin

r.get('/api/settings', listSettings);
r.post('/api/settings', saveSettings);
r.get('/api/settings/:key/reveal', revealSetting);   // opcional
r.post('/api/settings/apply', applySettings);

export default r;
