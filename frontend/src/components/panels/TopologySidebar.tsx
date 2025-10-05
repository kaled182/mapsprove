// frontend/src/components/panels/TopologySidebar.tsx
import React, { useMemo, useState, useCallback } from 'react';
import TopologyFilters, { ActiveFiltersBadge } from '@/components/topology/TopologyFilters';
import {
  useSelection,
  useTopologyStats,
  useProblemNodes,
  useProblemLinks,
  topologyActions,
  type TopologyNode,
  type TopologyLink,
} from '@/store/topology';

// ------- Tipagem do módulo de alertas (opcional) -------
type AlertsApi = {
  criticalAlerts: Array<{ id: string; level: 'critical' | 'warn' | 'info'; message: string; host?: string; createdAt: number }>;
  alerts: Array<{ id: string; level: 'critical' | 'warn' | 'info'; message: string; host?: string; createdAt: number }>;
  clearAlerts?: () => void;
};

// Importação segura do hook de alertas
let useAlertsStream: undefined | (() => AlertsApi);
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useAlertsStream = require('@/hooks/useStatusStream').useAlertsStream;
} catch {
  useAlertsStream = undefined;
}

type Props = {
  className?: string;
  compactFilters?: boolean;
  showAdvancedFilters?: boolean;
  collapsibleFilters?: boolean;
  showAlertsSection?: boolean;
  showProblemsSection?: boolean;
  onFocusNode?: (nodeId: string) => void;
  onFocusLink?: (linkId: string) => void;
  onFitToData?: () => void;
  onResetView?: () => void;
  onExportMap?: () => void;
  /** Callback quando sidebar é expandida/recolhida */
  onToggle?: (expanded: boolean) => void;
};

type SidebarTab = 'filters' | 'alerts' | 'problems' | 'details';

// -------------------- UI utilitários --------------------

