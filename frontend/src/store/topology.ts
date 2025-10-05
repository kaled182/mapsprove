// ===================================================
// 🧠 Topology Store (v1.0)
// Local: frontend/src/store/topology.ts
// ===================================================

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';

// -------------------- Tipos públicos melhorados --------------------

export type NodeStatus = 'up' | 'down' | 'degraded' | 'unknown';
export type NodeType =
  | 'router'
  | 'switch'
  | 'server'
  | 'firewall'
  | 'access-point'
  | 'cpe'
  | 'unknown';

export type LinkStatus = 'up' | 'down' | 'degraded' | 'unknown';
export type LinkType = 'fiber' | 'copper' | 'wireless' | 'backbone' | 'unknown';

export type TopologyNode = {
  id: string;
  name?: string;
  lat?: number;
  lon?: number;
  status?: NodeStatus;
  type?: NodeType;
  meta?: Record<string, any>;
  lastSeen?: number;
  createdAt?: number;
  updatedAt?: number;
  tags?: string[];
  // Métricas em tempo real
  metrics?: {
    cpu?: number;
    memory?: number;
    disk?: number;
    latency?: number;
    lastUpdate?: number;
  };
};

export type TopologyLink = {
  id: string;
  source: string;
  target: string;
  fiber?: boolean;
  type?: LinkType;
  distanceKm?: number | null;
  status?: LinkStatus;
  bandwidth?: number | null;
  utilization?: number; // 0..1
  latency?: number; // ms
  packetLoss?: number; // 0..1
  meta?: Record<string, any>;
  lastSeen?: number;
  createdAt?: number;
  updatedAt?: number;
  tags?: string[];
};

export type TopologyFilters = {
  statuses: Set<NodeStatus | LinkStatus>;
  types: Set<NodeType | LinkType>;
  text?: string;
  fiberOnly: boolean;
  tags?: string[];
  dateRange?: {
    start?: number;
    end?: number;
  };
};

export type SelectionState = {
  nodeId?: string | null;
  linkId?: string | null;
  timestamp: number;
};

export type TopologyStats = {
  totalNodes: number;
  totalLinks: number;
  nodesByStatus: Record<NodeStatus, number>;
  linksByStatus: Record<LinkStatus, number>;
  nodesByType: Record<NodeType, number>;
  lastUpdate: number;
};

// -------------------- Estado & Ações --------------------

type TopologyState = {
  nodesById: Record<string, TopologyNode>;
  linksById: Record<string, TopologyLink>;

  version?: string | number;
  updatedAt?: number;
  createdAt?: number;

  filters: TopologyFilters;
  selection: SelectionState;

  // Cache para performance (não é escrito por seletores)
  _cache: {
    visibleNodes?: TopologyNode[];
    visibleLinks?: TopologyLink[];
    stats?: TopologyStats;
  };
};

type TopologyActions = {
  // Setters básicos
  setTopology: (nodes: TopologyNode[], links: TopologyLink[], version?: string | number) => void;
  upsertNodes: (nodes: TopologyNode[]) => void;
  upsertLinks: (links: TopologyLink[]) => void;
  removeNode: (nodeId: string) => void;
  removeLink: (linkId: string) => void;

  // Filtros
  setStatusesFilter: (statuses: Iterable<NodeStatus | LinkStatus>) => void;
  setTypesFilter: (types: Iterable<NodeType | LinkType>) => void;
  setTextFilter: (text?: string) => void;
  setFiberOnly: (fiberOnly: boolean) => void;
  setTagsFilter: (tags: string[]) => void;
  setDateRangeFilter: (start?: number, end?: number) => void;
  clearFilters: () => void;

  // Seleção
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedLink: (linkId: string | null) => void;
  clearSelection: () => void;

  // Utilitários
  updateNodeMetrics: (nodeId: string, metrics: Partial<TopologyNode['metrics']>) => void;
  updateLinkMetrics: (
    linkId: string,
    metrics: Partial<Pick<TopologyLink, 'utilization' | 'latency' | 'packetLoss'>>
  ) => void;
  bulkUpdateStatus: (
    nodeIds: string[],
    status: NodeStatus,
    linkIds?: string[],
    linkStatus?: LinkStatus
  ) => void;

  reset: () => void;

  // Cache internos (actions privadas)
  _invalidateCache: () => void;
};

