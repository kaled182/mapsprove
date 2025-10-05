import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useFilters,
  useTopologyStats,
  topologyActions,
  type NodeStatus,
  type NodeType,
  type LinkType,
  type TopologyFilters as FiltersType,
} from '@/store/topology';

type Props = {
  className?: string;
  compact?: boolean;
  /** Callback quando filtros mudam */
  onFiltersChange?: (filters: FiltersType) => void;
  /** Mostrar seção de estatísticas expandida */
  showDetailedStats?: boolean;
  /** Mostrar controles avançados */
  showAdvanced?: boolean;
  /** Modo colapsável */
  collapsible?: boolean;
};

// ---------------------------------- constantes ----------------------------------

const NODE_STATUS: { value: NodeStatus; label: string; color: string }[] = [
  { value: 'up',       label: 'Operacional',  color: '#22c55e' },
  { value: 'degraded', label: 'Degradado',    color: '#f59e0b' },
  { value: 'down',     label: 'Inoperante',   color: '#ef4444' },
  { value: 'unknown',  label: 'Desconhecido', color: '#94a3b8' },
];

const NODE_TYPES: { value: NodeType; label: string; icon: string }[] = [
  { value: 'router',       label: 'Roteador',     icon: '🔄' },
  { value: 'switch',       label: 'Switch',       icon: '🔀' },
  { value: 'server',       label: 'Servidor',     icon: '🖥️' },
  { value: 'firewall',     label: 'Firewall',     icon: '🛡️' },
  { value: 'access-point', label: 'Access Point', icon: '📡' },
  { value: 'cpe',          label: 'CPE',          icon: '🏠' },
  { value: 'unknown',      label: 'Desconhecido', icon: '❓' },
];

const LINK_TYPES: { value: LinkType; label: string; icon: string }[] = [
  { value: 'fiber',    label: 'Fibra',    icon: '🔆' },
  { value: 'copper',   label: 'Cobre',    icon: '🔌' },
  { value: 'wireless', label: 'Wireless', icon: '📶' },
  { value: 'backbone', label: 'Backbone', icon: '🔗' },
  { value: 'unknown',  label: 'Desconhecido', icon: '❓' },
];

// ---------------------------------- componentes base ----------------------------------

