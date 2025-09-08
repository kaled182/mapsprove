// mapsprove/backend/src/models/userModel.js
import { Pool } from 'pg';
const pool = new Pool();

export async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

export async function createUser({ email, password_hash, role = 'admin' }) {
  const { rows } = await pool.query(
    `INSERT INTO users(email, password_hash, role)
     VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING
     RETURNING id, email, role`,
    [email, password_hash, role]
  );
  return rows[0] || null;
}