// -------------------- Defaults e constantes --------------------

const defaultFilters = (): TopologyFilters => ({
  statuses: new Set<NodeStatus | LinkStatus>(),
  types: new Set<NodeType | LinkType>(),
  fiberOnly: false,
  tags: [],
});

const defaultSelection = (): SelectionState => ({
  timestamp: Date.now(),
});

const INITIAL_STATE: TopologyState = {
  nodesById: {},
  linksById: {},
  version: undefined,
  updatedAt: undefined,
  createdAt: undefined,
  filters: defaultFilters(),
  selection: defaultSelection(),
  _cache: {},
};

// -------------------- Helpers e validadores --------------------

function validateNode(node: Partial<TopologyNode>): boolean {
  if (!node.id) return false;
  if (node.lat !== undefined && !Number.isFinite(node.lat)) return false;
  if (node.lon !== undefined && !Number.isFinite(node.lon)) return false;
  return true;
}

function validateLink(link: Partial<TopologyLink>): boolean {
  if (!link.id || !link.source || !link.target) return false;
  return true;
}

function mergeMetrics(current: any, update: any) {
  return {
    ...current,
    ...update,
    lastUpdate: Date.now(),
  };
}

// -------------------- Store principal --------------------

export const useTopologyStore = create<TopologyState & TopologyActions>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...INITIAL_STATE,

      setTopology: (nodes, links, version) =>
        set(
          (state) => {
            const nodesById: Record<string, TopologyNode> = {};
            const linksById: Record<string, TopologyLink> = {};
            const now = Date.now();

            for (const n of nodes) {
              if (validateNode(n)) {
                nodesById[n.id] = {
                  ...n,
                  createdAt: n.createdAt || now,
                  updatedAt: now,
                };
              }
            }

            for (const l of links) {
              if (validateLink(l)) {
                linksById[l.id] = {
                  ...l,
                  createdAt: l.createdAt || now,
                  updatedAt: now,
                };
              }
            }

            return {
              nodesById,
              linksById,
              version: version ?? state.version,
              updatedAt: now,
              createdAt: state.createdAt || now,
              _cache: {}, // Invalida cache
            };
          },
          false,
          'topology/setTopology'
        ),

      upsertNodes: (nodes) =>
        set(
          (state) => {
            const copy = { ...state.nodesById };
            const now = Date.now();
            let updated = false;

            for (const n of nodes) {
              if (validateNode(n)) {
                const existing = copy[n.id];
                copy[n.id] = {
                  ...existing,
                  ...n,
                  createdAt: existing?.createdAt || now,
                  updatedAt: now,
                };
                updated = true;
              }
            }

            return updated ? { nodesById: copy, updatedAt: now, _cache: {} } : {};
          },
          false,
          'topology/upsertNodes'
        ),

      upsertLinks: (links) =>
        set(
          (state) => {
            const copy = { ...state.linksById };
            const now = Date.now();
            let updated = false;

            for (const l of links) {
              if (validateLink(l)) {
                const existing = copy[l.id];
                copy[l.id] = {
                  ...existing,
                  ...l,
                  createdAt: existing?.createdAt || now,
                  updatedAt: now,
                };
                updated = true;
              }
            }

            return updated ? { linksById: copy, updatedAt: now, _cache: {} } : {};
          },
          false,
          'topology/upsertLinks'
        ),

      removeNode: (nodeId) =>
        set(
          (state) => {
            if (!state.nodesById[nodeId]) return {};

            const nodesById = { ...state.nodesById };
            delete nodesById[nodeId];

            // remove links que referenciam o nó
            const linksById: Record<string, TopologyLink> = {};
            for (const [id, l] of Object.entries(state.linksById)) {
              if (l.source !== nodeId && l.target !== nodeId) linksById[id] = l;
            }

            // limpa seleção se for o nó selecionado
            const selection =
              state.selection.nodeId === nodeId
                ? { ...defaultSelection(), linkId: state.selection.linkId }
                : state.selection;

            return { nodesById, linksById, selection, updatedAt: Date.now(), _cache: {} };
          },
          false,
          'topology/removeNode'
        ),

      removeLink: (linkId) =>
        set(
          (state) => {
            if (!state.linksById[linkId]) return {};

            const linksById = { ...state.linksById };
            delete linksById[linkId];

            const selection =
              state.selection.linkId === linkId
                ? { ...defaultSelection(), nodeId: state.selection.nodeId }
                : state.selection;

            return { linksById, selection, updatedAt: Date.now(), _cache: {} };
          },
          false,
          'topology/removeLink'
        ),

      setStatusesFilter: (statuses) =>
        set(
          (state) => ({
            filters: { ...state.filters, statuses: new Set(statuses) },
            _cache: {},
          }),
          false,
          'topology/setStatusesFilter'
        ),

      setTypesFilter: (types) =>
        set(
          (state) => ({
            filters: { ...state.filters, types: new Set(types) },
            _cache: {},
          }),
          false,
          'topology/setTypesFilter'
        ),

      setTextFilter: (text) =>
        set(
          (state) => ({
            filters: { ...state.filters, text: text?.trim() || undefined },
            _cache: {},
          }),
          false,
          'topology/setTextFilter'
        ),

      setFiberOnly: (fiberOnly) =>
        set(
          (state) => ({
            filters: { ...state.filters, fiberOnly },
            _cache: {},
          }),
          false,
          'topology/setFiberOnly'
        ),

      setTagsFilter: (tags) =>
        set(
          (state) => ({
            filters: { ...state.filters, tags },
            _cache: {},
          }),
          false,
          'topology/setTagsFilter'
        ),

      setDateRangeFilter: (start, end) =>
        set(
          (state) => ({
            filters: {
              ...state.filters,
              dateRange: start || end ? { start, end } : undefined,
            },
            _cache: {},
          }),
          false,
          'topology/setDateRangeFilter'
        ),

      clearFilters: () =>
        set(
          () => ({
            filters: defaultFilters(),
            _cache: {},
          }),
          false,
          'topology/clearFilters'
        ),

      setSelectedNode: (nodeId) =>
        set(
          () => ({
            selection: {
              nodeId,
              linkId: null,
              timestamp: Date.now(),
            },
          }),
          false,
          'topology/setSelectedNode'
        ),

      setSelectedLink: (linkId) =>
        set(
          () => ({
            selection: {
              linkId,
              nodeId: null,
              timestamp: Date.now(),
            },
          }),
          false,
          'topology/setSelectedLink'
        ),

      clearSelection: () =>
        set(
          () => ({
            selection: defaultSelection(),
          }),
          false,
          'topology/clearSelection'
        ),

      updateNodeMetrics: (nodeId, metrics) =>
        set(
          (state) => {
            const node = state.nodesById[nodeId];
            if (!node) return {};
            const nodesById = { ...state.nodesById };
            nodesById[nodeId] = {
              ...node,
              metrics: mergeMetrics(node.metrics, metrics),
              updatedAt: Date.now(),
            };
            return { nodesById, updatedAt: Date.now(), _cache: {} };
          },
          false,
          'topology/updateNodeMetrics'
        ),

      updateLinkMetrics: (linkId, metrics) =>
        set(
          (state) => {
            const link = state.linksById[linkId];
            if (!link) return {};
            const linksById = { ...state.linksById };
            linksById[linkId] = { ...link, ...metrics, updatedAt: Date.now() };
            return { linksById, updatedAt: Date.now(), _cache: {} };
          },
          false,
          'topology/updateLinkMetrics'
        ),

      bulkUpdateStatus: (nodeIds, nodeStatus, linkIds = [], linkStatus) =>
        set(
          (state) => {
            const nodesById = { ...state.nodesById };
            const linksById = { ...state.linksById };
            const now = Date.now();
            let updated = false;

            for (const nodeId of nodeIds) {
              if (nodesById[nodeId]) {
                nodesById[nodeId] = { ...nodesById[nodeId], status: nodeStatus, updatedAt: now };
                updated = true;
              }
            }

            if (linkStatus) {
              for (const linkId of linkIds) {
                if (linksById[linkId]) {
                  linksById[linkId] = { ...linksById[linkId], status: linkStatus, updatedAt: now };
                  updated = true;
                }
              }
            }

            return updated ? { nodesById, linksById, updatedAt: now, _cache: {} } : {};
          },
          false,
          'topology/bulkUpdateStatus'
        ),

      reset: () =>
        set(
          () => ({
            ...INITIAL_STATE,
            createdAt: Date.now(),
          }),
          false,
          'topology/reset'
        ),

      _invalidateCache: () =>
        set(
          () => ({ _cache: {} }),
          false,
          'topology/invalidateCache'
        ),
    })),
    {
      name: 'topology-store',
      trace:
        (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
        (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.MODE === 'development'),
    }
  )
);

