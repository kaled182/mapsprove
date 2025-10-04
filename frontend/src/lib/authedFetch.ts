// frontend/src/lib/authedFetch.ts
// --------------------------------------------------
// 🔐 authedFetch (v1.2)
// - Token automático (Bearer <token>)
// - Base URL via VITE_API_BASE_URL
// - Timeout com AbortController
// - Retry com backoff (métodos idempotentes por padrão)
// - Cache de respostas GET (com TTL)
// - Parse inteligente de JSON / texto
// - Hooks para 401/403 e logging leve
// --------------------------------------------------

type TokenGetter = () => string | null;

export type AuthedFetchError = Error & {
  code?: 'ETIMEDOUT' | 'ENETWORK';
  status?: number;
  url?: string;
  body?: unknown;
};

export type AuthedFetchOptions = RequestInit & {
  auth?: boolean;               // default: true
  timeoutMs?: number;           // default: 15000
  json?: unknown;               // se passado, body = JSON.stringify
  parseJson?: boolean;          // default: true
  onUnauthorized?: () => void;  // callback para 401/403
  maxRetries?: number;          // default: 0
  retryDelay?: number;          // default: 1000 (ms)
  cacheMs?: number;             // cache TTL para GET (ms)
};

let getToken: TokenGetter = () => {
  try { return localStorage.getItem('token'); } catch { return null; }
};

export function setTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

// ---------- Config ----------
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL ??
  (typeof process !== 'undefined' ? (process as any).env?.VITE_API_BASE_URL : '') ??
  '';

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_RETRY_DELAY = 1_000;

// ---------- Cache (em memória) ----------
type CacheEntry = { data: any; timestamp: number; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();

// ---------- Helpers ----------
function buildUrl(input: string): string {
  if (!input) return API_BASE || '';
  return input.startsWith('http') ? input : `${API_BASE}${input}`;
}

function getContentType(h: Headers): string {
  return (h.get('Content-Type') || '').toLowerCase();
}

function shouldParseJson(contentType: string, parseJsonFlag: boolean | undefined) {
  if (parseJsonFlag === false) return false;
  return contentType.includes('application/json') || contentType.includes('application/vnd.api+json');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isIdempotent(method: string) {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

function cacheKeyFor(url: string, options: AuthedFetchOptions) {
  // Para evitar incluir sinal/headers não-serializáveis, selecionamos campos seguros
  const keyObj = {
    url,
    method: options.method ?? 'GET',
    headers: Array.from(new Headers(options.headers || {})).sort(),
  };
  return JSON.stringify(keyObj);
}

// ---------- Logging leve (silencioso em prod) ----------
const DEBUG = (import.meta as any).env?.MODE === 'development' || (import.meta as any).env?.DEV;

function logRequest(method: string, url: string, options: AuthedFetchOptions) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.debug(`[authedFetch] → ${method} ${url}`, {
    timeoutMs: options.timeoutMs,
    retry: options.maxRetries,
    cacheMs: options.cacheMs,
  });
}

function logResponse(method: string, url: string, res: Response, ms: number) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.debug(`[authedFetch] ← ${method} ${url} ${res.status} (${ms}ms)`);
}

// ---------- Retry ----------
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number,
  baseDelay: number,
) {
  const method = (init.method || 'GET').toUpperCase();
  const allowRetry = isIdempotent(method);
  let attempt = 0;
  let lastErr: any;

  while (true) {
    try {
      return await fetch(url, init);
    } catch (err: any) {
      lastErr = err;
      if (!allowRetry || attempt >= maxRetries) throw err;
      // backoff exponencial com jitter
      const delay = Math.round(baseDelay * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4));
      await sleep(delay);
      attempt += 1;
    }
  }
}