function CountBadge({ count, color = 'blue' }: { count: number; color?: 'red' | 'blue' | 'green' | 'yellow' }) {
  if (count === 0) return null;

  const colorClasses = {
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${colorClasses[color]}`}>
      {count}
    </span>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-3 px-4 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center">
          <span>{title}</span>
          {badge}
        </div>
        <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {isOpen && <div className="pb-3">{children}</div>}
    </div>
  );
}

// -------------------- Sidebar --------------------

export default function TopologySidebar({
  className,
  compactFilters = false,
  showAdvancedFilters = true,
  collapsibleFilters = false,
  showAlertsSection = true,
  showProblemsSection = true,
  onFocusNode,
  onFocusLink,
  onFitToData,
  onResetView,
  onExportMap,
  onToggle,
}: Props) {
  const { node, link } = useSelection();
  const stats = useTopologyStats();
  const problemNodes = useProblemNodes();
  const problemLinks = useProblemLinks();
  const alertsApi = useAlertsStream?.();

  const [activeTab, setActiveTab] = useState<SidebarTab>('filters');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Estatísticas calculadas
  const criticalCount = alertsApi ? alertsApi.criticalAlerts.length : 0;
  const problemNodesCount = problemNodes.length;
  const problemLinksCount = problemLinks.length;

  const handleToggleCollapse = useCallback(() => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onToggle?.(newState);
  }, [isCollapsed, onToggle]);

  const tabs = useMemo(() => {
    const items: Array<{
      id: SidebarTab;
      label: string;
      icon: string;
      badge?: React.ReactNode;
    }> = [
      { id: 'filters', label: 'Filtros', icon: '⚡' },
      { id: 'details', label: 'Detalhes', icon: '📋' },
    ];

    if (showAlertsSection) {
      items.push({
        id: 'alerts',
        label: 'Alertas',
        icon: '🚨',
        badge: <CountBadge count={criticalCount} color="red" />,
      });
    }

    if (showProblemsSection) {
      items.push({
        id: 'problems',
        label: 'Problemas',
        icon: '⚠️',
        badge: <CountBadge count={problemNodesCount + problemLinksCount} color="yellow" />,
      });
    }

    return items;
  }, [showAlertsSection, showProblemsSection, criticalCount, problemNodesCount, problemLinksCount]);

  if (isCollapsed) {
    return (
      <aside
        className={[
          'h-full w-12 bg-slate-50 border-l border-slate-200 flex flex-col items-center py-4',
          className || '',
        ].join(' ')}
      >
        <button
          onClick={handleToggleCollapse}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors"
          title="Expandir painel"
        >
          ▶
        </button>

        {/* Ícones de navegação vertical */}
        <div className="mt-4 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsCollapsed(false);
              }}
              className={`p-2 rounded transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
              title={tab.label}
            >
              {tab.icon}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={[
        'h-full w-full max-w-[400px] bg-slate-50 border-l border-slate-200 flex flex-col shadow-lg',
        className || '',
      ].join(' ')}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Topologia da Rede</h2>
            <button
              onClick={handleToggleCollapse}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
              title="Recolher painel"
            >
              ◀
            </button>
          </div>
          <ActiveFiltersBadge />
        </div>

        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="text-center">
            <div className="font-semibold text-slate-900">{stats.totalNodes}</div>
            <div className="text-slate-500">Nós</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-slate-900">{stats.totalLinks}</div>
            <div className="text-slate-500">Links</div>
          </div>
          <div className="text-center">
            <div className={`font-semibold ${criticalCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {criticalCount}
            </div>
            <div className="text-slate-500">Críticos</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center py-2 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
              {tab.badge}
            </button>
          ))}
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={onFitToData}
            className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
            title="Ajustar visão aos dados"
          >
            🗺️ Ajustar
          </button>
          <button
            onClick={onResetView}
            className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
            title="Resetar visão"
          >
            🏠 Resetar
          </button>
          <button
            onClick={onExportMap}
            className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
            title="Exportar mapa como imagem"
          >
            📸 Exportar
          </button>
          {(node || link) && (
            <button
              onClick={() => topologyActions.clearSelection()}
              className="ml-auto text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
              title="Limpar seleção"
            >
              ✕ Limpar
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          {activeTab === 'filters' && (
            <div className="p-3">
              <TopologyFilters compact={compactFilters} showAdvanced={showAdvancedFilters} collapsible={collapsibleFilters} />
            </div>
          )}

          {activeTab === 'alerts' && showAlertsSection && <AlertsSection alertsApi={alertsApi} />}

          {activeTab === 'problems' && showProblemsSection && (
            <ProblemsSection
              problemNodes={problemNodes}
              problemLinks={problemLinks}
              onFocusNode={onFocusNode}
              onFocusLink={onFocusLink}
            />
          )}

          {activeTab === 'details' && (
            <SelectedDetails node={node} link={link} onFocusNode={onFocusNode} onFocusLink={onFocusLink} />
          )}
        </div>
      </div>
    </aside>
  );
}

// -------------------- Seção de Alertas --------------------

function AlertsSection({ alertsApi }: { alertsApi?: AlertsApi }) {
  if (!alertsApi) {
    return (
      <div className="p-4 text-center">
        <div className="text-slate-400 text-sm">Módulo de alertas não disponível</div>
      </div>
    );
  }

  const { alerts, criticalAlerts, clearAlerts } = alertsApi;

  if (alerts.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="text-slate-400 text-sm">Nenhum alerta no momento</div>
        <div className="text-slate-400 text-xs mt-1">Tudo operando normalmente</div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-900">Alertas ({alerts.length})</div>
        {clearAlerts && (
          <button onClick={clearAlerts} className="text-xs text-slate-500 hover:text-slate-700 underline">
            Limpar todos
          </button>
        )}
      </div>

      <div className="space-y-2">
        {criticalAlerts.map((alert) => (
          <AlertItem key={alert.id} alert={alert} level="critical" />
        ))}
        {alerts
          .filter((alert) => !criticalAlerts.some((ca) => ca.id === alert.id))
          .map((alert) => (
            <AlertItem key={alert.id} alert={alert} level={alert.level as 'critical' | 'warn' | 'info'} />
          ))}
      </div>
    </div>
  );
}

function AlertItem({ alert, level }: { alert: any; level: 'critical' | 'warn' | 'info' }) {
  const levelConfig = {
    critical: { color: 'bg-red-100 border-red-300', text: 'text-red-800', icon: '🔴' },
    warn: { color: 'bg-yellow-100 border-yellow-300', text: 'text-yellow-800', icon: '🟡' },
    info: { color: 'bg-blue-100 border-blue-300', text: 'text-blue-800', icon: '🔵' },
  } as const;

  const config = levelConfig[level];

  return (
    <div className={`p-3 rounded-lg border ${config.color} ${config.text}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm">{config.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{alert.message}</div>
          <div className="mt-1 text-xs opacity-80">
            {alert.host && `Host: ${alert.host} • `}
            {new Date(alert.createdAt).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------- Seção de Problemas --------------------

function ProblemsSection({
  problemNodes,
  problemLinks,
  onFocusNode,
  onFocusLink,
}: {
  problemNodes: TopologyNode[];
  problemLinks: TopologyLink[];
  onFocusNode?: (id: string) => void;
  onFocusLink?: (id: string) => void;
}) {
  const totalProblems = problemNodes.length + problemLinks.length;

  if (totalProblems === 0) {
    return (
      <div className="p-4 text-center">
        <div className="text-green-600 text-sm">✅ Sem problemas detectados</div>
        <div className="text-slate-400 text-xs mt-1">Toda a infraestrutura está operacional</div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="rounded-lg bg-red-50 p-2">
          <div className="font-semibold text-red-700">{problemNodes.length}</div>
          <div className="text-xs text-red-600">Nós com problema</div>
        </div>
        <div className="rounded-lg bg-yellow-50 p-2">
          <div className="font-semibold text-yellow-700">{problemLinks.length}</div>
          <div className="text-xs text-yellow-600">Links com problema</div>
        </div>
      </div>

      {/* Nós com problemas */}
      {problemNodes.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-slate-900">Nós com problemas</div>
          <div className="space-y-2">
            {problemNodes.slice(0, 10).map((node) => (
              <ProblemItem key={node.id} type="node" item={node} onFocus={() => onFocusNode?.(node.id)} />
            ))}
            {problemNodes.length > 10 && (
              <div className="text-center text-xs text-slate-500">+{problemNodes.length - 10} nós com problemas</div>
            )}
          </div>
        </div>
      )}

      {/* Links com problemas */}
      {problemLinks.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-slate-900">Links com problemas</div>
          <div className="space-y-2">
            {problemLinks.slice(0, 10).map((link) => (
              <ProblemItem key={link.id} type="link" item={link} onFocus={() => onFocusLink?.(link.id)} />
            ))}
            {problemLinks.length > 10 && (
              <div className="text-center text-xs text-slate-500">+{problemLinks.length - 10} links com problemas</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProblemItem({
  type,
  item,
  onFocus,
}: {
  type: 'node' | 'link';
  item: TopologyNode | TopologyLink;
  onFocus: () => void;
}) {
  const isNode = type === 'node';
  const node = isNode ? (item as TopologyNode) : null;
  const link = !isNode ? (item as TopologyLink) : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 transition-colors hover:border-slate-300">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">
            {isNode ? node!.name || node!.id : `Link: ${link!.id}`}
          </div>
          <div className="text-xs text-slate-500">
            {isNode ? `Status: ${node!.status} • Tipo: ${node!.type || 'unknown'}` : `De: ${link!.source} → Para: ${link!.target}`}
          </div>
        </div>
        <button
          onClick={onFocus}
          className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs transition-colors hover:bg-slate-50"
          title="Focar no mapa"
        >
          👁️
        </button>
      </div>
    </div>
  );
}

// -------------------- Detalhes selecionados --------------------

function SelectedDetails({
  node,
  link,
  onFocusNode,
  onFocusLink,
}: {
  node?: TopologyNode;
  link?: TopologyLink;
  onFocusNode?: (id: string) => void;
  onFocusLink?: (id: string) => void;
}) {
  if (!node && !link) {
    return (
      <div className="p-6 text-center">
        <div className="text-slate-400 text-sm">Nenhum item selecionado</div>
        <div className="mt-2 text-xs text-slate-400">Clique em um nó ou link no mapa para ver detalhes</div>
        <div className="mt-4 text-4xl text-slate-300">🎯</div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200">
      {node && <NodeInfoCard node={node} onFocusNode={onFocusNode} />}
      {link && <LinkInfoCard link={link} onFocusLink={onFocusLink} />}
    </div>
  );
}

/**
 * Implementações simples para NodeInfoCard e LinkInfoCard.
 * Se você já tem componentes prontos no projeto, substitua por imports.
 */
function ProgressBar({ value = 0, label }: { value?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="w-full">
      {label && <div className="mb-1 text-xs text-slate-600">{label}</div>}
      <div className="h-2 w-full rounded bg-slate-200">
        <div className="h-2 rounded bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NodeInfoCard({ node, onFocusNode }: { node: TopologyNode; onFocusNode?: (id: string) => void }) {
  const cpu = node.metrics?.cpu ?? undefined;
  const mem = node.metrics?.memory ?? undefined;

  return (
    <div className="p-4 bg-white">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{node.name || node.id}</div>
          <div className="text-xs text-slate-500">
            Status: <span className="font-medium">{node.status ?? 'unknown'}</span> • Tipo:{' '}
            <span className="font-medium">{node.type ?? 'unknown'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onFocusNode?.(node.id)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
          >
            Focar
          </button>
          <button
            onClick={() => topologyActions.setSelectedNode(null)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {typeof cpu === 'number' && <ProgressBar value={cpu} label="CPU" />}
        {typeof mem === 'number' && <ProgressBar value={mem} label="Memória" />}
      </div>

      {node.tags && node.tags.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium text-slate-700">Tags</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {node.tags.map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LinkInfoCard({ link, onFocusLink }: { link: TopologyLink; onFocusLink?: (id: string) => void }) {
  const utilizationPct = typeof link.utilization === 'number' ? Math.round(link.utilization * 100) : undefined;

  return (
    <div className="p-4 bg-white">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Link: {link.id}</div>
          <div className="text-xs text-slate-500">
            {link.source} → {link.target} • Status:{' '}
            <span className="font-medium">{link.status ?? 'unknown'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onFocusLink?.(link.id)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
          >
            Focar
          </button>
          <button
            onClick={() => topologyActions.setSelectedLink(null)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {typeof utilizationPct === 'number' && <ProgressBar value={utilizationPct} label="Utilização" />}
        {typeof link.latency === 'number' && (
          <div className="text-xs text-slate-600">
            Latência: <span className="font-medium">{link.latency} ms</span>
          </div>
        )}
        {typeof link.packetLoss === 'number' && (
          <div className="text-xs text-slate-600">
            Perda: <span className="font-medium">{Math.round(link.packetLoss * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------- Hook para controle do sidebar --------------------

export function useTopologySidebar() {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);
  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);

  return { isExpanded, toggle, expand, collapse };
}
