import { useState } from 'react';
import { useAuth } from '../store/auth';

export default function Login() {
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState('admin@mapsprove.local');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email, password })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Falha no login');
      setAuth(j.token, j.user);
      setMsg('Autenticado!');
      // redirecionar para /setup
      window.location.href = '/setup';
    } catch (e:any) {
      setMsg(e.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-sm mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">Login (admin)</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="w-full border p-2 rounded" placeholder="email"
               value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full border p-2 rounded" type="password" placeholder="senha"
               value={password} onChange={e=>setPassword(e.target.value)} />
        <button disabled={busy}
                className="w-full bg-blue-600 text-white rounded p-2">
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </div>
  );
}
