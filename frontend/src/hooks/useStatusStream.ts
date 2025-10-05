// frontend/src/hooks/useStatusStream.ts
// =======================================================
// 📡 useStatusStream (v1.1)
// Camada acima do useWebSocket para normalizar eventos:
// - snmp_metrics      → metricsByHost (com TTL opcional)
// - alert             → alerts (ring buffer + acknowledge/remove)
// - topology_update   → topology (Maps para acesso O(1) + arrays cacheados)
// - system_status     → health geral do backend/worker
// - command_response  → callbacks por commandId com timeout
// Também expõe helpers para enviar comandos via WS.
// =======================================================

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  useWebSocket,
  usePersistentWebSocket,
  type UseWebSocketOptions,
  type UseWebSocketReturn,
} from './useWebSocket';

// -------------------- Tipos de mensagens estendidos --------------------

export type WireSnmpMetrics = {
  type: 'snmp_metrics';
  host: string;
  cpu?: number;
  mem?: number;
  disks?: Array<{ mount: string; usage: number }>;
  interfaces?: Array<{
    name: string;
    status: 'up' | 'down' | 'unknown';
    inBytes: number;
    outBytes: number;
    errors?: number;
  }>;
  ts?: number;
  ttl?: number; // Time-to-live em ms
};

export type WireAlert = {
  type: 'alert';
  id?: string;
  level: 'info' | 'warn' | 'critical';
  message: string;
  source?: string;
  host?: string;
  ts?: number;
  extra?: Record<string, any>;
  acknowledged?: boolean;
  autoClear?: boolean;
  category?: string;
};

export type WireTopologyUpdate = {
  type: 'topology_update';
  version?: string | number;
  timestamp?: number;
  nodes?: Array<{
    id: string;
    name?: string;
    lat?: number;
    lon?: number;
    status?: 'up' | 'down' | 'degraded';
    type?: 'router' | 'switch' | 'server' | 'firewall' | 'unknown';
    meta?: Record<string, any>;
  }>;
  links?: Array<{
    id: string;
    source: string;
    target: string;
    fiber?: boolean;
    distanceKm?: number;
    status?: 'up' | 'down' | 'degraded';
    bandwidth?: number;
    utilization?: number;
    meta?: Record<string, any>;
  }>;
  diff?: {
    added?: { nodes: string[]; links: string[] };
    removed?: { nodes: string[]; links: string[] };
    updated?: { nodes: string[]; links: string[] };
  };
};

export type WirePong = {
  type: 'pong';
  id?: string;
  timestamp?: number;
  latency?: number;
};

export type WireSystemStatus = {
  type: 'system_status';
  uptime?: number;
  memoryUsage?: number;
  activeConnections?: number;
  queueSize?: number;
  ts?: number;
};

export type WireCommandResponse = {
  type: 'command_response';
  commandId?: string;
  success: boolean;
  message?: string;
  data?: any;
  ts?: number;
};

export type WireEvent =
  | WireSnmpMetrics
  | WireAlert
  | WireTopologyUpdate
  | WirePong
  | WireSystemStatus
  | WireCommandResponse
  | Record<string, any>;

// -------------------- Tipos normalizados --------------------

export type TopologyNode = {
  id: string;
  name?: string;
  lat?: number;
  lon?: number;
  status?: 'up' | 'down' | 'degraded';
  type?: 'router' | 'switch' | 'server' | 'firewall' | 'unknown';
  meta?: Record<string, any>;
  lastSeen?: number;
};

export type TopologyLink = {
  id: string;
  source: string;
  target: string;
  fiber?: boolean;
  distanceKm?: number;
  status?: 'up' | 'down' | 'degraded';
  bandwidth?: number;
  utilization?: number;
  meta?: Record<string, any>;
  lastSeen?: number;
};