// ---------- Implementação principal ----------
export async function authedFetch(
  input: string,
  options: AuthedFetchOptions = {}
) {
  const startTime = Date.now();

  const {
    auth = true,
    timeoutMs = DEFAULT_TIMEOUT,
    json,
    parseJson = true,
    onUnauthorized,
    headers,
    maxRetries = 0,
    retryDelay = DEFAULT_RETRY_DELAY,
    cacheMs,
    ...rest
  } = options as AuthedFetchOptions;

  const method = (rest.method || 'GET').toUpperCase();
  const url = buildUrl(input);

  logRequest(method, url, options);

  // Cache (somente GET)
  if (method === 'GET' && cacheMs) {
    const key = cacheKeyFor(url, options);
    const cached = responseCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
  }

  // Timeout com AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Headers
  const headersObj = new Headers(headers);
  if (auth) {
    const token = getToken();
    if (token && !headersObj.has('Authorization')) {
      headersObj.set('Authorization', `Bearer ${token}`);
    }
  }

  // JSON body
  let body = rest.body;
  if (json !== undefined) {
    if (!headersObj.has('Content-Type')) {
      headersObj.set('Content-Type', 'application/json');
    }
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetchWithRetry(
      url,
      { ...rest, method, headers: headersObj, body, signal: controller.signal },
      maxRetries,
      retryDelay
    );
  } catch (error: any) {
    clearTimeout(timeoutId);
    const isAbort = error?.name === 'AbortError';
    const message = isAbort
      ? `Request timeout (${timeoutMs}ms): ${url}`
      : `Network error: ${error?.message || 'unknown error'}`;

    const fetchError: AuthedFetchError = new Error(message);
    fetchError.code = isAbort ? 'ETIMEDOUT' : 'ENETWORK';
    fetchError.url = url;
    throw fetchError;
  } finally {
    clearTimeout(timeoutId);
  }

  const duration = Date.now() - startTime;
  logResponse(method, url, res, duration);

  // Unauthorized handler
  if (res.status === 401 || res.status === 403) {
    try {
      onUnauthorized?.();
      window.dispatchEvent(
        new CustomEvent('auth:unauthorized', { detail: { status: res.status, url } })
      );
    } catch { /* noop */ }
  }

  // Parse body
  const contentType = getContentType(res.headers);
  const parseAsJson = shouldParseJson(contentType, parseJson);

  let payload: any = null;
  if (res.status !== 204 && res.status !== 205) {
    if (parseAsJson) {
      try {
        payload = await res.json();
      } catch {
        const text = await res.text().catch(() => '');
        payload = { raw: text };
      }
    } else {
      payload = await res.text().catch(() => '');
    }
  }

  if (!res.ok) {
    const message =
      (parseAsJson && payload && (payload.error || payload.message)) ||
      `HTTP Error ${res.status} at ${url}`;

    const error: AuthedFetchError = new Error(message);
    error.status = res.status;
    error.url = url;
    error.body = payload;
    throw error;
  }

  // Preenche cache (GET bem-sucedido)
  if (method === 'GET' && cacheMs) {
    const key = cacheKeyFor(url, options);
    responseCache.set(key, {
      data: payload,
      timestamp: Date.now(),
      expiresAt: Date.now() + cacheMs
    });
  }

  return payload;
}

// ---------- Conveniências ----------
export const api = {
  get: <T = any>(path: string, opts: AuthedFetchOptions = {}) =>
    authedFetch(path, { ...opts, method: 'GET' }) as Promise<T>,
  post: <T = any>(path: string, body?: unknown, opts: AuthedFetchOptions = {}) =>
    authedFetch(path, { ...opts, method: 'POST', json: body }) as Promise<T>,
  put: <T = any>(path: string, body?: unknown, opts: AuthedFetchOptions = {}) =>
    authedFetch(path, { ...opts, method: 'PUT', json: body }) as Promise<T>,
  patch: <T = any>(path: string, body?: unknown, opts: AuthedFetchOptions = {}) =>
    authedFetch(path, { ...opts, method: 'PATCH', json: body }) as Promise<T>,
  del: <T = any>(path: string, opts: AuthedFetchOptions = {}) =>
    authedFetch(path, { ...opts, method: 'DELETE' }) as Promise<T>,
};

// ---------- Exemplo de listener global para 401/403 ----------
export function installUnauthorizedRedirect(to: string = '/login') {
  const handler = () => {
    try { localStorage.removeItem('token'); } catch { /* noop */ }
    window.location.href = to;
  };
  window.addEventListener('auth:unauthorized', handler);
  return () => window.removeEventListener('auth:unauthorized', handler);
}
