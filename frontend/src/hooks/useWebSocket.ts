// frontend/src/hooks/useWebSocket.ts
// =======================================================
// 🔌 useWebSocket (v1.1)
// - Tipagem robusta + eventos estendidos
// - Auto-reconexão com backoff + jitter
// - Heartbeat (ping/pong) com onTimeout
// - Auth via token (?token=...)
// - Safe JSON parse/serialize
// - Pausa em offline, retoma em online
// - Buffer de histórico e handlers por tipo de mensagem
// =======================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// -------------------- Tipos --------------------

export type WSStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closing'
  | 'closed'
  | 'error';

export type BackoffConfig = {
  initial: number;
  factor: number;
  max: number;
  jitter?: boolean;
};

export type HeartbeatConfig<TIn = any> = {
  interval: number;
  pingMessage?: TIn;
  pongPredicate?: (incoming: unknown) => boolean;
  timeout?: number;
  onTimeout?: () => void;
};

export type MessageHandler<TOut = any> = (msg: TOut, ev: MessageEvent) => void;

export type UseWebSocketOptions<TIn = any, TOut = any> = {
  path: string;
  protocols?: string[];
  token?: string | null | (() => string | null);
  makeUrl?: (path: string, token?: string | null) => string;

  autoReconnect?: boolean;
  maxRetries?: number; // 0 = ilimitado
  backoff?: BackoffConfig;

  heartbeat?: HeartbeatConfig<TIn>;

  serialize?: (data: TIn) => string | ArrayBufferLike | Blob | ArrayBufferView;
  parse?: (raw: MessageEvent['data']) => TOut;

  // Callbacks
  onOpen?: (ev: Event) => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (ev: Event | Error) => void;
  onMessage?: MessageHandler<TOut>;
  onReconnecting?: (attempt: number) => void;
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;

  // Handlers por tipo (ex.: msg.type)
  messageHandlers?: Record<string, MessageHandler<TOut>>;

  deps?: unknown[];

  // Opções novas
  enabled?: boolean;
  bufferSize?: number;
  reconnectOnError?: boolean;
};

export type UseWebSocketReturn<TIn = any, TOut = any> = {
  status: WSStatus;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  lastMessage: TOut | null;
  messageHistory: TOut[];
  error: Error | null;
  send: (data: TIn) => boolean;
  sendJson: (data: any) => boolean;
  reconnect: () => void;
  disconnect: (code?: number, reason?: string) => void;
  getWebSocket: () => WebSocket | null;
  retryCount: number;
  clearMessageHistory: () => void;
};

// Mensagens padrão
export type WSPingMessage = { type: 'ping'; id?: string; timestamp: number };
export type WSPongMessage = { type: 'pong'; id?: string; timestamp: number };

// -------------------- helpers --------------------

const defaultSerialize = (data: any) => JSON.stringify(data);
const defaultParse = (raw: any) => {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw as any;
    }
  }
  return raw as any;
};

function getTokenValue(tokenOpt?: string | null | (() => string | null)): string | null {
  try {
    if (typeof tokenOpt === 'function') return tokenOpt();
    if (typeof tokenOpt === 'string') return tokenOpt || null;
    return (
      localStorage.getItem('token') ||
      sessionStorage.getItem('token') ||
      null
    );
  } catch {
    return null;
  }
}

function defaultMakeUrl(path: string, token?: string | null) {
  if (/^wss?:\/\//i.test(path)) {
    const url = new URL(path);
    if (token) {
      url.searchParams.set('token', token);
      url.searchParams.set('_t', Date.now().toString());
    }
    return url.toString();
  }
  const isSecure = window.location.protocol === 'https:';
  const proto = isSecure ? 'wss' : 'ws';
  const host = window.location.host;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${proto}://${host}${cleanPath}`);
  if (token) {
    url.searchParams.set('token', token);
    url.searchParams.set('_t', Date.now().toString());
  }
  return url.toString();
}

function nextDelay(attempt: number, cfg: BackoffConfig): number {
  const base = Math.min(cfg.initial * Math.pow(cfg.factor, attempt), cfg.max);
  if (!cfg.jitter) return base;
  const jitter = 0.7 + Math.random() * 0.6; // 0.7–1.3x
  return Math.floor(base * jitter);
}

function isValidWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

function safeSerialize<TIn>(
  data: TIn,
  serialize: (data: TIn) => string | ArrayBufferLike | Blob | ArrayBufferView
): string | ArrayBufferLike | Blob | ArrayBufferView {
  try {
    return serialize(data);
  } catch (error) {
    // fallback
    if (typeof data === 'object') {
      return JSON.stringify(data);
    }
    return String(data);
  }
}

// -------------------- hook principal --------------------