function ToggleChip({
  active,
  onClick,
  children,
  title,
  color,
  icon,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  color?: string;
  icon?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 flex items-center gap-1.5',
        active
          ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm'
          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400',
      ].join(' ')}
    >
      {icon && <span className="text-xs">{icon}</span>}
      {color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
      <span>{children}</span>
      {count !== undefined && (
        <span
          className={[
            'px-1.5 py-0.5 rounded-full text-xs text-center',
            'min-w-[1.25rem]', // fix: Tailwind não possui min-w-5 por padrão
            active ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600',
          ].join(' ')}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2 text-sm font-medium text-slate-900 hover:text-slate-600"
      >
        <span>{title}</span>
        <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {isOpen && <div className="pb-3">{children}</div>}
    </div>
  );
}

// ---------------------------------- helpers ----------------------------------

function countActiveFilters(filters: FiltersType) {
  let count = 0;
  if (filters.statuses.size > 0) count++;
  if (filters.types.size > 0) count++;
  if (filters.text) count++;
  if (filters.fiberOnly) count++;
  if (filters.tags && filters.tags.length > 0) count++;
  if (filters.dateRange?.start || filters.dateRange?.end) count++;
  return count;
}

// ---------------------------------- componente principal ----------------------------------

export default function TopologyFilters({
  className,
  compact = false,
  onFiltersChange,
  showDetailedStats = false,
  showAdvanced = false,
  collapsible = false,
}: Props) {
  const filters = useFilters();
  const stats = useTopologyStats();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // estados locais
  const [text, setText] = useState(filters.text ?? '');
  const [tagsInput, setTagsInput] = useState((filters.tags || []).join(', '));
  const debounceRef = useRef<number | null>(null);

  // sync com store
  useEffect(() => {
    setText(filters.text ?? '');
    setTagsInput((filters.tags || []).join(', '));
  }, [filters.text, filters.tags]);

  // notificar mudanças
  useEffect(() => {
    onFiltersChange?.(filters);
  }, [filters, onFiltersChange]);

  // debounce busca texto
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      topologyActions.setTextFilter(text || undefined);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [text]);

  // handlers
  const toggleStatus = useCallback(
    (s: NodeStatus) => {
      const next = new Set(filters.statuses);
      next.has(s) ? next.delete(s) : next.add(s);
      topologyActions.setStatusesFilter(next);
    },
    [filters.statuses]
  );

  const toggleNodeType = useCallback(
    (t: NodeType) => {
      const next = new Set(filters.types);
      next.has(t) ? next.delete(t) : next.add(t);
      topologyActions.setTypesFilter(next);
    },
    [filters.types]
  );

  const toggleLinkType = useCallback(
    (t: LinkType) => {
      const next = new Set(filters.types);
      next.has(t) ? next.delete(t) : next.add(t);
      topologyActions.setTypesFilter(next);
    },
    [filters.types]
  );

  const handleTagsChange = useCallback((value: string) => {
    const tags = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    topologyActions.setTagsFilter(tags);
  }, []);

  const handleDateChange = useCallback(
    (which: 'start' | 'end', value: string) => {
      const current = filters.dateRange || {};
      const ts = value ? new Date(value).getTime() : undefined;
      topologyActions.setDateRangeFilter(which === 'start' ? ts : current.start, which === 'end' ? ts : current.end);
    },
    [filters.dateRange]
  );

  const clearDateRange = useCallback(() => {
    topologyActions.setDateRangeFilter(undefined, undefined);
  }, []);

  const startISO = useMemo(() => {
    const ts = filters.dateRange?.start;
    return ts ? new Date(ts).toISOString().slice(0, 16) : '';
  }, [filters.dateRange?.start]);

  const endISO = useMemo(() => {
    const ts = filters.dateRange?.end;
    return ts ? new Date(ts).toISOString().slice(0, 16) : '';
  }, [filters.dateRange?.end]);

  const filteredStats = useMemo(() => {
    const totalNodesFromStats = Object.values(stats.nodesByStatus).reduce((a, b) => a + b, 0);
    const totalLinksFromStats = Object.values(stats.linksByStatus).reduce((a, b) => a + b, 0);
    return {
      totalFilteredNodes: totalNodesFromStats,
      totalFilteredLinks: totalLinksFromStats,
      filteredPercentage: stats.totalNodes > 0 ? (totalNodesFromStats / stats.totalNodes) * 100 : 0,
    };
  }, [stats]);

  const renderSection = (title: string, children: React.ReactNode) =>
    collapsible ? (
      <CollapsibleSection title={title}>{children}</CollapsibleSection>
    ) : (
      <div className="mb-4 last:mb-0">
        <div className="text-sm font-medium text-slate-900 mb-2">{title}</div>
        {children}
      </div>
    );

  // cabeçalho colapsado
  if (isCollapsed && collapsible) {
    const activeCount = countActiveFilters(filters);
    return (
      <div className={['bg-white border border-slate-200 rounded-xl shadow-sm p-3', className || ''].join(' ')}>
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-full flex items-center justify-between text-sm font-medium text-slate-900"
        >
          <span>Filtros {activeCount > 0 ? `(${activeCount} ativos)` : ''}</span>
          <span>▶</span>
        </button>
      </div>
    );
  }

  // ---------------------------------- render ----------------------------------

  return (
    <aside className={['bg-white border border-slate-200 rounded-xl shadow-sm', compact ? 'p-3' : 'p-4', className || ''].join(' ')}>
      {/* header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold text-slate-900">Filtros da Topologia</h2>
            {collapsible && (
              <button onClick={() => setIsCollapsed(true)} className="text-slate-400 hover:text-slate-600" title="Recolher">
                ◀
              </button>
            )}
          </div>

          {showDetailedStats ? (
            <div className="space-y-1">
              <p className="text-xs text-slate-600">
                <strong>{stats.totalNodes}</strong> nós • <strong>{stats.totalLinks}</strong> links
              </p>
              <p className="text-xs text-slate-500">
                Mostrando {filteredStats.totalFilteredNodes} nós ({filteredStats.filteredPercentage.toFixed(1)}%)
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {stats.totalNodes} nós • {stats.totalLinks} links
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => topologyActions.clearFilters()}
            className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 transition-colors"
            title="Limpar todos os filtros"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* busca */}
      {renderSection(
        'Buscar',
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nome, ID, tags..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      )}

      {/* status */}
      {renderSection(
        'Status',
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {NODE_STATUS.map(({ value, label, color }) => (
              <ToggleChip
                key={value}
                active={filters.statuses.has(value)}
                onClick={() => toggleStatus(value)}
                title={label}
                color={color}
                count={stats.nodesByStatus[value] ?? 0}
              >
                {label}
              </ToggleChip>
            ))}
          </div>
        </div>
      )}

      {/* tipos de nó */}
      {renderSection(
        'Tipos de Nó',
        <div className="flex flex-wrap gap-1.5">
          {NODE_TYPES.map(({ value, label, icon }) => (
            <ToggleChip
              key={value}
              active={filters.types.has(value)}
              onClick={() => toggleNodeType(value)}
              title={label}
              icon={icon}
              count={stats.nodesByType[value] ?? 0}
            >
              {compact ? icon : label}
            </ToggleChip>
          ))}
        </div>
      )}

      {/* tipos de link */}
      {renderSection(
        'Tipos de Link',
        <div className="flex flex-wrap gap-1.5">
          {LINK_TYPES.map(({ value, label, icon }) => (
            <ToggleChip
              key={value}
              active={filters.types.has(value)}
              onClick={() => toggleLinkType(value)}
              title={label}
              icon={icon}
            >
              {compact ? icon : label}
            </ToggleChip>
          ))}
        </div>
      )}

      {/* avançado */}
      {showAdvanced && (
        <>
          {renderSection(
            'Tags',
            <div className="space-y-2">
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onBlur={(e) => handleTagsChange(e.target.value)}
                placeholder="backbone, core, pop-01..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="text-xs text-slate-500">Separe múltiplas tags com vírgulas</div>
            </div>
          )}

          {renderSection(
            'Período',
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">De</label>
                  <input
                    type="datetime-local"
                    value={startISO}
                    onChange={(e) => handleDateChange('start', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Até</label>
                  <input
                    type="datetime-local"
                    value={endISO}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              {(filters.dateRange?.start || filters.dateRange?.end) && (
                <button onClick={clearDateRange} className="text-xs text-slate-500 hover:text-slate-700 underline">
                  Limpar período
                </button>
              )}
            </div>
          )}

          {renderSection(
            'Opções',
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={filters.fiberOnly}
                onChange={(e) => topologyActions.setFiberOnly(e.target.checked)}
              />
              Apenas links de fibra óptica
            </label>
          )}
        </>
      )}

      {/* footer rápido */}
      {!showAdvanced && (
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={filters.fiberOnly}
                onChange={(e) => topologyActions.setFiberOnly(e.target.checked)}
              />
              Apenas fibra
            </label>

            <button onClick={() => topologyActions.clearFilters()} className="text-xs text-slate-500 hover:text-slate-700 underline">
              Limpar tudo
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------- extras exportados ----------------------------------

export function TopologyFiltersHorizontal({ className }: { className?: string }) {
  const filters = useFilters();
  const stats = useTopologyStats();
  const activeCount = countActiveFilters(filters);

  return (
    <div className={['flex items-center gap-4 p-3 bg-white border border-slate-200 rounded-lg', className || ''].join(' ')}>
      <div className="text-sm">
        <span className="font-medium">{stats.totalNodes}</span> nós •{' '}
        <span className="font-medium">{stats.totalLinks}</span> links
      </div>

      <div className="flex items-center gap-2">
        {activeCount > 0 && (
          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            {activeCount} filtro{activeCount !== 1 ? 's' : ''} ativo{activeCount !== 1 ? 's' : ''}
          </span>
        )}
        {filters.text && (
          <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">"{filters.text}"</span>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button onClick={() => topologyActions.clearFilters()} className="text-xs text-slate-500 hover:text-slate-700 underline">
          Limpar
        </button>
      </div>
    </div>
  );
}

export function ActiveFiltersBadge() {
  const filters = useFilters();
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  if (activeFilterCount === 0) return null;

  return (
    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      {activeFilterCount} filtro{activeFilterCount !== 1 ? 's' : ''} ativo{activeFilterCount !== 1 ? 's' : ''}
    </span>
  );
}

/** Persiste filtros no localStorage (opcional) */
export function usePersistedFilters(key = 'topology-filters') {
  const filters = useFilters();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        // Aqui você poderia reidratar filtros gravados (statuses/types exigem parsing especial)
        // Mantive como log para evitar side-effects sem confirmação.
        console.log('Loaded saved filters:', JSON.parse(saved));
      }
    } catch (error) {
      console.warn('Failed to load saved filters:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(filters));
    } catch (error) {
      console.warn('Failed to save filters:', error);
    }
  }, [filters, key]);

  return filters;
}