export type HostMetrics = {
  host: string;
  cpu?: number;
  mem?: number;
  disks?: Array<{ mount: string; usage: number }>;
  interfaces?: Array<{
    name: string;
    status: 'up' | 'down' | 'unknown';
    inBytes: number;
    outBytes: number;
    errors?: number;
  }>;
  updatedAt: number;
  expiresAt?: number; // Para TTL
  isStale?: boolean;
};

export type NormalizedAlert = {
  id: string;
  level: 'info' | 'warn' | 'critical';
  message: string;
  source?: string;
  host?: string;
  createdAt: number;
  acknowledged: boolean;
  autoClear: boolean;
  category?: string;
  extra?: Record<string, any>;
  isNew?: boolean;
};

export type NormalizedTopology = {
  version?: string | number;
  updatedAt?: number;
  nodes: Map<string, TopologyNode>;
  links: Map<string, TopologyLink>;
  nodeArray: TopologyNode[];
  linkArray: TopologyLink[];
};

export type SystemStatus = {
  uptime?: number;
  memoryUsage?: number;
  activeConnections?: number;
  queueSize?: number;
  updatedAt: number;
};

export type StatusStreamState = {
  metricsByHost: Record<string, HostMetrics>;
  alerts: NormalizedAlert[];
  topology: NormalizedTopology;
  systemStatus?: SystemStatus;
  lastEvent?: WireEvent;
  eventCount: number;
  connectedAt?: number;
  lastMetricsUpdate?: number;
};

// -------------------- Actions --------------------

type StatusAction =
  | { type: 'METRICS_UPSERT'; payload: HostMetrics }
  | { type: 'METRICS_REMOVE_EXPIRED'; currentTime: number }
  | { type: 'ALERT_PUSH'; payload: NormalizedAlert; max: number }
  | { type: 'ALERT_ACKNOWLEDGE'; id: string }
  | { type: 'ALERT_REMOVE'; id: string }
  | { type: 'ALERT_CLEAR_ALL' }
  | { type: 'ALERT_CLEAR_AUTO_CLEAR' }
  | { type: 'TOPOLOGY_SET'; payload: NormalizedTopology }
  | { type: 'TOPOLOGY_UPDATE_NODES'; nodes: TopologyNode[] }
  | { type: 'TOPOLOGY_UPDATE_LINKS'; links: TopologyLink[] }
  | { type: 'SYSTEM_STATUS_UPDATE'; payload: SystemStatus }
  | { type: 'LAST_EVENT'; payload?: WireEvent }
  | { type: 'CONNECTION_ESTABLISHED' }
  | { type: 'RESET' };

// -------------------- Helpers --------------------

const now = () => Date.now();

function clipRight<T>(arr: T[], max: number): T[] {
  if (max <= 0) return [];
  return arr.length > max ? arr.slice(arr.length - max) : arr;
}

function normalizeMetrics(msg: WireSnmpMetrics): HostMetrics {
  const updatedAt = msg.ts && Number.isFinite(msg.ts) ? msg.ts : now();
  const expiresAt = msg.ttl ? updatedAt + msg.ttl : undefined;

  return {
    host: msg.host,
    cpu: typeof msg.cpu === 'number' ? Math.max(0, Math.min(100, msg.cpu)) : undefined,
    mem: typeof msg.mem === 'number' ? Math.max(0, Math.min(100, msg.mem)) : undefined,
    disks: Array.isArray(msg.disks)
      ? msg.disks.map((disk) => ({
          ...disk,
          usage: Math.max(0, Math.min(100, disk.usage)),
        }))
      : undefined,
    interfaces: Array.isArray(msg.interfaces) ? msg.interfaces : undefined,
    updatedAt,
    expiresAt,
    isStale: false,
  };
}