// -------------------- Memoização por módulo (seletores puros) --------------------

const memo = {
  nodes: { key: '', value: [] as TopologyNode[] },
  links: { key: '', value: [] as TopologyLink[] },
  stats: { key: '', value: {} as TopologyStats },
};

function filtersSignature(f: TopologyFilters): string {
  const st = Array.from(f.statuses).sort().join(',');
  const ty = Array.from(f.types).sort().join(',');
  const tg = (f.tags || []).slice().sort().join(',');
  const txt = f.text || '';
  const dr = f.dateRange ? `${f.dateRange.start || ''}-${f.dateRange.end || ''}` : '';
  return `${st}|${ty}|${txt}|${f.fiberOnly ? 1 : 0}|${tg}|${dr}`;
}

// -------------------- Seletores com cache --------------------

/** Seleção atual (objetos completos) */
export const selectSelected = (s: TopologyState) => {
  const node = s.selection.nodeId ? s.nodesById[s.selection.nodeId] : undefined;
  const link = s.selection.linkId ? s.linksById[s.selection.linkId] : undefined;
  return { node, link, timestamp: s.selection.timestamp };
};

/** Nós visíveis aplicando filtros (memoizado) */
export const selectVisibleNodes = (s: TopologyState): TopologyNode[] => {
  const key = `nodes:${s.updatedAt || 0}:${filtersSignature(s.filters)}`;
  if (memo.nodes.key === key) return memo.nodes.value;

  const { nodesById, filters } = s;
  const all = Object.values(nodesById);

  const hasStatus = filters.statuses.size > 0;
  const hasTypes = filters.types.size > 0;
  const hasTags = !!(filters.tags && filters.tags.length > 0);
  const text = filters.text?.toLowerCase();

  const filtered = all.filter((n) => {
    if (hasStatus && !filters.statuses.has(n.status ?? 'unknown')) return false;
    if (hasTypes && !filters.types.has(n.type ?? 'unknown')) return false;

    if (text) {
      const searchText = `${n.name ?? ''} ${n.id} ${n.tags?.join(' ') ?? ''}`.toLowerCase();
      if (!searchText.includes(text)) return false;
    }

    if (hasTags && n.tags) {
      const match = filters.tags!.some((tag) => n.tags!.includes(tag));
      if (!match) return false;
    } else if (hasTags && !n.tags) {
      return false;
    }

    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      const nodeTime = n.updatedAt || n.lastSeen || 0;
      if (start && nodeTime < start) return false;
      if (end && nodeTime > end) return false;
    }

    return Number.isFinite(n.lat) && Number.isFinite(n.lon);
  });

  const sorted = filtered.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));

  memo.nodes = { key, value: sorted };
  return sorted;
};