export function useWebSocket<TIn = any, TOut = any>(
  opts: UseWebSocketOptions<TIn, TOut>
): UseWebSocketReturn<TIn, TOut> {
  const {
    path,
    protocols,
    token,
    makeUrl = defaultMakeUrl,
    autoReconnect = true,
    maxRetries = 0,
    backoff = { initial: 500, factor: 1.8, max: 15000, jitter: true },
    heartbeat,
    serialize = defaultSerialize,
    parse = defaultParse,
    onOpen,
    onClose,
    onError,
    onMessage,
    onReconnecting,
    onConnected,
    onDisconnected,
    messageHandlers = {},
    deps = [],
    enabled = true,
    bufferSize = 50,
    reconnectOnError = true,
  } = opts;

  const [status, setStatus] = useState<WSStatus>('idle');
  const [lastMessage, setLastMessage] = useState<TOut | null>(null);
  const [messageHistory, setMessageHistory] = useState<TOut[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const triesRef = useRef(0);
  const closingRef = useRef(false);
  const hbTimerRef = useRef<number | null>(null);
  const hbGuardRef = useRef<number | null>(null);
  const lastPongRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const url = useMemo(() => {
    if (!enabled) return null;
    const t = getTokenValue(token);
    const finalUrl = makeUrl(path, t);
    if (!isValidWebSocketUrl(finalUrl)) {
      console.warn('Invalid WebSocket URL:', finalUrl);
      return null;
    }
    return finalUrl;
  }, [path, token, makeUrl, enabled, ...deps]);

  const clearHeartbeat = useCallback(() => {
    if (hbTimerRef.current) {
      window.clearInterval(hbTimerRef.current);
      hbTimerRef.current = null;
    }
    if (hbGuardRef.current) {
      window.clearTimeout(hbGuardRef.current);
      hbGuardRef.current = null;
    }
  }, []);

  const cleanup = useCallback(
    (final = false) => {
      clearHeartbeat();
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        try {
          if (!final) {
            wsRef.current.onopen = null;
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.onmessage = null;
          }
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close(1000, 'Manual disconnect');
          }
        } catch {
          // noop
        }
        wsRef.current = null;
      }
    },
    [clearHeartbeat]
  );

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    if (!heartbeat || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const interval = Math.max(heartbeat.interval, 1000);
    const timeout = heartbeat.timeout ?? interval * 2;

    lastPongRef.current = Date.now();

    hbTimerRef.current = window.setInterval(() => {
      try {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const pingMsg =
          heartbeat.pingMessage ?? ({ type: 'ping', id: `ping-${Date.now()}`, timestamp: Date.now() } as WSPingMessage);

        wsRef.current.send(safeSerialize(pingMsg, serialize));

        if (hbGuardRef.current) window.clearTimeout(hbGuardRef.current);
        hbGuardRef.current = window.setTimeout(() => {
          const since = Date.now() - lastPongRef.current;
          if (since > timeout && wsRef.current) {
            heartbeat.onTimeout?.();
            try {
              wsRef.current.close(4000, 'heartbeat-timeout');
            } catch {
              /* noop */
            }
          }
        }, timeout);
      } catch (err) {
        console.error('Heartbeat error:', err);
      }
    }, interval);
  }, [heartbeat, serialize, clearHeartbeat]);

  const connect = useCallback(() => {
    if (!url) return;

    cleanup();
    setError(null);
    closingRef.current = false;

    const newStatus = triesRef.current > 0 ? 'reconnecting' : 'connecting';
    setStatus(newStatus);
    onReconnecting?.(triesRef.current);

    try {
      const ws = new WebSocket(url, protocols);
      wsRef.current = ws;

      ws.onopen = (ev) => {
        if (closingRef.current) return;
        triesRef.current = 0;
        setStatus('open');
        setError(null);
        onOpen?.(ev);
        onConnected?.();
        startHeartbeat();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = parse(ev.data);

          if (heartbeat?.pongPredicate && heartbeat.pongPredicate(msg)) {
            lastPongRef.current = Date.now();
            if (hbGuardRef.current) {
              window.clearTimeout(hbGuardRef.current);
              hbGuardRef.current = null;
            }
          }

          setLastMessage(msg);
          setMessageHistory((prev) => {
            const next = [...prev, msg];
            return next.slice(-bufferSize);
          });

          onMessage?.(msg, ev);

          if (typeof msg === 'object' && msg && 'type' in (msg as any)) {
            const typeKey = String((msg as any).type);
            const handler = messageHandlers[typeKey];
            handler?.(msg, ev);
          }
        } catch (e: any) {
          const err = e instanceof Error ? e : new Error(String(e));
          setError(err);
          onError?.(err);
        }
      };

      ws.onerror = () => {
        const err = new Error('WebSocket connection error');
        setError(err);
        onError?.(err);
      };

      ws.onclose = (ev) => {
        clearHeartbeat();
        onClose?.(ev);

        if (closingRef.current) {
          setStatus('closed');
          onDisconnected?.('manual');
          return;
        }

        if (autoReconnect && (reconnectOnError || (ev.code >= 1000 && ev.code < 1012))) {
          const attempt = ++triesRef.current;

          if (maxRetries > 0 && attempt > maxRetries) {
            setStatus('closed');
            setError(new Error(`Max retries reached (${maxRetries})`));
            onDisconnected?.('max_retries');
            return;
          }

          const delay = nextDelay(attempt - 1, backoff);
          setStatus('reconnecting');

          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (!closingRef.current && url) connect();
          }, delay);
        } else {
          setStatus('closed');
          onDisconnected?.('no_reconnect');
        }
      };
    } catch (err: any) {
      setStatus('error');
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
    }
  }, [
    url,
    protocols,
    autoReconnect,
    maxRetries,
    backoff,
    parse,
    onOpen,
    onClose,
    onError,
    onMessage,
    onReconnecting,
    onConnected,
    onDisconnected,
    startHeartbeat,
    cleanup,
    heartbeat,
    messageHandlers,
    bufferSize,
    reconnectOnError,
    clearHeartbeat,
  ]);

  const disconnect = useCallback(
    (code = 1000, reason = 'Manual disconnect') => {
      closingRef.current = true;
      setStatus('closing');

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.close(code, reason);
        } catch {
          /* noop */
        }
      }
      cleanup(true);
      setStatus('closed');
    },
    [cleanup]
  );

  const reconnect = useCallback(() => {
    triesRef.current = 0;
    closingRef.current = false;
    setError(null);
    connect();
  }, [connect]);

  const send = useCallback(
    (data: TIn) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        const payload = safeSerialize(data, serialize);
        ws.send(payload);
        return true;
      } catch (err) {
        console.error('WebSocket send error:', err);
        return false;
      }
    },
    [serialize]
  );

  const sendJson = useCallback(
    (data: any) => {
      return send(data as TIn);
    },
    [send]
  );

  const clearMessageHistory = useCallback(() => {
    setMessageHistory([]);
  }, []);

  const getWebSocket = useCallback(() => wsRef.current, []);

  // Efeito de ciclo de vida
  useEffect(() => {
    if (!enabled) {
      disconnect(1000, 'Hook disabled');
      return;
    }
    if (url) connect();

    return () => {
      closingRef.current = true;
      cleanup(true);
    };
  }, [url, enabled, connect, disconnect, cleanup]);

  // Conectividade de rede
  useEffect(() => {
    if (!autoReconnect) return;

    const handleOnline = () => {
      if (status !== 'open' && !closingRef.current) {
        reconnect();
      }
    };
    const handleOffline = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        disconnect(1001, 'Network offline');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [status, autoReconnect, reconnect, disconnect]);

  const isConnected = status === 'open';
  const isConnecting = status === 'connecting';
  const isReconnecting = status === 'reconnecting';

  return {
    status,
    isConnected,
    isConnecting,
    isReconnecting,
    lastMessage,
    messageHistory,
    error,
    send,
    sendJson,
    reconnect,
    disconnect,
    getWebSocket,
    retryCount: triesRef.current,
    clearMessageHistory,
  };
}

