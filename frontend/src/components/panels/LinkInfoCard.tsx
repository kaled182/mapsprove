// frontend/src/components/panels/LinkInfoCard.tsx
import React, { useMemo, useCallback, useState } from 'react';
import {
  useTopologyStore,
  topologyActions,
  type TopologyLink,
  type LinkStatus,
  type LinkType,
} from '@/store/topology';
import {
  MetricBar,
  SparklineWithValue,
  StatusIndicator,
  MetricGroup,
  KpiCard,
  type ColorTheme,
} from './StatsPrimitives';

type Props = {
  link: TopologyLink;
  className?: string;
  /** Centraliza o mapa no link */
  onFocusLink?: (id: string) => void;
  /** Centraliza o mapa em um dos nós */
  onFocusNode?: (id: string) => void;
  /** Ações de diagnóstico / manutenção */
  onAction?: (
    action: 'refresh' | 'test-latency' | 'test-throughput' | 'open-details' | 'qos' | 'monitoring',
    link: TopologyLink
  ) => void;
  /** Modo compacto para uso em listas */
  compact?: boolean;
  /** Mostrar todas as métricas expandidas */
  expanded?: boolean;
  /** Callback quando o card é fechado */
  onClose?: () => void;
};

// -------------------- Configurações --------------------

const STATUS_LABEL: Record<LinkStatus, string> = {
  up: 'Operacional',
  down: 'Inoperante',
  degraded: 'Degradado',
  unknown: 'Desconhecido',
};

const STATUS_TONE: Record<LinkStatus, { text: string; chip: string; theme: ColorTheme }> = {
  up: { text: 'text-green-700', chip: 'bg-green-100 text-green-800 border-green-200', theme: 'green' },
  degraded: { text: 'text-yellow-700', chip: 'bg-yellow-100 text-yellow-800 border-yellow-200', theme: 'yellow' },
  down: { text: 'text-red-700', chip: 'bg-red-100 text-red-800 border-red-200', theme: 'red' },
  unknown: { text: 'text-slate-700', chip: 'bg-slate-100 text-slate-800 border-slate-200', theme: 'gray' },
};

const LINK_TYPE_ICONS: Record<LinkType, string> = {
  fiber: '🔆',
  copper: '🔌',
  wireless: '📶',
  backbone: '🔗',
  unknown: '❓',
};

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  fiber: 'Fibra Óptica',
  copper: 'Cobre',
  wireless: 'Wireless',
  backbone: 'Backbone',
  unknown: 'Desconhecido',
};

// -------------------- Utilitários --------------------

function pct(v?: number): number | undefined {
  if (typeof v !== 'number' || !isFinite(v)) return undefined;
  return v <= 1 ? Math.round(v * 100) : Math.round(v);
}

function fmtLatency(v?: number): string {
  if (typeof v !== 'number' || !isFinite(v)) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(1)} s`;
  if (v >= 100) return `${Math.round(v)} ms`;
  return `${v.toFixed(1)} ms`;
}

function fmtLoss(p?: number): string {
  const pv = pct(p);
  return typeof pv === 'number' ? `${pv}%` : '—';
}

function fmtDistance(km?: number | null): string {
  if (km == null || !isFinite(km)) return '—';
  if (km < 0.001) return `${Math.round(km * 100000)} cm`;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(2)} km`;
  if (km < 1000) return `${Math.round(km)} km`;
  return `${(km / 1000).toFixed(1)} Mm`;
}

function fmtBandwidth(mbps?: number | null): string {
  if (mbps == null || !isFinite(mbps)) return '—';
  if (mbps >= 1_000_000) return `${(mbps / 1_000_000).toFixed(2)} Tbps`;
  if (mbps >= 1_000) return `${(mbps / 1_000).toFixed(2)} Gbps`;
  if (mbps >= 1) return `${Math.round(mbps)} Mbps`;
  return `${Math.round(mbps * 1000)} Kbps`;
}

