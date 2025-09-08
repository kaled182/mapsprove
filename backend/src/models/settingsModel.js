// mapsprove/backend/src/models/settingsModel.js
import { Pool } from 'pg';
const pool = new Pool(); // usa PG* do seu ambiente (DATABASE_URL etc.)

export async function upsertSetting({ key, value_enc, nonce, actor }) {
  const q = `
    INSERT INTO app_settings(key, value_enc, nonce, created_at, updated_at, updated_by)
    VALUES ($1, $2, $3, now(), now(), $4)
    ON CONFLICT (key) DO UPDATE
      SET value_enc = EXCLUDED.value_enc,
          nonce     = EXCLUDED.nonce,
          updated_at= now(),
          updated_by= EXCLUDED.updated_by
    RETURNING key`;
  const { rows } = await pool.query(q, [key, value_enc, nonce, actor || null]);

  await pool.query(
    'INSERT INTO settings_audit_log(key, action, actor, details) VALUES ($1,$2,$3,$4)',
    [key, 'updated', actor || null, JSON.stringify({ masked: true })]
  );
  return rows[0];
}

export async function listSettingKeys() {
  const { rows } = await pool.query('SELECT key, updated_at, updated_by FROM app_settings ORDER BY key ASC');
  return rows;
}

export async function getSettingRaw(key) {
  const { rows } = await pool.query('SELECT key, value_enc, nonce FROM app_settings WHERE key=$1', [key]);
  return rows[0] || null;
}
