// frontend/src/components/panels/NodeInfoCard.tsx
import React, { useMemo, useCallback, useState } from 'react';
import {
  type TopologyNode,
  type NodeStatus,
  topologyActions,
} from '@/store/topology';
import {
  MetricBar,
  SparklineWithValue,
  StatusIndicator,
  MetricGroup,
  KpiCard,
} from './StatsPrimitives';

type Props = {
  node: TopologyNode;
  className?: string;
  /** Centraliza o mapa no nó */
  onFocusNode?: (id: string) => void;
  /** Ações de rede: ping, traceroute, ssh, refresh */
  onAction?: (
    action: 'ping' | 'traceroute' | 'ssh' | 'refresh',
    node: TopologyNode
  ) => void;
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  up: 'Operacional',
  down: 'Inoperante',
  degraded: 'Degradado',
  unknown: 'Desconhecido',
};

const STATUS_TONE: Record<NodeStatus, { text: string; chip: string }> = {
  up: { text: 'text-green-700', chip: 'bg-green-100 text-green-800' },
  degraded: { text: 'text-yellow-700', chip: 'bg-yellow-100 text-yellow-800' },
  down: { text: 'text-red-700', chip: 'bg-red-100 text-red-800' },
  unknown: { text: 'text-slate-700', chip: 'bg-slate-100 text-slate-800' },
};

function pct(v?: number) {
  if (typeof v !== 'number' || !isFinite(v)) return undefined;
  // já esperamos 0..100; se vier 0..1, converte
  return v <= 1 ? Math.round(v * 100) : Math.round(v);
}

function clamp01(v?: number) {
  if (typeof v !== 'number') return undefined;
  if (v > 1.00001) return undefined;
  if (v < 0) return 0;
  return v;
}