/** Links visíveis aplicando filtros (memoizado) */
export const selectVisibleLinks = (s: TopologyState): TopologyLink[] => {
  const nodesKey = `nodes:${s.updatedAt || 0}:${filtersSignature(s.filters)}`;
  const key = `links:${s.updatedAt || 0}:${filtersSignature(s.filters)}:${nodesKey}`;
  if (memo.links.key === key) return memo.links.value;

  const { linksById, filters } = s;
  const visibleNodes = selectVisibleNodes(s);
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  const hasStatus = filters.statuses.size > 0;
  const hasTypes = filters.types.size > 0;
  const hasTags = !!(filters.tags && filters.tags.length > 0);

  const filtered = Object.values(linksById).filter((l) => {
    if (!visibleNodeIds.has(l.source) || !visibleNodeIds.has(l.target)) return false;
    if (filters.fiberOnly && !l.fiber) return false;
    if (hasStatus && !filters.statuses.has(l.status ?? 'unknown')) return false;

    if (hasTypes) {
      const linkType: LinkType = l.fiber ? 'fiber' : (l.type ?? 'unknown');
      if (!filters.types.has(linkType)) return false;
    }

    if (hasTags && l.tags) {
      const match = filters.tags!.some((tag) => l.tags!.includes(tag));
      if (!match) return false;
    } else if (hasTags && !l.tags) {
      return false;
    }

    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      const linkTime = l.updatedAt || l.lastSeen || 0;
      if (start && linkTime < start) return false;
      if (end && linkTime > end) return false;
    }

    return true;
  });

  const sorted = filtered.sort((a, b) => a.id.localeCompare(b.id));

  memo.links = { key, value: sorted };
  return sorted;
};

