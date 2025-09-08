// mapsprove/backend/src/controllers/authController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { findUserByEmail, createUser } from '../models/userModel.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

export async function seedAdmin(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email/password obrigatórios' });

    const hash = await bcrypt.hash(password, 10);
    const created = await createUser({ email, password_hash: hash, role: 'admin' });
    if (!created) return res.status(200).json({ ok: true, note: 'Usuário já existia' });
    return res.json({ ok: true, user: created });
  } catch (e) { next(e); }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email/password obrigatórios' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'credenciais inválidas' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'credenciais inválidas' });

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({ token, user: { email: user.email, role: user.role } });
  } catch (e) { next(e); }
}