// -------------------- hooks especializados --------------------

/** Hook para mensagens JSON com tipos específicos */
export function useJsonWebSocket<TMessage extends Record<string, any>>(
  opts: Omit<UseWebSocketOptions<any, TMessage>, 'serialize' | 'parse'>
) {
  return useWebSocket<TMessage, TMessage>({
    serialize: defaultSerialize,
    parse: defaultParse,
    ...opts,
  });
}

/** Hook com reconexão agressiva (dados críticos) */
export function usePersistentWebSocket<TIn = any, TOut = any>(
  opts: UseWebSocketOptions<TIn, TOut>
) {
  return useWebSocket<TIn, TOut>({
    autoReconnect: true,
    maxRetries: 0,
    backoff: { initial: 1000, factor: 1.5, max: 30000, jitter: true },
    reconnectOnError: true,
    ...opts,
  });
}

/** Hook com heartbeat automático (mensagens padrão) */
export function useHeartbeatWebSocket<TOut = any>(
  opts: Omit<UseWebSocketOptions<WSPingMessage, TOut>, 'heartbeat'> & {
    heartbeatInterval?: number;
  }
) {
  const { heartbeatInterval = 30000, ...rest } = opts;
  return useWebSocket<WSPingMessage, TOut>({
    heartbeat: {
      interval: heartbeatInterval,
      pingMessage: { type: 'ping', timestamp: Date.now() },
      pongPredicate: (msg: any) => msg?.type === 'pong',
      timeout: heartbeatInterval * 2,
    },
    ...rest,
  });
}

/** Factory para criar hooks WebSocket pré-configurados */
export function createWebSocketHook<TIn = any, TOut = any>(
  baseOptions: Partial<UseWebSocketOptions<TIn, TOut>>
) {
  return (options: Partial<UseWebSocketOptions<TIn, TOut>> = {}) =>
    useWebSocket({ ...baseOptions, ...options });
}

/** Hook pré-configurado para o MapsProve */
export const useProveMapsWebSocket = createWebSocketHook({
  path: '/ws/status',
  token: () => {
    try {
      return localStorage.getItem('token');
    } catch {
      return null;
    }
  },
  heartbeat: {
    interval: 10000,
    pingMessage: { type: 'ping', timestamp: Date.now() },
    pongPredicate: (msg: any) => msg?.type === 'pong',
    timeout: 20000,
  },
  autoReconnect: true,
  maxRetries: 10,
});
