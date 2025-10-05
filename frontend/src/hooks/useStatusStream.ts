// frontend/src/hooks/useStatusStream.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TopologyLink, TopologyNode } from '@/store/topology';

/** =========================
 *  Tipos públicos
 *  ========================= */

export type AlertLevel = 'critical' | 'warn' | 'info';

export type TopologyPayload = {
  version?: string | number;
  nodeArray: TopologyNode[];
  linkArray: TopologyLink[];
};

export type MetricsPayload = {
  host: string;
  cpu?: number; // 0..100
  mem?: number; // 0..100
  disks?: Array<{ name?: string; usage?: number }>;
  ts?: number | string;
  [k: string]: unknown;
};

export type AlertEvent = {
  id: string;
  level: AlertLevel;
  message: string;
  createdAt: number; // epoch ms
  host?: string;
  meta?: Record<string, unknown>;
};

export type StreamEvent =
  | { type: 'topology'; data: TopologyPayload }
  | { type: 'metrics'; data: MetricsPayload }
  | { type: 'alert'; data: AlertEvent }
  | { type: 'ping'; data?: unknown }
  | { type: 'hello'; data?: unknown }
  | { type: 'unknown'; raw: unknown };

export type TransportKind = 'ws' | 'sse' | 'poll' | 'none';

export type UseStatusStreamOptions = {
  /** Endpoints de conexão. Ex.: ['wss://.../events', '/api/stream'] */
  urls?: string[];
  /** 'auto' tenta ws -> sse -> poll */
  protocol?: 'auto' | 'ws' | 'sse' | 'poll';
  /** Token (string ou função async) para Authorization: Bearer */
  token?: string | (() => string | Promise<string>);
  /** Envia credenciais (cookies) em SSE/poll */
  withCredentials?: boolean;

  /** Reconexão automática */
  reconnect?: boolean;
  /** [minMs, maxMs] para backoff exponencial com jitter */
  reconnectBackoffMs?: [number, number];
  /** Limite máximo de tentativas (por URL) */
  maxRetries?: number;

  /** Callbacks de alto nível */
  onTopology?: (t: TopologyPayload) => void;
  onMetrics?: (m: MetricsPayload) => void;
  onAlert?: (a: AlertEvent) => void;
  onAny?: (e: StreamEvent) => void;

  /** Mantém conexão ativa mesmo sem listeners */
  persistent?: boolean;

  /** Polling (fallback) – usado quando protocol='poll' ou como último recurso */
  pollIntervalMs?: number;
  /** URL de polling para snapshot/long-poll; se não informado tenta a 1ª URL com sufixo '/poll' */
  pollUrl?: string;

  /** Filtros opcionais */
  filter?: {
    alerts?: (a: AlertEvent) => boolean;
  };
};

export type StreamError = {
  type: 'auth' | 'network' | 'protocol' | 'server' | 'unknown';
  message: string;
  timestamp: number;
  retryable: boolean;
};

export type UseStatusStreamState = {
  connected: boolean;
  status: 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'paused';
  transport: TransportKind;
  lastError?: Error;
  lastErrorInfo?: StreamError;
  stats: {
    startedAt: number;
    lastEventAt?: number;
    messages: number;
    reconnects: number;
    retries: number;
  };
  /** Controle imperativo */
  pause: () => void;
  resume: () => void;
  close: () => void;

  /** Conveniências para alertas */
  alerts: AlertEvent[];
  criticalAlerts: AlertEvent[];
  clearAlerts: () => void;

  /** Health check on-demand */
  healthCheck: () => Promise<boolean>;
};

/** =========================
 *  Defaults/constantes
 *  ========================= */

const DEFAULTS: Required<
  Pick<
    UseStatusStreamOptions,
    | 'protocol'
    | 'reconnect'
    | 'reconnectBackoffMs'
    | 'maxRetries'
    | 'pollIntervalMs'
    | 'withCredentials'
  >
