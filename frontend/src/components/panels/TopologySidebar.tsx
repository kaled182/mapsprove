// frontend/src/components/panels/TopologySidebar.tsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
import NodeInfoCard from './NodeInfoCard';
import LinkInfoCard from './LinkInfoCard';

// ====================== Importação segura do hook de alertas ======================
type AlertLevel = 'critical' | 'warn' | 'info' | string;
type AlertItemShape = {
  id: string;
  message: string;
  level?: AlertLevel;
  host?: string;
  createdAt?: number | string | Date;
};

type AlertsApi =
  | {
      connected: boolean;
      status: 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'paused';
      alerts: AlertItemShape[];
      criticalAlerts: AlertItemShape[];
      clearAlerts?: () => void;
    }
  | undefined;

let _useAlertsStream: undefined | (() => AlertsApi);
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _useAlertsStream = require('@/hooks/useStatusStream').useAlertsStream;
} catch {
  _useAlertsStream = undefined;
}

// ====================== Tipos ======================
type Props = {
  className?: string;
  /** Compacta os controles dos filtros */
  compactFilters?: boolean;
  /** Exibe seções avançadas nos filtros */
  showAdvancedFilters?: boolean;
  /** Filtros podem ser colapsados internamente */
  collapsibleFilters?: boolean;
  /** Mostra a aba de alertas */
  showAlertsSection?: boolean;
  /** Mostra a aba de problemas (nós/links problemáticos) */
  showProblemsSection?: boolean;
  /** Focar nó no mapa */
  onFocusNode?: (nodeId: string) => void;
  /** Focar link no mapa */
  onFocusLink?: (linkId: string) => void;
  /** Ajustar visão do mapa aos dados */
  onFitToData?: () => void;
  /** Resetar visão do mapa */
  onResetView?: () => void;
  /** Exportar o mapa */
  onExportMap?: () => void;
  /** Callback quando sidebar é expandida/recolhida (true = expandido) */
  onToggle?: (expanded: boolean) => void;
  /** Aba inicial */
  initialTab?: 'filters' | 'alerts' | 'problems' | 'details';
};

type SidebarTab = 'filters' | 'alerts' | 'problems' | 'details';

// ====================== UI: CountBadge / CollapsibleSection ======================
function CountBadge({
  count,
  color = 'blue',
  className = '',
}: {
  count: number;
  color?: 'red' | 'blue' | 'green' | 'yellow';
  className?: string;
}) {
  if (count === 0) return null;

  const colorClasses: Record<'red' | 'blue' | 'green' | 'yellow', string> = {
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span
      className={[
        'ml-2 px-2 py-0.5 rounded-full text-xs font-medium',
        colorClasses[color],
        className,
      ].join(' ')}
    >
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
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between py-3 px-4 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
        aria-expanded={isOpen}
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

// ====================== Componente principal ======================
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
  initialTab = 'filters',
}: Props) {
  const { node, link } = useSelection();
  const stats = useTopologyStats();
  const problemNodes = useProblemNodes();
  const problemLinks = useProblemLinks();
  const alertsApi: AlertsApi = _useAlertsStream?.();

  const [activeTab, setActiveTab] = useState<SidebarTab>(initialTab);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Acessibilidade: navegação por teclado nas tabs
  const tabsRef = useRef<HTMLDivElement>(null);

  // Contagens
  const criticalCount = alertsApi?.criticalAlerts.length ?? 0;
  const totalAlerts = alertsApi?.alerts.length ?? 0;
  const problemNodesCount = problemNodes.length;
  const problemLinksCount = problemLinks.length;

  const handleToggleCollapse = useCallback(() => {
    const newState = !isCollapsed; // newState => collapsed?
    setIsCollapsed(newState);
    // expanded = !collapsed
    onToggle?.(!newState);
  }, [isCollapsed, onToggle]);

  const tabs = useMemo(() => {
    const items: Array<{ id: SidebarTab; label: string; icon: string; badge?: React.ReactNode }> = [
      { id: 'filters', label: 'Filtros', icon: '⚡' },
      { id: 'details', label: 'Detalhes', icon: '📋' },
    ];

    if (showAlertsSection) {
      items.push({
        id: 'alerts',
        label: 'Alertas',
        icon: '🚨',
        badge: <CountBadge count={criticalCount || totalAlerts} color={criticalCount ? 'red' : 'yellow'} />,
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
  }, [showAlertsSection, showProblemsSection, criticalCount, totalAlerts, problemNodesCount, problemLinksCount]);

  // Keyboard nav (←/→) nas tabs
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const order = tabs.map((t) => t.id);
      const idx = order.indexOf(activeTab);
      if (idx < 0) return;
      const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % order.length : (idx - 1 + order.length) % order.length;
      setActiveTab(order[nextIdx]);
    };

    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [activeTab, tabs]);

  if (isCollapsed) {
    return (
      <aside
        className={[
          'h-full w-12 bg-slate-50 border-l border-slate-200 flex flex-col items-center py-4',
          className || '',
        ].join(' ')}
        data-testid="topology-sidebar-collapsed"
      >
        <button
          onClick={handleToggleCollapse}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors"
          title="Expandir painel"
          aria-label="Expandir painel"
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
                onToggle?.(true);
              }}
              className={`p-2 rounded transition-colors ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
              title={tab.label}
              aria-label={tab.label}
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
      aria-label="Painel lateral de topologia"
      data-testid="topology-sidebar"
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
              aria-label="Recolher painel"
            >
              ◀
            </button>
          </div>
          <ActiveFiltersBadge />
        </div>

        {/* Estatísticas rápidas */}
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
            <div className={`font-semibold ${criticalCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{criticalCount}</div>
            <div className="text-slate-500">Críticos</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white" role="tablist" aria-label="Navegação do painel" ref={tabsRef}>
        <div className="flex">
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex-1 flex items-center justify-center py-2 text-xs font-medium transition-colors outline-none',
                  selected ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                ].join(' ')}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
                {tab.badge}
              </button>
            );
          })}
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
            <ProblemsSection problemNodes={problemNodes} problemLinks={problemLinks} onFocusNode={onFocusNode} onFocusLink={onFocusLink} />
          )}

          {activeTab === 'details' && <SelectedDetails node={node} link={link} onFocusNode={onFocusNode} onFocusLink={onFocusLink} />}
        </div>
      </div>
    </aside>
  );
}

