// mapsprove/backend/src/lib/settingsCrypto.js
import crypto from 'crypto';

const MASTER_B64 = process.env.MAPSPROVE_MASTER_KEY || '';
if (!MASTER_B64) {
  console.warn('[settingsCrypto] MAPSPROVE_MASTER_KEY ausente! (somente DEV?)');
}
const MASTER = MASTER_B64 ? Buffer.from(MASTER_B64, 'base64') : Buffer.alloc(32, 0);

export function seal(plaintext) {
  if (!Buffer.isBuffer(MASTER) || MASTER.length !== 32) {
    throw new Error('Master key inválida: precisa de 32 bytes (base64).');
  }
  const iv = crypto.randomBytes(12); // GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { value_enc: Buffer.concat([enc, tag]), nonce: iv };
}

export function open(value_enc_buf, nonce_buf) {
  if (!Buffer.isBuffer(MASTER) || MASTER.length !== 32) {
    throw new Error('Master key inválida: precisa de 32 bytes (base64).');
  }
  const tag = value_enc_buf.slice(value_enc_buf.length - 16);
  const data = value_enc_buf.slice(0, -16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER, nonce_buf);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}