function fmtThroughput(mbps?: number): string {
  if (mbps == null || !isFinite(mbps)) return '—';
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

function getMetricTheme(value?: number, thresholds = { warning: 70, critical: 85 }): ColorTheme {
  if (typeof value !== 'number') return 'gray';
  if (value >= thresholds.critical) return 'red';
  if (value >= thresholds.warning) return 'yellow';
  return 'green';
}

function getLossTheme(lossPct?: number): ColorTheme {
  if (typeof lossPct !== 'number') return 'gray';
  if (lossPct >= 5) return 'red';
  if (lossPct >= 1) return 'yellow';
  return 'green';
}

function getLatencyTheme(latencyMs?: number): ColorTheme {
  if (typeof latencyMs !== 'number') return 'gray';
  if (latencyMs >= 500) return 'red';
  if (latencyMs >= 100) return 'yellow';
  return 'green';
}

function KeyValue({
  k,
  v,
  help,
  className = '',
}: {
  k: string;
  v: React.ReactNode;
  help?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${className}`}>
      <div className="text-xs text-slate-500 flex-shrink-0" title={help}>
        {k}
      </div>
      <div
        className="text-xs font-medium text-slate-900 truncate text-right max-w-[60%] font-mono"
        title={String(v)}
      >
        {v}
      </div>
    </div>
  );
}

// -------------------- Componente principal --------------------

export default function LinkInfoCard({
  link,
  className = '',
  onFocusLink,
  onFocusNode,
  onAction,
  compact = false,
  expanded = false,
  onClose,
}: Props) {
  const [metaExpanded, setMetaExpanded] = useState(expanded);
  const [actionsExpanded, setActionsExpanded] = useState(false);

  const nodesById = useTopologyStore((s) => s.nodesById);

  const status: LinkStatus = link.status ?? 'unknown';
  const statusLabel = STATUS_LABEL[status];
  const tone = STATUS_TONE[status];
  const linkType = link.fiber ? 'fiber' : (link.type ?? 'unknown');
  const linkIcon = LINK_TYPE_ICONS[linkType];
  const linkTypeLabel = LINK_TYPE_LABELS[linkType];

  // Endpoints com nomes legíveis e status
  const endpoints = useMemo(() => {
    const a = nodesById[link.source];
    const b = nodesById[link.target];
    return {
      a: {
        id: link.source,
        name: a?.name || link.source,
        status: a?.status,
        type: a?.type,
        hasCoords: Number.isFinite(a?.lat) && Number.isFinite(a?.lon),
      },
      b: {
        id: link.target,
        name: b?.name || link.target,
        status: b?.status,
        type: b?.type,
        hasCoords: Number.isFinite(b?.lat) && Number.isFinite(b?.lon),
      },
    };
  }, [link.source, link.target, nodesById]);

  // Métricas do link
  const utilPct = pct(link.utilization);
  const latencyMs = link.latency;
  const lossPct = pct(link.packetLoss);

  // Throughput calculado (se disponível)
  const throughputMbps = useMemo(() => {
    if (typeof link.utilization === 'number' && typeof link.bandwidth === 'number') {
      return link.utilization * link.bandwidth;
    }
    return undefined;
  }, [link.utilization, link.bandwidth]);

  // Históricos opcionais
  const utilHistory = (link.meta?.utilHistory as number[] | undefined) ?? undefined;
  const latencyHistory = (link.meta?.latencyHistory as number[] | undefined) ?? undefined;
  const lossHistory = (link.meta?.lossHistory as number[] | undefined) ?? undefined;
  const throughputHistory = (link.meta?.throughputHistory as number[] | undefined) ?? undefined;

  const handleFocusLink = useCallback(() => {
    onFocusLink?.(link.id);
    topologyActions.setSelectedLink(link.id);
  }, [onFocusLink, link.id]);

  const handleFocusNode = useCallback(
    (id: string) => {
      onFocusNode?.(id);
      topologyActions.setSelectedNode(id);
    },
    [onFocusNode]
  );

  const runAction = useCallback(
    (type: 'refresh' | 'test-latency' | 'test-throughput' | 'open-details' | 'qos' | 'monitoring') => {
      onAction?.(type, link);
    },
    [onAction, link]
  );

  const copyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link.id);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = link.id;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }, [link.id]);

  const copyPath = useCallback(async () => {
    const path = `${endpoints.a.name} ↔ ${endpoints.b.name}`;
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = path;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }, [endpoints.a.name, endpoints.b.name]);

  if (compact) {
    return (
      <div className={`p-3 bg-white border border-slate-200 rounded-lg ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm">{linkIcon}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900 truncate">Link {link.id}</div>
              <div className="text-xs text-slate-500 truncate">
                {endpoints.a.name} ↔ {endpoints.b.name}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusIndicator
              status={
                status === 'up' ? 'success' : status === 'down' ? 'error' : status === 'degraded' ? 'warning' : 'neutral'
              }
              size="sm"
            />
            <button
              onClick={handleFocusLink}
              className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
              title="Focar no mapa"
            >
              👁️
            </button>
          </div>
        </div>

        {/* KPIs compactos */}
        <div className="mt-2 grid grid-cols-3 gap-1">
          <div className="text-center">
            <div className="text-xs text-slate-500">Util</div>
            <div className="text-sm font-semibold text-slate-900">
              {typeof utilPct === 'number' ? `${utilPct}%` : '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">Lat</div>
            <div className="text-sm font-semibold text-slate-900">{fmtLatency(latencyMs)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">Loss</div>
            <div className="text-sm font-semibold text-slate-900">{fmtLoss(link.packetLoss)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={['bg-white border border-slate-200 rounded-xl shadow-sm', 'relative', className].join(' ')}
      data-testid="link-info-card"
    >
      {/* Botão de fechar (se fornecido) */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
          title="Fechar"
        >
          ×
        </button>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{linkIcon}</span>
              <h3 className="text-lg font-semibold text-slate-900 truncate">Link {link.id}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium border ${tone.chip}`}>{statusLabel}</span>
              {link.fiber && (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                  🔆 Fibra
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{link.id}</span>
                <button onClick={copyId} className="text-slate-400 hover:text-slate-600" title="Copiar ID">
                  📋
                </button>
              </span>

              <span>•</span>
              <span>{linkTypeLabel}</span>

              {link.tags && link.tags.length > 0 && (
                <>
                  <span>•</span>
                  <span className="truncate">
                    Tags: {link.tags.slice(0, 2).join(', ')}
                    {link.tags.length > 2 && ` +${link.tags.length - 2}`}
                  </span>
                </>
              )}
            </div>
          </div>

          <StatusIndicator
            status={
              status === 'up' ? 'success' : status === 'down' ? 'error' : status === 'degraded' ? 'warning' : 'neutral'
            }
            size="lg"
            pulse={status === 'degraded'}
          />
        </div>

        {/* Endpoints com mais informações */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Origem</div>
              <div className="flex items-center gap-1">
                <StatusIndicator
                  status={
                    endpoints.a.status === 'up'
                      ? 'success'
                      : endpoints.a.status === 'down'
                      ? 'error'
                      : endpoints.a.status === 'degraded'
                      ? 'warning'
                      : 'neutral'
                  }
                  size="sm"
                />
                <button
                  onClick={() => handleFocusNode(endpoints.a.id)}
                  className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={endpoints.a.hasCoords ? 'Focar origem' : 'Nó sem coordenadas'}
                  disabled={!endpoints.a.hasCoords}
                >
                  {endpoints.a.hasCoords ? '👁️' : '📍'}
                </button>
              </div>
            </div>
            <div className="text-sm font-medium text-slate-900 truncate">{endpoints.a.name}</div>
            <div className="text-xs text-slate-500 mt-1">
              {endpoints.a.type || 'unknown'} • {endpoints.a.id}
            </div>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Destino</div>
              <div className="flex items-center gap-1">
                <StatusIndicator
                  status={
                    endpoints.b.status === 'up'
                      ? 'success'
                      : endpoints.b.status === 'down'
                      ? 'error'
                      : endpoints.b.status === 'degraded'
                      ? 'warning'
                      : 'neutral'
                  }
                  size="sm"
                />
                <button
                  onClick={() => handleFocusNode(endpoints.b.id)}
                  className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={endpoints.b.hasCoords ? 'Focar destino' : 'Nó sem coordenadas'}
                  disabled={!endpoints.b.hasCoords}
                >
                  {endpoints.b.hasCoords ? '👁️' : '📍'}
                </button>
              </div>
            </div>
            <div className="text-sm font-medium text-slate-900 truncate">{endpoints.b.name}</div>
            <div className="text-xs text-slate-500 mt-1">
              {endpoints.b.type || 'unknown'} • {endpoints.b.id}
            </div>
          </div>
        </div>

        {/* KPIs principais */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Status" value={statusLabel} color={tone.theme} size="sm" className="bg-slate-50" />
          <KpiCard label="Utilização" value={typeof utilPct === 'number' ? `${utilPct}%` : '—'} color={getMetricTheme(utilPct)} size="sm" />
          <KpiCard label="Latência" value={fmtLatency(latencyMs)} color={getLatencyTheme(latencyMs)} size="sm" />
          <KpiCard label="Perda" value={fmtLoss(link.packetLoss)} color={getLossTheme(lossPct)} size="sm" />
        </div>

        {/* Métricas detalhadas */}
        <MetricGroup className="mt-4" title="Desempenho do Link">
          <div className="space-y-3">
            <MetricBar
              label="Utilização da Capacidade"
              value={utilPct}
              theme={getMetricTheme(utilPct)}
              size="md"
              help="Percentual da capacidade total em uso"
            />

            <MetricBar
              label="Perda de Pacotes"
              value={lossPct}
              theme={getLossTheme(lossPct)}
              size="md"
              help="Percentual de pacotes perdidos"
            />

            {/* Throughput atual */}
            {throughputMbps !== undefined && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-600">Throughput Atual</span>
                  <span className="font-semibold text-slate-900">{fmtThroughput(throughputMbps)}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {link.bandwidth ? `de ${fmtBandwidth(link.bandwidth)} capacidade` : 'capacidade não especificada'}
                </div>
              </div>
            )}

            {/* Sparklines para histórico */}
            {(utilHistory || latencyHistory || lossHistory || throughputHistory) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
                {utilHistory && (
                  <SparklineWithValue
                    data={utilHistory}
                    currentValue={utilPct}
                    formatValue={(v) => `${Math.round(v)}%`}
                    color={getMetricTheme(utilPct)}
                    smooth
                    showArea
                    ariaLabel="Histórico de Utilização"
                  />
                )}
                {latencyHistory && (
                  <SparklineWithValue
                    data={latencyHistory}
                    currentValue={latencyMs}
                    formatValue={(v) => fmtLatency(v)}
                    color={getLatencyTheme(latencyMs)}
                    smooth
                    showArea
                    ariaLabel="Histórico de Latência"
                  />
                )}
                {lossHistory && (
                  <SparklineWithValue
                    data={lossHistory?.map((x) => (x <= 1 ? x * 100 : x))}
                    currentValue={lossPct}
                    formatValue={(v) => `${Math.round(v)}%`}
                    color={getLossTheme(lossPct)}
                    smooth
                    showArea
                    ariaLabel="Histórico de Perda"
                  />
                )}
                {throughputHistory && (
                  <SparklineWithValue
                    data={throughputHistory}
                    currentValue={throughputMbps}
                    formatValue={(v) => fmtThroughput(v)}
                    color="purple"
                    smooth
                    showArea
                    ariaLabel="Histórico de Throughput"
                  />
                )}
              </div>
            )}
          </div>
        </MetricGroup>

        {/* Informações técnicas */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Especificações do link */}
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-sm font-semibold text-slate-900 mb-3">Especificações</div>
            <div className="space-y-2">
              <KeyValue k="Tipo" v={linkTypeLabel} />
              <KeyValue k="Capacidade" v={fmtBandwidth(link.bandwidth ?? null)} />
              <KeyValue k="Distância" v={fmtDistance(link.distanceKm ?? null)} />
              <KeyValue k="Fibra Óptica" v={link.fiber ? 'Sim' : 'Não'} />
              <KeyValue k="Última Atualização" v={link.updatedAt ? new Date(link.updatedAt).toLocaleString() : '—'} />
              <KeyValue k="Criado em" v={link.createdAt ? new Date(link.createdAt).toLocaleString() : '—'} />
            </div>
          </div>

          {/* Metadados e tags */}
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-sm font-semibold text-slate-900 mb-3 flex items-center justify-between">
              <span>Metadados</span>
              {link.meta && (
                <button
                  onClick={() => setMetaExpanded((v) => !v)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  {metaExpanded ? 'Ocultar' : 'Expandir'}
                </button>
              )}
            </div>

            {/* Tags */}
            {link.tags && link.tags.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-slate-500 mb-2">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {link.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded-full bg-white border border-slate-300 text-slate-700 text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Metadados */}
            <div className="space-y-2 max-h-48 overflow-auto pr-1 custom-scroll">
              {link.meta ? (
                <>
                  {Object.entries(link.meta)
                    .filter(
                      ([key]) =>
                        !['utilHistory', 'latencyHistory', 'lossHistory', 'throughputHistory'].includes(key)
                    )
                    .slice(0, metaExpanded ? undefined : 5)
                    .map(([key, value]) => (
                      <KeyValue
                        key={key}
                        k={key}
                        v={
                          typeof value === 'object'
                            ? JSON.stringify(value, null, 2).slice(0, 100) +
                              (JSON.stringify(value).length > 100 ? '…' : '')
                            : String(value)
                        }
                      />
                    ))}
                  {!metaExpanded && Object.keys(link.meta).length > 5 && (
                    <div className="text-xs text-slate-500 text-center py-1">
                      +{Object.keys(link.meta).length - 5} mais...
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-slate-500 text-center py-2">Sem metadados adicionais</div>
              )}
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-900">Ações</div>
            <button
              onClick={() => setActionsExpanded(!actionsExpanded)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              {actionsExpanded ? 'Menos' : 'Mais'} opções
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Ações principais */}
            <button
              onClick={handleFocusLink}
              className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors"
              title="Centralizar no mapa"
            >
              👁️ Focar Link
            </button>
            <button
              onClick={copyPath}
              className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors"
              title="Copiar caminho"
            >
              📋 Caminho
            </button>
            <button
              onClick={() => runAction('refresh')}
              className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors"
              title="Forçar atualização"
            >
              🔄 Atualizar
            </button>

            {/* Ações expandidas */}
            {actionsExpanded && (
              <>
                <button
                  onClick={() => runAction('test-latency')}
                  className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors"
                  title="Teste de latência"
                >
                  🕒 Testar Latência
                </button>
                <button
                  onClick={() => runAction('test-throughput')}
                  className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors"
                  title="Teste de throughput"
                >
                  🚀 Testar Throughput
                </button>
                <button
                  onClick={() => runAction('qos')}
                  className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors"
                  title="Configurar QoS"
                >
                  ⚙️ QoS
                </button>
                <button
                  onClick={() => runAction('monitoring')}
                  className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-2 transition-colors"
                  title="Abrir monitoramento"
                >
                  📈 Monitorar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------- Componentes relacionados --------------------

/**
 * Card de link para uso em listas/grids
 */
export function LinkCard({
  link,
  onSelect,
  onFocus,
  className = '',
}: {
  link: TopologyLink;
  onSelect?: (link: TopologyLink) => void;
  onFocus?: (linkId: string) => void;
  className?: string;
}) {
  const nodesById = useTopologyStore((s) => s.nodesById);

  const status: LinkStatus = link.status ?? 'unknown';
  const linkIcon = LINK_TYPE_ICONS[link.fiber ? 'fiber' : (link.type ?? 'unknown')];

  const endpoints = useMemo(() => {
    const a = nodesById[link.source];
    const b = nodesById[link.target];
    return {
      a: a?.name || link.source,
      b: b?.name || link.target,
    };
  }, [link.source, link.target, nodesById]);

  const utilPct = pct(link.utilization);
  const latencyMs = link.latency;

  return (
    <div
      className={`p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer ${className}`}
      onClick={() => onSelect?.(link)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{linkIcon}</span>
          <div className="min-w-0">
            <div className="font-medium text-slate-900 truncate">
              {endpoints.a} ↔ {endpoints.b}
            </div>
            <div className="text-xs text-slate-500 truncate">{link.fiber ? 'Fibra' : link.type || 'unknown'} • {link.id}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusIndicator
            status={status === 'up' ? 'success' : status === 'down' ? 'error' : status === 'degraded' ? 'warning' : 'neutral'}
            size="sm"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFocus?.(link.id);
            }}
            className="text-xs p-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
            title="Focar no mapa"
          >
            👁️
          </button>
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="text-xs text-slate-500">Util</div>
          <div className="text-sm font-semibold text-slate-900">
            {typeof utilPct === 'number' ? `${utilPct}%` : '—'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-500">Lat</div>
          <div className="text-sm font-semibold text-slate-900">{fmtLatency(latencyMs)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-500">Cap</div>
          <div className="text-sm font-semibold text-slate-900">{fmtBandwidth(link.bandwidth ?? null)}</div>
        </div>
      </div>

      {/* Tags (se houver) */}
      {link.tags && link.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {link.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]">
              {tag}
            </span>
          ))}
          {link.tags.length > 2 && <span className="text-[10px] text-slate-400">+{link.tags.length - 2}</span>}
        </div>
      )}
    </div>
  );
}
