// mapsprove/frontend/src/pages/Setup.tsx
import { useState } from 'react';

type SaveResp = { ok: boolean; saved: string[] };

export default function Setup() {
  const [form, setForm] = useState({
    ZABBIX_URL: '',
    ZABBIX_USER: '',
    ZABBIX_PASSWORD: '',
    MAP_TILES_KEY: ''
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  async function saveAndApply() {
    setBusy(true); setMsg(null);
    try {
      // 1) salva
      const items = Object.entries(form)
        .filter(([, v]) => v && v.trim().length > 0)
        .map(([key, value]) => ({ key, value }));

      const r1 = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      if (!r1.ok) throw new Error('Falha ao salvar configurações');
      const j1 = (await r1.json()) as SaveResp;

      // 2) aplica
      const r2 = await fetch('/api/settings/apply', { method: 'POST' });
      if (!r2.ok) throw new Error('Falha ao aplicar configurações');

      setMsg(`Configurações salvas: ${j1.saved.join(', ')}. Aplicadas com sucesso.`);
    } catch (e: any) {
      setMsg(e.message || 'Erro inesperado');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Setup do MapsProve</h1>

      <div className="space-y-3">
        <label className="block">
          <span className="text-sm">ZABBIX_URL</span>
          <input name="ZABBIX_URL" value={form.ZABBIX_URL} onChange={onChange}
                 className="w-full border rounded p-2" placeholder="https://zabbix.local/api_jsonrpc.php" />
        </label>
        <label className="block">
          <span className="text-sm">ZABBIX_USER</span>
          <input name="ZABBIX_USER" value={form.ZABBIX_USER} onChange={onChange}
                 className="w-full border rounded p-2" placeholder="admin" />
        </label>
        <label className="block">
          <span className="text-sm">ZABBIX_PASSWORD</span>
          <input name="ZABBIX_PASSWORD" type="password" value={form.ZABBIX_PASSWORD} onChange={onChange}
                 className="w-full border rounded p-2" placeholder="••••••••" />
        </label>
        <label className="block">
          <span className="text-sm">MAP_TILES_KEY</span>
          <input name="MAP_TILES_KEY" value={form.MAP_TILES_KEY} onChange={onChange}
                 className="w-full border rounded p-2" placeholder="chave de tiles (MapTiler/Mapbox)" />
        </label>
      </div>

      <button disabled={busy} onClick={saveAndApply}
              className="mt-5 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
        {busy ? 'Aplicando…' : 'Salvar & Aplicar'}
      </button>

      {msg && <p className="mt-4 text-sm">{msg}</p>}
    </div>
  );
}