function normalizeAlert(msg: WireAlert): NormalizedAlert {
  const id = msg.id ?? `alert-${now()}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    id,
    level: msg.level ?? 'info',
    message: msg.message ?? '',
    source: msg.source,
    host: msg.host,
    createdAt: msg.ts && Number.isFinite(msg.ts) ? msg.ts : now(),
    acknowledged: msg.acknowledged ?? false,
    autoClear: msg.autoClear ?? false,
    category: msg.category,
    extra: msg.extra,
    isNew: true,
  };
}

function normalizeTopology(msg: WireTopologyUpdate): NormalizedTopology {
  const nodes = new Map<string, TopologyNode>();
  const links = new Map<string, TopologyLink>();

  if (Array.isArray(msg.nodes)) {
    msg.nodes.forEach((node) => {
      nodes.set(node.id, {
        ...node,
        lastSeen: now(),
      });
    });
  }

  if (Array.isArray(msg.links)) {
    msg.links.forEach((link) => {
      links.set(link.id, {
        ...link,
        lastSeen: now(),
      });
    });
  }

  return {
    version: msg.version,
    updatedAt: msg.timestamp ?? now(),
    nodes,
    links,
    nodeArray: Array.from(nodes.values()),
    linkArray: Array.from(links.values()),
  };
}

function normalizeSystemStatus(msg: WireSystemStatus): SystemStatus {
  return {
    uptime: msg.uptime,
    memoryUsage: msg.memoryUsage,
    activeConnections: msg.activeConnections,
    queueSize: msg.queueSize,
    updatedAt: msg.ts ?? now(),
  };
}

// -------------------- Reducer --------------------

const initialState: StatusStreamState = {
  metricsByHost: {},
  alerts: [],
  topology: {
    nodes: new Map(),
    links: new Map(),
    nodeArray: [],
    linkArray: [],
  },
  eventCount: 0,
};

function reducer(state: StatusStreamState, action: StatusAction): StatusStreamState {
  switch (action.type) {
    case 'METRICS_UPSERT': {
      const nextMetrics = { ...state.metricsByHost, [action.payload.host]: action.payload };
      return {
        ...state,
        metricsByHost: nextMetrics,
        lastMetricsUpdate: now(),
        eventCount: state.eventCount + 1,
      };
    }

    case 'METRICS_REMOVE_EXPIRED': {
      const nextMetrics = { ...state.metricsByHost };
      let removed = false;

      Object.entries(nextMetrics).forEach(([host, metrics]) => {
        if (metrics.expiresAt && metrics.expiresAt < action.currentTime) {
          delete nextMetrics[host];
          removed = true;
        }
      });

      return removed ? { ...state, metricsByHost: nextMetrics } : state;
    }

    case 'ALERT_PUSH': {
      const newAlert = { ...action.payload, isNew: true };
      const nextAlerts = clipRight([...state.alerts, newAlert], action.max);
      return {
        ...state,
        alerts: nextAlerts,
        eventCount: state.eventCount + 1,
      };
    }

    case 'ALERT_ACKNOWLEDGE': {
      const nextAlerts = state.alerts.map((alert) =>
        alert.id === action.id ? { ...alert, acknowledged: true, isNew: false } : alert
      );
      return { ...state, alerts: nextAlerts };
    }

    case 'ALERT_REMOVE': {
      const nextAlerts = state.alerts.filter((alert) => alert.id !== action.id);
      return { ...state, alerts: nextAlerts };
    }

    case 'ALERT_CLEAR_ALL': {
      return { ...state, alerts: [] };
    }

    case 'ALERT_CLEAR_AUTO_CLEAR': {
      const nextAlerts = state.alerts.filter((alert) => !alert.autoClear);
      return { ...state, alerts: nextAlerts };
    }

    case 'TOPOLOGY_SET': {
      return {
        ...state,
        topology: action.payload,
        eventCount: state.eventCount + 1,
      };
    }

    case 'TOPOLOGY_UPDATE_NODES': {
      const nodes = new Map(state.topology.nodes);
      action.nodes.forEach((node) => {
        nodes.set(node.id, { ...node, lastSeen: now() });
      });

      return {
        ...state,
        topology: {
          ...state.topology,
          nodes,
          nodeArray: Array.from(nodes.values()),
        },
        eventCount: state.eventCount + 1,
      };
    }

    case 'TOPOLOGY_UPDATE_LINKS': {
      const links = new Map(state.topology.links);
      action.links.forEach((link) => {
        links.set(link.id, { ...link, lastSeen: now() });
      });

      return {
        ...state,
        topology: {
          ...state.topology,
          links,
          linkArray: Array.from(links.values()),
        },
        eventCount: state.eventCount + 1,
      };
    }

    case 'SYSTEM_STATUS_UPDATE': {
      return {
        ...state,
        systemStatus: action.payload,
        eventCount: state.eventCount + 1,
      };
    }

    case 'LAST_EVENT': {
      // Importante: NÃO incrementamos eventCount aqui para evitar contagem dupla,
      // pois cada evento "real" já incrementa nas ações específicas acima.
      return { ...state, lastEvent: action.payload };
    }

    case 'CONNECTION_ESTABLISHED': {
      return {
        ...state,
        connectedAt: now(),
        eventCount: 0,
      };
    }

    case 'RESET':
      return { ...initialState, connectedAt: now() };

    default:
      return state;
  }
}

// -------------------- Opções do hook --------------------

export type UseStatusStreamOptions = Omit<
  UseWebSocketOptions<any, WireEvent>,
  'onMessage' | 'path' | 'serialize' | 'parse'
> & {
  path?: string;
  maxAlerts?: number;
  metricsTTLCheckInterval?: number;
  autoClearAlerts?: boolean;
  onMetrics?: (m: HostMetrics) => void;
  onAlert?: (a: NormalizedAlert) => void;
  onTopology?: (t: NormalizedTopology) => void;
  onSystemStatus?: (s: SystemStatus) => void;
  onCommandResponse?: (r: WireCommandResponse) => void;
  onAny?: (e: WireEvent) => void;
  persistent?: boolean;
  enableMetricsExpiration?: boolean;
};

// -------------------- Hook principal --------------------

export function useStatusStream(opts: UseStatusStreamOptions = {}) {
  const {
    path = '/ws/status',
    maxAlerts = 200,
    metricsTTLCheckInterval = 30_000,
    autoClearAlerts = true,
    onMetrics,
    onAlert,
    onTopology,
    onSystemStatus,
    onCommandResponse,
    onAny,
    persistent = true,
    enableMetricsExpiration = true,
    // opções WS
    token,
    protocols,
    makeUrl,
    autoReconnect = true,
    maxRetries = 0,
    backoff,
    heartbeat,
    onOpen,
    onClose,
    onError,
    onReconnecting,
    onConnected,
    onDisconnected,
    deps,
    enabled = true,
    bufferSize = 50,
    reconnectOnError = true,
    messageHandlers,
  } = opts;

  const [state, dispatch] = useReducer(reducer, initialState);
  const commandCallbacksRef = useRef<Map<string, (response: WireCommandResponse) => void>>(new Map());

  // Limpeza de métricas expiradas (TTL)
  useEffect(() => {
    if (!enableMetricsExpiration) return;
    const id = window.setInterval(() => {
      dispatch({ type: 'METRICS_REMOVE_EXPIRED', currentTime: now() });
    }, metricsTTLCheckInterval);
    return () => window.clearInterval(id);
  }, [enableMetricsExpiration, metricsTTLCheckInterval]);

  // Limpeza automática de alerts (autoClear)
  useEffect(() => {
    if (!autoClearAlerts) return;
    const id = window.setInterval(() => {
      dispatch({ type: 'ALERT_CLEAR_AUTO_CLEAR' });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [autoClearAlerts]);

  const handleMessage = useCallback(
    (msg: WireEvent) => {
      dispatch({ type: 'LAST_EVENT', payload: msg });
      onAny?.(msg);

      switch (msg?.type) {
        case 'snmp_metrics': {
          const m = normalizeMetrics(msg as WireSnmpMetrics);
          dispatch({ type: 'METRICS_UPSERT', payload: m });
          onMetrics?.(m);
          break;
        }

        case 'alert': {
          const a = normalizeAlert(msg as WireAlert);
          dispatch({ type: 'ALERT_PUSH', payload: a, max: maxAlerts });
          onAlert?.(a);
          break;
        }

        case 'topology_update': {
          const t = normalizeTopology(msg as WireTopologyUpdate);
          dispatch({ type: 'TOPOLOGY_SET', payload: t });
          onTopology?.(t);
          break;
        }

        case 'system_status': {
          const s = normalizeSystemStatus(msg as WireSystemStatus);
          dispatch({ type: 'SYSTEM_STATUS_UPDATE', payload: s });
          onSystemStatus?.(s);
          break;
        }

        case 'command_response': {
          const response = msg as WireCommandResponse;
          if (response.commandId) {
            const cb = commandCallbacksRef.current.get(response.commandId);
            cb?.(response);
            commandCallbacksRef.current.delete(response.commandId);
          }
          onCommandResponse?.(response);
          break;
        }

        case 'pong':
          // heartbeat já tratado pelo hook base — opcionalmente poderíamos
          // calcular latência aqui usando timestamp do ping.
          break;

        default:
          break;
      }
    },
    [onAny, onMetrics, onAlert, onTopology, onSystemStatus, onCommandResponse, maxAlerts]
  );

  const handleOpen = useCallback(
    (ev: Event) => {
      dispatch({ type: 'CONNECTION_ESTABLISHED' });
      onOpen?.(ev);
    },
    [onOpen]
  );

  const wsOpts = useMemo<UseWebSocketOptions<any, WireEvent>>(
    () => ({
      path,
      token,
      protocols,
      makeUrl,
      autoReconnect,
      maxRetries,
      backoff,
      heartbeat,
      onOpen: handleOpen,
      onClose,
      onError,
      onReconnecting,
      onConnected,
      onDisconnected,
      onMessage: handleMessage,
      deps,
      enabled,
      bufferSize,
      reconnectOnError,
      messageHandlers,
    }),
    [
      path,
      token,
      protocols,
      makeUrl,
      autoReconnect,
      maxRetries,
      backoff,
      heartbeat,
      handleOpen,
      onClose,
      onError,
      onReconnecting,
      onConnected,
      onDisconnected,
      handleMessage,
      deps,
      enabled,
      bufferSize,
      reconnectOnError,
      messageHandlers,
    ]
  );

  const ws: UseWebSocketReturn<any, WireEvent> = persistent
    ? usePersistentWebSocket(wsOpts)
    : useWebSocket(wsOpts);

  // -------------------- Commands --------------------

  const sendCommand = useCallback(
    (data: any, callback?: (response: WireCommandResponse) => void) => {
      const commandId = data.commandId || `cmd-${now()}-${Math.random().toString(36).slice(2, 9)}`;
      const command = { ...data, commandId, ts: Date.now() };

      if (callback) {
        commandCallbacksRef.current.set(commandId, callback);
        // timeout do callback
        window.setTimeout(() => {
          if (commandCallbacksRef.current.has(commandId)) {
            commandCallbacksRef.current.delete(commandId);
            callback({
              type: 'command_response',
              commandId,
              success: false,
              message: 'Command timeout',
              ts: now(),
            });
          }
        }, 30_000);
      }

      return ws.sendJson(command);
    },
    [ws]
  );

  const requestRefreshAll = useCallback(
    (cb?: (response: WireCommandResponse) => void) => sendCommand({ type: 'refresh_all' }, cb),
    [sendCommand]
  );

  const requestHostStatus = useCallback(
    (host: string, cb?: (response: WireCommandResponse) => void) =>
      sendCommand({ type: 'refresh_host', host }, cb),
    [sendCommand]
  );

  const acknowledgeAlert = useCallback((alertId: string) => {
    dispatch({ type: 'ALERT_ACKNOWLEDGE', id: alertId });
  }, []);

  const removeAlert = useCallback((alertId: string) => {
    dispatch({ type: 'ALERT_REMOVE', id: alertId });
  }, []);

  const clearAlerts = useCallback(() => dispatch({ type: 'ALERT_CLEAR_ALL' }), []);
  const resetAll = useCallback(() => dispatch({ type: 'RESET' }), []);

  // -------------------- Derivados --------------------

  const metricsArray = useMemo(
    () => Object.values(state.metricsByHost).sort((a, b) => b.updatedAt - a.updatedAt),
    [state.metricsByHost]
  );

  const criticalAlerts = useMemo(
    () => state.alerts.filter((a) => a.level === 'critical' && !a.acknowledged),
    [state.alerts]
  );

  const newAlerts = useMemo(() => state.alerts.filter((a) => a.isNew), [state.alerts]);

  const connectionDuration = useMemo(() => {
    return state.connectedAt ? now() - state.connectedAt : 0;
  }, [state.connectedAt]);

  return {
    // Conexão
    status: ws.status,
    isConnected: ws.isConnected,
    isConnecting: ws.isConnecting,
    isReconnecting: ws.isReconnecting,
    retryCount: ws.retryCount,
    error: ws.error,
    connectionDuration,
    eventCount: state.eventCount,

    // Dados normalizados
    metricsByHost: state.metricsByHost,
    metricsList: metricsArray,
    alerts: state.alerts,
    criticalAlerts,
    newAlerts,
    topology: state.topology,
    systemStatus: state.systemStatus,
    lastEvent: state.lastEvent,

    // Ações
    sendCommand,
    requestRefreshAll,
    requestHostStatus,
    acknowledgeAlert,
    removeAlert,
    clearAlerts,
    resetAll,

    // WS utils
    reconnect: ws.reconnect,
    disconnect: ws.disconnect,
    getWebSocket: ws.getWebSocket,
    clearMessageHistory: ws.clearMessageHistory,
  };
}

// -------------------- Hooks especializados --------------------

/** Hook para monitorar apenas métricas */
export function useMetricsStream(opts: UseStatusStreamOptions = {}) {
  const s = useStatusStream(opts);
  return {
    metricsByHost: s.metricsByHost,
    metricsList: s.metricsList,
    lastMetricsUpdate: s.lastEvent?.type === 'snmp_metrics' ? s.lastEvent : undefined,
    isConnected: s.isConnected,
  };
}

/** Hook para monitorar apenas alertas */
export function useAlertsStream(opts: UseStatusStreamOptions = {}) {
  const s = useStatusStream(opts);
  return {
    alerts: s.alerts,
    criticalAlerts: s.criticalAlerts,
    newAlerts: s.newAlerts,
    acknowledgeAlert: s.acknowledgeAlert,
    removeAlert: s.removeAlert,
    clearAlerts: s.clearAlerts,
    isConnected: s.isConnected,
  };
}

// -------------------- Exemplos --------------------
/*
const {
  metricsList,
  alerts,
  topology,
  systemStatus,
  sendCommand,
  acknowledgeAlert,
} = useStatusStream({
  onAlert: (a) => a.level === 'critical' && toast.error(a.message),
  onSystemStatus: (st) => console.log('Queue size:', st.queueSize),
  maxAlerts: 500,
});

// Comando com callback
sendCommand({ type: 'reboot_host', host: 'router-01' }, (resp) => {
  resp.success ? toast.success('Reboot iniciado') : toast.error(resp.message || 'Falha no reboot');
});
*/