function fmtLatency(v?: number) {
  if (typeof v !== 'number' || !isFinite(v)) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`;
  return `${Math.round(v)} ms`;
}

function KeyValue({
  k,
  v,
}: {
  k: string;
  v: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="text-xs text-slate-500">{k}</div>
      <div className="text-xs font-medium text-slate-900 truncate max-w-[60%]" title={String(v)}>
        {v}
      </div>
    </div>
  );
}

export default function NodeInfoCard({
  node,
  className = '',
  onFocusNode,
  onAction,
}: Props) {
  const [metaExpanded, setMetaExpanded] = useState(false);

  const status: NodeStatus = node.status ?? 'unknown';
  const statusLabel = STATUS_LABEL[status];
  const tone = STATUS_TONE[status];

  // Coordenadas legíveis
  const coords = useMemo(() => {
    if (!Number.isFinite(node.lat) || !Number.isFinite(node.lon)) return null;
    return {
      lon: Number(node.lon!.toFixed(6)),
      lat: Number(node.lat!.toFixed(6)),
    };
  }, [node.lat, node.lon]);

  // Métricas consolidadas
  const cpuPct = pct(node.metrics?.cpu);
  const memPct = pct(node.metrics?.memory ?? node.metrics?.mem);
  const diskPct = pct(node.metrics?.disk);
  const latencyMs = node.metrics?.latency;

  // Histórico opcional em meta (se exposto pelo backend)
  const cpuHistory = (node.meta?.cpuHistory as number[] | undefined) ?? undefined;
  const memHistory = (node.meta?.memHistory as number[] | undefined) ?? undefined;
  const rttHistory = (node.meta?.latencyHistory as number[] | undefined) ?? undefined;

  const handleFocus = useCallback(() => {
    onFocusNode?.(node.id);
    topologyActions.setSelectedNode(node.id);
  }, [node.id, onFocusNode]);

  const runAction = useCallback(
    (type: 'ping' | 'traceroute' | 'ssh' | 'refresh') => {
      onAction?.(type, node);
    },
    [onAction, node]
  );

  const copyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(node.id);
    } catch {
      // noop
    }
  }, [node.id]);

  return (
    <div
      className={[
        'p-4 bg-white border border-slate-200 rounded-xl shadow-sm',
        className,
      ].join(' ')}
      data-testid="node-info-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 truncate">
              {node.name || node.id}
            </h3>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${tone.chip}`}>
              {statusLabel}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            <span className="truncate">ID: {node.id}</span>
            {node.type && <span>• Tipo: {node.type}</span>}
            {node.tags && node.tags.length > 0 && (
              <span className="hidden sm:inline">
                • Tags: {node.tags.slice(0, 3).join(', ')}
                {node.tags.length > 3 ? ` +${node.tags.length - 3}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusIndicator
            status={
              status === 'up'
                ? 'success'
                : status === 'down'
                ? 'error'
                : status === 'degraded'
                ? 'warning'
                : 'neutral'
            }
            size="md"
            pulse={status !== 'up'}
          />
          <button
            onClick={copyId}
            className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
            title="Copiar ID"
          >
            📋
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard
          label="Status"
          value={statusLabel}
          hint={node.lastSeen ? `Atualizado ${new Date(node.lastSeen).toLocaleString()}` : undefined}
          size="sm"
          className="bg-slate-50"
        />
        <KpiCard
          label="CPU"
          value={typeof cpuPct === 'number' ? `${cpuPct}%` : '—'}
          trend={undefined}
          size="sm"
        />
        <KpiCard
          label="Memória"
          value={typeof memPct === 'number' ? `${memPct}%` : '—'}
          size="sm"
        />
        <KpiCard
          label="Latência"
          value={fmtLatency(latencyMs)}
          size="sm"
        />
      </div>

      {/* Métricas detalhadas */}
      <MetricGroup className="mt-3" title="Métricas do Nó">
        <MetricBar
          label="CPU"
          value={cpuPct}
          theme={cpuPct !== undefined ? (cpuPct >= 85 ? 'red' : cpuPct >= 70 ? 'yellow' : 'green') : 'gray'}
          size="md"
          help="Carga de CPU (última leitura)"
        />
        <MetricBar
          label="Memória"
          value={memPct}
          theme={memPct !== undefined ? (memPct >= 85 ? 'red' : memPct >= 70 ? 'yellow' : 'blue') : 'gray'}
          size="md"
          help="Uso de memória (última leitura)"
        />
        <MetricBar
          label="Disco"
          value={diskPct}
          theme={diskPct !== undefined ? (diskPct >= 85 ? 'red' : diskPct >= 70 ? 'yellow' : 'purple') : 'gray'}
          size="md"
          help="Uso de disco (pior partição)"
        />

        {(cpuHistory || memHistory || rttHistory) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <SparklineWithValue
              data={cpuHistory}
              currentValue={node.metrics?.cpu}
              formatValue={(v) => `${Math.round(v)}%`}
              color="red"
              smooth
              showArea
            />
            <SparklineWithValue
              data={memHistory}
              currentValue={node.metrics?.memory ?? node.metrics?.mem}
              formatValue={(v) => `${Math.round(v)}%`}
              color="purple"
              smooth
              showArea
            />
            <SparklineWithValue
              data={rttHistory}
              currentValue={latencyMs}
              formatValue={(v) => fmtLatency(v)}
              color="blue"
              smooth
              showArea
            />
          </div>
        )}
      </MetricGroup>

      {/* Informações e metadados */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-slate-900 mb-2">Informações</div>
          <KeyValue k="Nome" v={node.name ?? '—'} />
          <KeyValue k="Tipo" v={node.type ?? '—'} />
          <KeyValue k="Status" v={statusLabel} />
          <KeyValue
            k="Coordenadas"
            v={
              coords ? (
                <span className="font-mono">
                  {coords.lat}, {coords.lon}
                </span>
              ) : (
                '—'
              )
            }
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-slate-900 mb-2 flex items-center justify-between">
            <span>Metadados</span>
            {node.meta && (
              <button
                onClick={() => setMetaExpanded((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                {metaExpanded ? 'Ocultar' : 'Ver tudo'}
              </button>
            )}
          </div>

          {node.tags && node.tags.length > 0 && (
            <div className="mb-2">
              <div className="text-xs text-slate-500 mb-1">Tags</div>
              <div className="flex flex-wrap gap-1">
                {node.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {node.meta ? (
            <div className="space-y-1 max-h-48 overflow-auto pr-1 custom-scroll">
              {Object.entries(node.meta)
                .slice(0, metaExpanded ? undefined : 6)
                .map(([k, v]) => (
                  <KeyValue
                    key={k}
                    k={k}
                    v={
                      typeof v === 'object'
                        ? JSON.stringify(v).slice(0, 120) + (JSON.stringify(v).length > 120 ? '…' : '')
                        : String(v)
                    }
                  />
                ))}
              {!metaExpanded && Object.keys(node.meta).length > 6 && (
                <div className="text-[11px] text-slate-500">
                  +{Object.keys(node.meta).length - 6} itens
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500">Sem metadados</div>
          )}
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={handleFocus}
          className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
          title="Centralizar no mapa"
        >
          👁️ Focar
        </button>
        <button
          onClick={() => runAction('ping')}
          className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
          title="Ping"
        >
          📶 Ping
        </button>
        <button
          onClick={() => runAction('traceroute')}
          className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
          title="Traceroute"
        >
          🛰️ Traceroute
        </button>
        <button
          onClick={() => runAction('ssh')}
          className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
          title="Abrir SSH"
        >
          🖥️ SSH
        </button>
        <button
          onClick={() => runAction('refresh')}
          className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
          title="Solicitar atualização"
        >
          🔄 Atualizar
        </button>
      </div>
    </div>
  );
}