// ====================== Seção: Alertas ======================
function AlertsSection({ alertsApi }: { alertsApi: AlertsApi }) {
  if (!alertsApi) {
    return (
      <div className="p-4 text-center">
        <div className="text-slate-400 text-sm">Módulo de alertas não disponível</div>
      </div>
    );
  }

  const { alerts, criticalAlerts, clearAlerts, status, connected } = alertsApi;

  if ((alerts?.length ?? 0) === 0) {
    return (
      <div className="p-6 text-center">
        <div className="text-slate-400 text-sm">Nenhum alerta no momento</div>
        <div className="text-slate-400 text-xs mt-1">{connected ? 'Tudo operando normalmente' : `Status: ${status}`}</div>
      </div>
    );
  }

  const nonCritical = useMemo(
    () => alerts.filter((a) => !criticalAlerts.some((c) => c.id === a.id)),
    [alerts, criticalAlerts]
  );

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-2">
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
        {nonCritical.map((alert) => (
          <AlertItem key={alert.id} alert={alert} level={(alert.level as AlertLevel) ?? 'info'} />
        ))}
      </div>
    </div>
  );
}

function AlertItem({ alert, level }: { alert: AlertItemShape; level: 'critical' | 'warn' | 'info' }) {
  const levelConfig = {
    critical: { color: 'bg-red-100 border-red-300', text: 'text-red-800', icon: '🔴' },
    warn: { color: 'bg-yellow-100 border-yellow-300', text: 'text-yellow-800', icon: '🟡' },
    info: { color: 'bg-blue-100 border-blue-300', text: 'text-blue-800', icon: '🔵' },
  } as const;

  const cfg = levelConfig[level];
  const createdAt =
    alert.createdAt instanceof Date
      ? alert.createdAt
      : alert.createdAt
      ? new Date(alert.createdAt)
      : undefined;

  return (
    <div className={`p-3 rounded-lg border ${cfg.color} ${cfg.text}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium break-words">{alert.message}</div>
          <div className="text-xs opacity-80 mt-1">
            {alert.host && `Host: ${alert.host} • `}
            {createdAt ? createdAt.toLocaleString() : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================== Seção: Problemas ======================
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
      <div className="p-6 text-center">
        <div className="text-green-600 text-sm">✅ Sem problemas detectados</div>
        <div className="text-slate-400 text-xs mt-1">Toda a infraestrutura está operacional</div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="p-2 bg-red-50 rounded-lg">
          <div className="text-red-700 font-semibold">{problemNodes.length}</div>
          <div className="text-red-600 text-xs">Nós com problema</div>
        </div>
        <div className="p-2 bg-yellow-50 rounded-lg">
          <div className="text-yellow-700 font-semibold">{problemLinks.length}</div>
          <div className="text-yellow-600 text-xs">Links com problema</div>
        </div>
      </div>

      {/* Nós com problemas */}
      {problemNodes.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-900 mb-2">Nós com problemas</div>
          <div className="space-y-2">
            {problemNodes.slice(0, 10).map((n) => (
              <ProblemItem key={n.id} type="node" item={n} onFocus={() => onFocusNode?.(n.id)} />
            ))}
            {problemNodes.length > 10 && (
              <div className="text-xs text-slate-500 text-center">+{problemNodes.length - 10} nós com problemas</div>
            )}
          </div>
        </div>
      )}

      {/* Links com problemas */}
      {problemLinks.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-900 mb-2">Links com problemas</div>
          <div className="space-y-2">
            {problemLinks.slice(0, 10).map((l) => (
              <ProblemItem key={l.id} type="link" item={l} onFocus={() => onFocusLink?.(l.id)} />
            ))}
            {problemLinks.length > 10 && (
              <div className="text-xs text-slate-500 text-center">+{problemLinks.length - 10} links com problemas</div>
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
    <div className="p-2 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">{isNode ? node!.name || node!.id : `Link: ${link!.id}`}</div>
          <div className="text-xs text-slate-500">
            {isNode ? `Status: ${node!.status} • Tipo: ${node!.type || 'unknown'}` : `De: ${link!.source} → Para: ${link!.target}`}
          </div>
        </div>
        <button
          onClick={onFocus}
          className="ml-2 px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
          title="Focar no mapa"
          aria-label="Focar no mapa"
        >
          👁️
        </button>
      </div>
    </div>
  );
}

// ====================== Seção: Detalhes ======================
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
        <div className="text-slate-400 text-xs mt-2">Clique em um nó ou link no mapa para ver detalhes</div>
        <div className="mt-4 text-slate-300 text-4xl">🎯</div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200">
      {node && <NodeInfoCard node={node} onFocusNode={onFocusNode} />}
      {link && <LinkInfoCard link={link} onFocusLink={onFocusLink} onFocusNode={onFocusNode} />}
    </div>
  );
}

// ====================== Hook utilitário ======================
export function useTopologySidebar() {
  const [isExpanded, setIsExpanded] = useState(true);
  const toggle = useCallback(() => setIsExpanded((p) => !p), []);
  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);

  return { isExpanded, toggle, expand, collapse };
}