> = {
  protocol: 'auto',
  reconnect: true,
  reconnectBackoffMs: [750, 15_000],
  maxRetries: 12,
  pollIntervalMs: 5_000,
  withCredentials: false,
};

const ENV_DEFAULTS = getDefaultConfig();

const TEXT_DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder() : undefined;

const STORAGE_KEYS = {
  ALERTS: 'stream-alerts-cache',
  TOPOLOGY: 'stream-topology-cache',
};

/** =========================
 *  Utilitários internos
 *  ========================= */

function getDefaultConfig(): Partial<UseStatusStreamOptions> {
  const dev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
  return {
    reconnectBackoffMs: dev ? [1_000, 5_000] : [2_000, 30_000],
    maxRetries: dev ? 3 : 12,
  };
}

function isWebSocketUrl(url: string) {
  return url.startsWith('ws://') || url.startsWith('wss://');
}

function toSseUrl(url: string) {
  if (isWebSocketUrl(url)) {
    // Converte ws(s)://host/path -> http(s)://host/path
    return url.replace(/^ws/i, 'http');
  }
  return url;
}

function jitter(ms: number) {
  // jitter ~ +/- 30%
  const delta = ms * 0.3 * (Math.random() * 2 - 1);
  return Math.max(250, Math.floor(ms + delta));
}

function expBackoff(attempt: number, [min, max]: [number, number]) {
  const base = Math.min(max, min * Math.pow(2, attempt));
  return jitter(base);
}

