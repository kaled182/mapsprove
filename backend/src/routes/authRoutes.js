// mapsprove/backend/src/routes/authRoutes.js
import { Router } from 'express';
import { login, seedAdmin } from '../controllers/authController.js';

const r = Router();
// Em produção, proteja /seed/admin (execute só uma vez e depois remova)
r.post('/api/auth/seed/admin', seedAdmin);
r.post('/api/auth/login', login);

export default r;
