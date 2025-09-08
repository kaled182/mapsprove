// mapsprove/backend/src/controllers/settingsController.js
import { seal, open } from '../lib/settingsCrypto.js';
import { upsertSetting, listSettingKeys, getSettingRaw } from '../models/settingsModel.js';
import { spawn } from 'child_process';
import path from 'path';

function mask(str) {
  if (!str) return '';
  return '••••••••';
}

// GET /api/settings  -> lista chaves (sem valores)
export async function listSettings(req, res, next) {
  try {
    // TODO: validar req.user.role === 'admin'
    const rows = await listSettingKeys();
    res.json({
      items: rows.map(r => ({
        key: r.key,
        masked: true,
        updated_at: r.updated_at,
        updated_by: r.updated_by || 'system',
      }))
    });
  } catch (e) { next(e); }
}

// POST /api/settings  -> { items: [{key, value, actor}] }
export async function saveSettings(req, res, next) {
  try {
    // TODO: validar admin
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items vazio' });
    }
    const actor = (req.user && req.user.email) || 'admin';
    const saved = [];
    for (const it of items) {
      if (!it.key || typeof it.value !== 'string') {
        return res.status(400).json({ error: `item inválido: ${JSON.stringify(it)}` });
      }
      const { value_enc, nonce } = seal(it.value);
      const row = await upsertSetting({ key: it.key, value_enc, nonce, actor });
      saved.push(row.key);
    }
    res.json({ ok: true, saved });
  } catch (e) { next(e); }
}

// (opcional) GET /api/settings/:key/reveal  -> decifra 1 chave (logar auditoria)
export async function revealSetting(req, res, next) {
  try {
    // TODO: validar admin + confirmação segunda etapa
    const { key } = req.params;
    const row = await getSettingRaw(key);
    if (!row) return res.status(404).json({ error: 'not found' });
    const value = open(row.value_enc, row.nonce);
    res.json({ key, value }); // cuidado: revele só para admin e registre auditoria
  } catch (e) { next(e); }
}

// POST /api/settings/apply  -> roda o script de aplicação
export async function applySettings(req, res, next) {
  try {
    // TODO: validar admin
    const scriptPath = path.resolve(process.cwd(), 'scripts/infra/apply-config.sh');
    const child = spawn(scriptPath, { stdio: 'inherit', shell: true });

    child.on('exit', (code) => {
      if (code === 0) {
        return res.json({ ok: true, applied: true });
      }
      return res.status(500).json({ ok: false, code });
    });
  } catch (e) { next(e); }
}