function parseJsonSafe(raw: unknown): any {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function normalizeAlert(a: Partial<AlertEvent> & Record<string, any>): AlertEvent {
  const level: AlertLevel =
    (a.level as AlertLevel) ||
    (a.severity === 'critical' ? 'critical' : a.severity === 'warn' ? 'warn' : 'info');

  const id =
    a.id ||
    a.uuid ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}-${(a.message || 'alert').slice(0, 24)}`;

  const createdAt =
    typeof a.createdAt === 'number'
      ? a.createdAt
      : typeof a.ts === 'number'
      ? a.ts
      : Date.now();

  return {
    id,
    level,
    message: String(a.message ?? a.msg ?? 'Alerta'),
    createdAt,
    host: a.host,
    meta: a.meta ?? a.data ?? {},
  };
}

function coerceStreamEvent(raw: any): StreamEvent {
  const msg = parseJsonSafe(raw);

  // Se já tiver type
  if (msg?.type && typeof msg.type === 'string') {
    const t = msg.type as StreamEvent['type'];
    if (t === 'topology') return { type: 'topology', data: msg.data as TopologyPayload };
    if (t === 'metrics') return { type: 'metrics', data: msg.data as MetricsPayload };
    if (t === 'alert') return { type: 'alert', data: normalizeAlert(msg.data) };
    if (t === 'ping' || t === 'hello') return { type: t, data: msg.data };
  }

  // Inferir pelo shape
  if (msg?.nodeArray && msg?.linkArray) {
    return { type: 'topology', data: msg as TopologyPayload };
  }
  if (msg?.host || msg?.cpu || msg?.mem || msg?.disks) {
    return { type: 'metrics', data: msg as MetricsPayload };
  }
  if (msg?.message && (msg?.level || msg?.severity)) {
    return { type: 'alert', data: normalizeAlert(msg) };
  }
  if (msg === 'ping' || msg?.event === 'ping') {
    return { type: 'ping', data: msg };
  }

  return { type: 'unknown', raw: msg };
}

async function resolveToken(tokenOpt: UseStatusStreamOptions['token']): Promise<string | undefined> {
  if (!tokenOpt) return undefined;
  try {
    return typeof tokenOpt === 'function' ? await tokenOpt() : tokenOpt;
  } catch {
    return undefined;
  }
}

function classifyError(error: unknown, statusCode?: number): StreamError {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  const timestamp = Date.now();

  if (typeof statusCode === 'number') {
    if (statusCode === 401 || statusCode === 403) {
      return { type: 'auth', message, timestamp, retryable: false };
    }
    if (statusCode >= 500) {
      return { type: 'server', message, timestamp, retryable: true };
    }
    if (statusCode >= 400) {
      return { type: 'protocol', message, timestamp, retryable: false };
    }
  }

  const msgLower = message.toLowerCase();
  if (msgLower.includes('network') || msgLower.includes('failed') || msgLower.includes('timeout')) {
    return { type: 'network', message, timestamp, retryable: true };
  }
  if (msgLower.includes('parse') || msgLower.includes('json')) {
    return { type: 'protocol', message, timestamp, retryable: false };
  }

  return { type: 'unknown', message, timestamp, retryable: true };
}

/** Debounce util com cancel/flush */
function debounce<T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
  { maxWait }: { maxWait?: number } = {}
) {
  let timeoutId: number | null = null;
  let startTime = 0;
  let lastArgs: any[] | null = null;

  const invoke = () => {
    timeoutId = null;
    startTime = 0;
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  const debounced = (...args: any[]) => {
    lastArgs = args;
    const now = Date.now();

    if (!startTime) startTime = now;

    if (timeoutId) window.clearTimeout(timeoutId);

    const timeSinceStart = now - startTime;
    if (maxWait && timeSinceStart >= maxWait) {
      invoke();
    } else {
      timeoutId = window.setTimeout(invoke, wait) as unknown as number;
    }
  };

  (debounced as any).cancel = () => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    startTime = 0;
    lastArgs = null;
  };

  (debounced as any).flush = () => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      invoke();
    }
  };

  return debounced as T & { cancel: () => void; flush: () => void };
}

/** Logger condicional (apenas dev) */
function useStreamLogger(enabled: boolean) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCallback(
    (message: string, data?: any) => {
      const dev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
      if (enabled && dev) {
        // eslint-disable-next-line no-console
        console.log(`[Stream] ${message}`, data ?? '');
      }
    },
    [enabled]
  );
}

/** =========================
 *  Hook principal
 *  ========================= */

export function useStatusStream(options: UseStatusStreamOptions = {}): UseStatusStreamState {
  const {
    urls = ['/api/stream'],
    protocol = (ENV_DEFAULTS.protocol as UseStatusStreamOptions['protocol']) ?? DEFAULTS.protocol,
    token,
    reconnect = ENV_DEFAULTS.reconnect ?? DEFAULTS.reconnect,
    reconnectBackoffMs = (ENV_DEFAULTS.reconnectBackoffMs as [number, number]) ?? DEFAULTS.reconnectBackoffMs,
    maxRetries = ENV_DEFAULTS.maxRetries ?? DEFAULTS.maxRetries,
    pollIntervalMs = ENV_DEFAULTS.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
    pollUrl,
    withCredentials = ENV_DEFAULTS.withCredentials ?? DEFAULTS.withCredentials,
    onTopology,
    onMetrics,
    onAlert,
    onAny,
    persistent,
    filter,
  } = options;

  const [status, setStatus] = useState<UseStatusStreamState['status']>('idle');
  const [transport, setTransport] = useState<TransportKind>('none');
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<Error | undefined>(undefined);
  const [lastErrorInfo, setLastErrorInfo] = useState<StreamError | undefined>(undefined);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  const logger = useStreamLogger(true);

  const startedAtRef = useRef<number>(Date.now());
  const lastEventAtRef = useRef<number | undefined>(undefined);
  const messagesRef = useRef<number>(0);
  const reconnectsRef = useRef<number>(0);
  const retriesRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef<boolean>(false);
  const urlIndexRef = useRef<number>(0);
  const pollTimerRef = useRef<number | null>(null);
  const currentWsRef = useRef<WebSocket | null>(null);
  const currentSseRef = useRef<EventSource | null>(null);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEYS.ALERTS);
      } catch {}
    }
  }, []);

  const criticalAlerts = useMemo(() => alerts.filter((a) => a.level === 'critical'), [alerts]);

  // Persistir/recuperar alerts (cache offline)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // bootstrap inicial
      const cached = localStorage.getItem(STORAGE_KEYS.ALERTS);
      if (cached && !alerts.length) {
        setAlerts(JSON.parse(cached));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salvar cache on-change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(alerts.slice(0, 200)));
    } catch {}
  }, [alerts]);

  // Recuperar cache em caso de erro/desconexão
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!connected && status === 'error') {
      try {
        const cached = localStorage.getItem(STORAGE_KEYS.ALERTS);
        if (cached) setAlerts(JSON.parse(cached));
      } catch {}
    }
  }, [connected, status]);

  const applyAlert = useCallback(
    (a: AlertEvent) => {
      if (filter?.alerts && !filter.alerts(a)) return;
      setAlerts((prev) => {
        const next = [a, ...prev].slice(0, 200);
        return next;
      });
    },
    [filter]
  );

  const updateStatsOnEvent = useCallback(() => {
    messagesRef.current += 1;
    lastEventAtRef.current = Date.now();
  }, []);

  const handleEvent = useCallback(
    (evt: StreamEvent) => {
      updateStatsOnEvent();
      onAny?.(evt);

      switch (evt.type) {
        case 'topology':
          // cache rápido de topology (para uso futuro/offline)
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(STORAGE_KEYS.TOPOLOGY, JSON.stringify(evt.data));
            } catch {}
          }
          onTopology?.(evt.data);
          break;
        case 'metrics':
          onMetrics?.(evt.data);
          break;
        case 'alert':
          onAlert?.(evt.data);
          applyAlert(evt.data);
          break;
        default:
          break;
      }
    },
    [onAny, onTopology, onMetrics, onAlert, applyAlert, updateStatsOnEvent]
  );

  // Debounce/Throttling para bursts de mensagens
  const debouncedHandleEvent = useMemo(
    () => debounce(handleEvent, 100, { maxWait: 1000 }),
    [handleEvent]
  );

  const closeConnections = useCallback(() => {
    // WS
    try {
      currentWsRef.current?.close();
    } catch {}
    currentWsRef.current = null;

    // SSE
    try {
      currentSseRef.current?.close?.();
    } catch {}
    currentSseRef.current = null;

    // Polling
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    // Abort
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const moveToNextUrl = useCallback(() => {
    urlIndexRef.current = (urlIndexRef.current + 1) % urls.length;
  }, [urls.length]);

  // WebSocket
  const connectViaWS = useCallback(
    async (rawUrl: string) => {
      const authToken = await resolveToken(token);
      const url = rawUrl;
      const ws = new WebSocket(url, authToken ? [] : undefined);
      currentWsRef.current = ws;

      setTransport('ws');
      setStatus('connecting');
      logger('WS connecting', url);

      ws.onopen = () => {
        setConnected(true);
        setStatus('open');
        setLastError(undefined);
        setLastErrorInfo(undefined);
        retriesRef.current = 0;
        logger('WS open');
      };

      ws.onmessage = (ev) => {
        const data =
          typeof ev.data === 'string'
            ? ev.data
            : ev.data instanceof Blob && TEXT_DECODER
            ? TEXT_DECODER.decode(ev.data as BlobPart as ArrayBuffer)
            : ev.data;
        debouncedHandleEvent(coerceStreamEvent(data));
      };

      ws.onerror = () => {
        const info = classifyError(new Error('WebSocket error'));
        setLastError(new Error(info.message));
        setLastErrorInfo(info);
        logger('WS error', info);
      };

      ws.onclose = () => {
        setConnected(false);
        setStatus(pausedRef.current ? 'paused' : 'closed');
        logger('WS closed');

        if (!pausedRef.current && reconnect) {
          const attempt = retriesRef.current++;
          const delay = expBackoff(attempt, reconnectBackoffMs);
          reconnectsRef.current += 1;
          logger('WS reconnect in', delay);

          window.setTimeout(() => {
            moveToNextUrl();
            start(); // tenta novamente com próximo transport/url
          }, delay);
        }
      };
    },
    [debouncedHandleEvent, token, reconnect, reconnectBackoffMs, moveToNextUrl, logger]
  );

  // SSE
  const connectViaSSE = useCallback(
    async (rawUrl: string) => {
      const url = toSseUrl(rawUrl);
      const authToken = await resolveToken(token);

      setTransport('sse');
      setStatus('connecting');
      logger('SSE connecting', url);

      // EventSource não suporta custom headers em todos ambientes;
      // estratégia: se precisar de Authorization, depende do servidor aceitar via query.
      const queryToken = authToken ? (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(authToken) : '';
      const es = new EventSource(url + queryToken, { withCredentials });
      currentSseRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setStatus('open');
        setLastError(undefined);
        setLastErrorInfo(undefined);
        retriesRef.current = 0;
        logger('SSE open');
      };

      es.onerror = () => {
        setConnected(false);
        setStatus(pausedRef.current ? 'paused' : 'closed');
        const info = classifyError(new Error('SSE error'));
        setLastError(new Error(info.message));
        setLastErrorInfo(info);
        logger('SSE error', info);
        es.close();

        if (!pausedRef.current && reconnect) {
          const attempt = retriesRef.current++;
          const delay = expBackoff(attempt, reconnectBackoffMs);
          reconnectsRef.current += 1;
          logger('SSE reconnect in', delay);

          window.setTimeout(() => {
            moveToNextUrl();
            start();
          }, delay);
        }
      };

      const handleMsg = (payload: any) => debouncedHandleEvent(coerceStreamEvent(payload));

      es.addEventListener('message', (e: MessageEvent) => handleMsg((e as any).data));
      es.addEventListener('topology', (e: MessageEvent) => handleMsg((e as any).data));
      es.addEventListener('metrics', (e: MessageEvent) => handleMsg((e as any).data));
      es.addEventListener('alert', (e: MessageEvent) => handleMsg((e as any).data));
      es.addEventListener('ping', (e: MessageEvent) => handleMsg((e as any).data));
      es.addEventListener('hello', (e: MessageEvent) => handleMsg((e as any).data));
    },
    [debouncedHandleEvent, reconnect, reconnectBackoffMs, moveToNextUrl, token, withCredentials, logger]
  );

  // Polling (fallback/snapshot)
  const connectViaPoll = useCallback(
    async (rawUrl: string) => {
      const url = pollUrl || `${toSseUrl(rawUrl).replace(/\/$/, '')}/poll`;
      const authToken = await resolveToken(token);

      setTransport('poll');
      setStatus('connecting');
      setConnected(true); // polling "ativo"
      logger('POLL start', url);

      const doPoll = async () => {
        try {
          const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
          const res = await fetch(url, { credentials: withCredentials ? 'include' : 'same-origin', headers });
          if (!res.ok) throw Object.assign(new Error(`Polling failed: ${res.status}`), { status: res.status });
          const text = await res.text();

          // Aceita NDJSON ou JSON array/obj
          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            for (const ln of lines) debouncedHandleEvent(coerceStreamEvent(ln));
          } else {
            const payload = parseJsonSafe(text);
            if (Array.isArray(payload)) {
              payload.forEach((p) => debouncedHandleEvent(coerceStreamEvent(p)));
            } else {
              debouncedHandleEvent(coerceStreamEvent(payload));
            }
          }

          setStatus('open');
          setLastError(undefined);
          setLastErrorInfo(undefined);
          retriesRef.current = 0;
        } catch (err: any) {
          const code = typeof err?.status === 'number' ? err.status : undefined;
          const info = classifyError(err, code);
          setLastError(err instanceof Error ? err : new Error(String(err)));
          setLastErrorInfo(info);
          setStatus('error');
          logger('POLL error', info);

          if (!info.retryable) {
            // para polling se não for recuperável
            if (pollTimerRef.current) {
              window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
          }
        }
      };

      // primeira chamada imediata
      void doPoll();

      // agendamento
      pollTimerRef.current = window.setInterval(doPoll, pollIntervalMs) as unknown as number;
    },
    [debouncedHandleEvent, pollUrl, pollIntervalMs, token, withCredentials, logger]
  );

  const start = useCallback(async () => {
    if (pausedRef.current) return;
    if (retriesRef.current > (maxRetries ?? 0)) {
      setStatus('error');
      setConnected(false);
      logger('Max retries reached');
      return;
    }

    const url = urls[urlIndexRef.current] ?? urls[0];
    try {
      if (protocol === 'ws' || (protocol === 'auto' && isWebSocketUrl(url))) {
        await connectViaWS(url);
      } else if (protocol === 'sse' || protocol === 'auto') {
        await connectViaSSE(url);
      } else if (protocol === 'poll') {
        await connectViaPoll(url);
      } else {
        if (isWebSocketUrl(url)) {
          await connectViaWS(url);
        } else {
          await connectViaSSE(url);
        }
      }
    } catch (err: any) {
      const info = classifyError(err);
      setLastError(err instanceof Error ? err : new Error(String(err)));
      setLastErrorInfo(info);
      setStatus('error');
      logger('Start connection error', info);

      // fallback se auto
      if (protocol === 'auto') {
        try {
          await connectViaSSE(url);
        } catch {
          await connectViaPoll(url);
        }
      }
    }
  }, [urls, protocol, connectViaWS, connectViaSSE, connectViaPoll, maxRetries, logger]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setStatus('paused');
    setConnected(false);
    closeConnections();
    logger('Paused');
  }, [closeConnections, logger]);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    retriesRef.current = 0;
    setLastError(undefined);
    setLastErrorInfo(undefined);
    setStatus('connecting');
    logger('Resuming…');
    start();
  }, [start, logger]);

  const close = useCallback(() => {
    pausedRef.current = true;
    closeConnections();
    setConnected(false);
    setStatus('closed');
    logger('Closed');
  }, [closeConnections, logger]);

  // Health check robusto
  const healthCheck = useCallback(async (): Promise<boolean> => {
    if (!connected) return false;

    // Preferir AbortSignal.timeout se disponível
    const timeoutMs = 5_000;
    try {
      if (typeof (AbortSignal as any)?.timeout === 'function') {
        const res = await fetch('/api/health', { signal: (AbortSignal as any).timeout(timeoutMs) });
        return res.ok;
      }
      // Fallback manual
      const ctrl = new AbortController();
      const to = window.setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch('/api/health', { signal: ctrl.signal });
        return res.ok;
      } finally {
        window.clearTimeout(to);
      }
    } catch {
      return false;
    }
  }, [connected]);

  // Lifecycle principal
  useEffect(() => {
    if (!(persistent || onTopology || onMetrics || onAlert || onAny)) {
      // Nenhum listener e não persistente: não conecta
      setStatus('idle');
      setConnected(false);
      setTransport('none');
      return;
    }

    // inicia
    startedAtRef.current = Date.now();
    setStatus('connecting');
    setConnected(false);
    setLastError(undefined);
    setLastErrorInfo(undefined);
    messagesRef.current = 0;
    reconnectsRef.current = 0;
    retriesRef.current = 0;
    pausedRef.current = false;
    debouncedHandleEvent.flush?.();
    void start();

    return () => {
      // cleanup
      (debouncedHandleEvent as any).cancel?.();
      closeConnections();
      setConnected(false);
      setStatus('closed');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // mudanças relevantes que exigem reconexão
    JSON.stringify(urls),
    protocol,
    pollUrl,
    pollIntervalMs,
    withCredentials,
    Boolean(persistent),
  ]);

  const state = useMemo<UseStatusStreamState>(
    () => ({
      connected,
      status,
      transport,
      lastError,
      lastErrorInfo,
      stats: {
        startedAt: startedAtRef.current,
        lastEventAt: lastEventAtRef.current,
        messages: messagesRef.current,
        reconnects: reconnectsRef.current,
        retries: retriesRef.current,
      },
      pause,
      resume,
      close,
      alerts,
      criticalAlerts,
      clearAlerts,
      healthCheck,
    }),
    [
      connected,
      status,
      transport,
      lastError,
      lastErrorInfo,
      pause,
      resume,
      close,
      alerts,
      criticalAlerts,
      clearAlerts,
      healthCheck,
    ]
  );

  return state;
}

/** =========================
 *  Hook auxiliar – apenas alertas
 *  ========================= */

export function useAlertsStream(
  options: Omit<UseStatusStreamOptions, 'onTopology' | 'onMetrics' | 'onAny'> = {}
) {
  const stream = useStatusStream({
    persistent: true,
    ...options,
  });

  return {
    connected: stream.connected,
    status: stream.status,
    alerts: stream.alerts,
    criticalAlerts: stream.criticalAlerts,
    clearAlerts: stream.clearAlerts,
  };
}

/** =========================
 *  Hook especializado para métricas
 *  ========================= */

export function useMetricsStream(hosts?: string[]) {
  const [metrics, setMetrics] = useState<Map<string, MetricsPayload>>(new Map());

  const stream = useStatusStream({
    persistent: true,
    onMetrics: (metric) => {
      if (!metric?.host) return;
      if (!hosts || hosts.includes(metric.host)) {
        setMetrics((prev) => {
          const next = new Map(prev);
          next.set(metric.host, metric);
          return next;
        });
      }
    },
  });

  const getHostMetrics = useCallback((host: string) => metrics.get(host), [metrics]);

  return {
    ...stream,
    metrics,
    getHostMetrics,
  };
}

/** =========================
 *  Fallback leve para ambientes sem window (SSR)
 *  ========================= */

export function useStatusStreamNoop(): UseStatusStreamState {
  const noop = () => void 0;
  return {
    connected: false,
    status: 'idle',
    transport: 'none',
    stats: {
      startedAt: Date.now(),
      lastEventAt: undefined,
      messages: 0,
      reconnects: 0,
      retries: 0,
    },
    pause: noop,
    resume: noop,
    close: noop,
    alerts: [],
    criticalAlerts: [],
    clearAlerts: noop,
    lastError: undefined,
    lastErrorInfo: undefined,
    healthCheck: async () => false,
  };
}

/** =========================
 *  Exemplos de uso (comentados)
 *  ========================= */
/*
import { useAlertsStream } from '@/hooks/useStatusStream';

export function AlertsPanel() {
  const { alerts, criticalAlerts, connected, status, clearAlerts } = useAlertsStream({
    urls: ['/api/alerts/stream'],
    filter: { alerts: (a) => a.level !== 'info' },
    onAlert: (a) => {
      if (Notification.permission === 'granted' && a.level === 'critical') {
        new Notification('Critical Alert', { body: a.message, icon: '/alert-icon.png' });
      }
    },
  });

  return (
    <div>
      <div>
        <h3>Alerts ({alerts.length})</h3>
        <button onClick={clearAlerts} disabled={!alerts.length}>Clear</button>
        <span>{connected ? 'connected' : status}</span>
        <div>Critical: {criticalAlerts.length}</div>
      </div>
      <ul>
        {alerts.map((a) => <li key={a.id}>{a.level.toUpperCase()} — {a.message}</li>)}
      </ul>
    </div>
  );
}
*/