/** Estatísticas da topologia (memoizado) */
export const selectStats = (s: TopologyState): TopologyStats => {
  const key = `stats:${s.updatedAt || 0}:${Object.keys(s.nodesById).length}:${Object.keys(s.linksById).length}`;
  if (memo.stats.key === key) return memo.stats.value;

  const nodes = Object.values(s.nodesById);
  const links = Object.values(s.linksById);
  const now = Date.now();

  const stats: TopologyStats = {
    totalNodes: nodes.length,
    totalLinks: links.length,
    nodesByStatus: { up: 0, down: 0, degraded: 0, unknown: 0 },
    linksByStatus: { up: 0, down: 0, degraded: 0, unknown: 0 },
    nodesByType: {
      router: 0,
      switch: 0,
      server: 0,
      firewall: 0,
      'access-point': 0,
      cpe: 0,
      unknown: 0,
    },
    lastUpdate: s.updatedAt || now,
  };

  for (const node of nodes) {
    const st = node.status ?? 'unknown';
    const ty = node.type ?? 'unknown';
    stats.nodesByStatus[st]++;
    stats.nodesByType[ty]++;
  }

  for (const link of links) {
    const st = link.status ?? 'unknown';
    stats.linksByStatus[st]++;
  }

  memo.stats = { key, value: stats };
  return stats;
};

/** Nós com problemas (down/degraded) */
export const selectProblemNodes = (s: TopologyState): TopologyNode[] => {
  const nodes = selectVisibleNodes(s);
  return nodes.filter((n) => n.status === 'down' || n.status === 'degraded');
};

/** Links com problemas (down/degraded) */
export const selectProblemLinks = (s: TopologyState): TopologyLink[] => {
  const links = selectVisibleLinks(s);
  return links.filter((l) => l.status === 'down' || l.status === 'degraded');
};

/** Nós sem coordenadas */
export const selectNodesWithoutCoordinates = (s: TopologyState): TopologyNode[] => {
  const nodes = Object.values(s.nodesById);
  return nodes.filter((n) => !Number.isFinite(n.lat) || !Number.isFinite(n.lon));
};

// -------------------- Hooks customizados --------------------

/** Estatísticas com shallow compare */
export const useTopologyStats = () => useTopologyStore(selectStats, shallow);

/** Nós visíveis com shallow compare */
export const useVisibleNodes = () => useTopologyStore(selectVisibleNodes, shallow);

/** Links visíveis com shallow compare */
export const useVisibleLinks = () => useTopologyStore(selectVisibleLinks, shallow);

/** Seleção atual */
export const useSelection = () => useTopologyStore(selectSelected, shallow);

/** Nós com problemas */
export const useProblemNodes = () => useTopologyStore(selectProblemNodes, shallow);

/** Filtros atuais */
export const useFilters = () => useTopologyStore((s) => s.filters, shallow);

// -------------------- Ações globais --------------------

export const topologyActions = {
  setTopology: (nodes: TopologyNode[], links: TopologyLink[], version?: string | number) =>
    useTopologyStore.getState().setTopology(nodes, links, version),

  upsertNodes: (nodes: TopologyNode[]) => useTopologyStore.getState().upsertNodes(nodes),

  upsertLinks: (links: TopologyLink[]) => useTopologyStore.getState().upsertLinks(links),

  updateNodeMetrics: (nodeId: string, metrics: Partial<TopologyNode['metrics']>) =>
    useTopologyStore.getState().updateNodeMetrics(nodeId, metrics),

  updateLinkMetrics: (
    linkId: string,
    metrics: Partial<Pick<TopologyLink, 'utilization' | 'latency' | 'packetLoss'>>
  ) => useTopologyStore.getState().updateLinkMetrics(linkId, metrics),

  setSelectedNode: (id: string | null) => useTopologyStore.getState().setSelectedNode(id),

  setSelectedLink: (id: string | null) => useTopologyStore.getState().setSelectedLink(id),

  clearSelection: () => useTopologyStore.getState().clearSelection(),

  // Filtros
  setStatusesFilter: (statuses: Iterable<NodeStatus | LinkStatus>) =>
    useTopologyStore.getState().setStatusesFilter(statuses),

  setTypesFilter: (types: Iterable<NodeType | LinkType>) =>
    useTopologyStore.getState().setTypesFilter(types),

  setTextFilter: (text?: string) => useTopologyStore.getState().setTextFilter(text),

  setFiberOnly: (fiberOnly: boolean) => useTopologyStore.getState().setFiberOnly(fiberOnly),

  setTagsFilter: (tags: string[]) => useTopologyStore.getState().setTagsFilter(tags),

  setDateRangeFilter: (start?: number, end?: number) =>
    useTopologyStore.getState().setDateRangeFilter(start, end),

  clearFilters: () => useTopologyStore.getState().clearFilters(),

  bulkUpdateStatus: (nodeIds: string[], status: NodeStatus, linkIds?: string[], linkStatus?: LinkStatus) =>
    useTopologyStore.getState().bulkUpdateStatus(nodeIds, status, linkIds, linkStatus),

  reset: () => useTopologyStore.getState().reset(),
};

// -------------------- Utilitários de export/import --------------------

/** Exporta topologia para JSON */
export const exportTopology = () => {
  const state = useTopologyStore.getState();
  return {
    nodes: Object.values(state.nodesById),
    links: Object.values(state.linksById),
    version: state.version,
    exportedAt: Date.now(),
  };
};

/** Importa topologia de JSON */
export const importTopology = (data: {
  nodes: TopologyNode[];
  links: TopologyLink[];
  version?: string | number;
}) => {
  topologyActions.setTopology(data.nodes, data.links, data.version);
};

// -------------------- Subscrições úteis (dev) --------------------

const isDev =
  (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.MODE === 'development');

if (isDev) {
  useTopologyStore.subscribe(
    (state) => state.updatedAt,
    (updatedAt) => {
      if (!updatedAt) return;
      // eslint-disable-next-line no-console
      console.log('[topology] updated at:', new Date(updatedAt).toISOString());
    }
  );
}
