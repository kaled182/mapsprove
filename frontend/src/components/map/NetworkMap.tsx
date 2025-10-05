// ===================================================
// 🗺️ NetworkMap (v0.2)
// Local: frontend/src/components/map/NetworkMap.tsx
// ===================================================
// Responsabilidades:
// - Renderizar mapa (MapLibre GL)
// - Exibir nós e links como camadas vetoriais (GeoJSON)
// - Interações: hover / click / seleção / highlight
// - Fit-to-data, debounce de mudanças de viewport, export
// - Filtros customizados e controles opcionais
// ===================================================

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import maplibregl, {
  Map as MLMap,
  LngLatBoundsLike,
  MapLayerMouseEvent,
  Popup,
} from 'maplibre-gl';

import {
  useTopologyStore,
  selectVisibleNodes,
  selectVisibleLinks,
  selectSelected,
  type TopologyNode,
  type TopologyLink,
} from '@/store/topology';

// -------------------- Tipos --------------------

type MapViewState = {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
};

type Props = {
  styleUrl?: string;
  initialView?: Partial<MapViewState>;
  fitToData?: boolean;
  showLabels?: boolean;
  className?: string;
  height?: string | number;
  width?: string | number;
  /** Callback quando o viewport muda */
  onViewChange?: (view: MapViewState) => void;
  /** Filtros customizados para nós/links */
  nodeFilter?: (node: TopologyNode) => boolean;
  linkFilter?: (link: TopologyLink) => boolean;
  /** Mostrar controles adicionais */
  showControls?: boolean;
  /** Padding para fitBounds (px) */
  fitPadding?: number;
  /** Duração da animação do fitBounds (ms) */
  fitDuration?: number;
  /** Debounce para atualizações de viewport */
  viewChangeDebounceMs?: number;
};

// -------------------- IDs de fontes/camadas --------------------

const SOURCE_IDS = {
  LINKS: 'links-src',
  NODES: 'nodes-src',
  HIGHLIGHT: 'highlight-src',
} as const;

const LAYER_IDS = {
  LINKS: 'links-line',
  NODES: 'nodes-circle',
  LABELS: 'nodes-labels',
  HIGHLIGHT_NODE: 'highlight-node',
  HIGHLIGHT_LINK: 'highlight-link',
} as const;

// -------------------- Constantes --------------------

const DEFAULT_STYLE =
  (import.meta as any)?.env?.VITE_MAP_STYLE_URL ||
  'https://demotiles.maplibre.org/style.json';

const DEFAULT_VIEW: MapViewState = {
  center: [-47.8825, -15.7942],
  zoom: 4,
  pitch: 0,
  bearing: 0,
};

// Paleta de cores
const STATUS_COLORS = {
  up: '#22c55e',
  degraded: '#f59e0b',
  down: '#ef4444',
  unknown: '#94a3b8',
  selected: '#3b82f6',
  hover: '#8b5cf6',
};

// Performance
const PERFORMANCE_CONFIG = {
  MAX_NODES_FOR_AUTO_FIT: 1000,
  DEBOUNCE_VIEW_CHANGE: 500,
  FIT_DURATION: 600,
  FIT_PADDING: 60,
};

// -------------------- Helpers --------------------

function colorByStatusExpression(get: 'status' | 'nodeStatus' = 'status') {
  return [
    'match',
    ['get', get],
    'up',
    STATUS_COLORS.up,
    'degraded',
    STATUS_COLORS.degraded,
    'down',
    STATUS_COLORS.down,
    STATUS_COLORS.unknown,
  ] as any;
}

function buildNodesGeoJSON(
  nodes: ReturnType<typeof selectVisibleNodes>,
  filter?: (node: TopologyNode) => boolean
) {
  const filteredNodes = filter ? nodes.filter(filter) : nodes;

  return {
    type: 'FeatureCollection',
    features: filteredNodes
      .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon))
      .map((n) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [n.lon!, n.lat!],
        },
        properties: {
          id: n.id,
          name: n.name ?? n.id,
          type: n.type ?? 'unknown',
          nodeStatus: n.status ?? 'unknown',
          lastSeen: n.lastSeen ?? 0,
          meta: n.meta ?? {},
        },
      })),
  } as GeoJSON.FeatureCollection;
}

function buildLinksGeoJSON(
  links: ReturnType<typeof selectVisibleLinks>,
  nodeIndex: Map<string, { lon: number; lat: number; status?: string }>,
  filter?: (link: TopologyLink) => boolean
) {
  const filteredLinks = filter ? links.filter(filter) : links;

  return {
    type: 'FeatureCollection',
    features: filteredLinks
      .map((l) => {
        const a = nodeIndex.get(l.source);
        const b = nodeIndex.get(l.target);
        if (!a || !b) return null;

        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [a.lon, a.lat],
              [b.lon, b.lat],
            ],
          },
          properties: {
            id: l.id,
            source: l.source,
            target: l.target,
            status: l.status ?? 'unknown',
            fiber: Boolean(l.fiber),
            utilization:
              typeof l.utilization === 'number' ? l.utilization : 0,
            distanceKm: l.distanceKm ?? null,
            bandwidth: l.bandwidth ?? null,
            meta: l.meta ?? {},
          },
        };
      })
      .filter(Boolean) as GeoJSON.Feature[],
  } as GeoJSON.FeatureCollection;
}

function computeBoundsFromNodes(
  nodes: ReturnType<typeof selectVisibleNodes>
): LngLatBoundsLike | null {
  const coords = nodes
    .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon))
    .map((n) => [n.lon!, n.lat!] as [number, number]);

  if (!coords.length) return null;

  const bounds = new maplibregl.LngLatBounds();
  coords.forEach((c) => bounds.extend(c));
  return bounds.toArray();
}

// Popups
const popupHTMLForNode = (props: any) => {
  const statusColor =
    STATUS_COLORS[props.nodeStatus as keyof typeof STATUS_COLORS] ||
    STATUS_COLORS.unknown;

  return `
    <div style="min-width:200px;font-family:system-ui,-apple-system,sans-serif">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:${statusColor}"></div>
        <div style="font-weight:600;font-size:14px">${props.name || props.id}</div>
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px">
        <strong>ID:</strong> ${props.id}
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px">
        <strong>Tipo:</strong> ${props.type}
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px">
        <strong>Status:</strong> <span style="color:${statusColor}">${props.nodeStatus}</span>
      </div>
      ${
        props.meta && Object.keys(props.meta).length > 0
          ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px">Metadados</div>
          ${Object.entries(props.meta)
            .slice(0, 3)
            .map(
              ([key, value]) => `
            <div style="font-size:11px;color:#475569">
              <strong>${key}:</strong> ${String(value).slice(0, 30)}${
                String(value).length > 30 ? '...' : ''
              }
            </div>
          `
            )
            .join('')}
          ${
            Object.keys(props.meta).length > 3
              ? `<div style="font-size:11px;color:#94a3b8">+${
                  Object.keys(props.meta).length - 3
                } mais</div>`
              : ''
          }
        </div>
      `
          : ''
      }
    </div>
  `;
};

const popupHTMLForLink = (props: any) => {
  const statusColor =
    STATUS_COLORS[props.status as keyof typeof STATUS_COLORS] ||
    STATUS_COLORS.unknown;
  const utilizationPercent = Math.round((props.utilization ?? 0) * 100);
  const utilizationColor =
    utilizationPercent > 80
      ? '#ef4444'
      : utilizationPercent > 60
      ? '#f59e0b'
      : '#22c55e';

  return `
    <div style="min-width:220px;font-family:system-ui,-apple-system,sans-serif">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:${statusColor}"></div>
        <div style="font-weight:600;font-size:14px">Link ${props.id}</div>
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px">
        <strong>De:</strong> ${props.source}
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px">
        <strong>Para:</strong> ${props.target}
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px">
        <strong>Status:</strong> <span style="color:${statusColor}">${props.status}</span>
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px">
        <strong>Utilização:</strong>
        <span style="color:${utilizationColor};margin-left:4px">${utilizationPercent}%</span>
      </div>
      ${
        props.distanceKm
          ? `
        <div style="font-size:12px;color:#64748b;margin-bottom:2px">
          <strong>Distância:</strong> ${props.distanceKm} km
        </div>
      `
          : ''
      }
      ${
        props.bandwidth
          ? `
        <div style="font-size:12px;color:#64748b;margin-bottom:2px">
          <strong>Largura de banda:</strong> ${props.bandwidth} Mbps
        </div>
      `
          : ''
      }
      ${
        props.fiber
          ? `
        <div style="font-size:12px;color:#64748b;margin-bottom:2px">
          <strong>Tipo:</strong> Fibra óptica
        </div>
      `
          : ''
      }
    </div>
  `;
};

// -------------------- Componente --------------------

export default function NetworkMap({
  styleUrl = DEFAULT_STYLE,
  initialView = DEFAULT_VIEW,
  fitToData = true,
  showLabels = true,
  className,
  height = '100%',
  width = '100%',
  onViewChange,
  nodeFilter,
  linkFilter,
  showControls = true,
  fitPadding = PERFORMANCE_CONFIG.FIT_PADDING,
  fitDuration = PERFORMANCE_CONFIG.FIT_DURATION,
  viewChangeDebounceMs = PERFORMANCE_CONFIG.DEBOUNCE_VIEW_CHANGE,
}: Props) {
  // Store
  const nodes = useTopologyStore(selectVisibleNodes);
  const links = useTopologyStore(selectVisibleLinks);
  const selected = useTopologyStore(selectSelected);

  // Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoveredFeatureIdRef = useRef<string | null>(null);
  const dataReadyRef = useRef(false);
  const viewChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Índice de nós
  const nodeIndex = useMemo(() => {
    const idx = new Map<
      string,
      { lon: number; lat: number; status?: string }
    >();
    for (const n of nodes) {
      if (Number.isFinite(n.lon) && Number.isFinite(n.lat)) {
        idx.set(n.id, { lon: n.lon!, lat: n.lat!, status: n.status });
      }
    }
    return idx;
  }, [nodes]);

  // GeoJSON memo
  const nodesGeo = useMemo(
    () => buildNodesGeoJSON(nodes, nodeFilter),
    [nodes, nodeFilter]
  );
  const linksGeo = useMemo(
    () => buildLinksGeoJSON(links, nodeIndex, linkFilter),
    [links, nodeIndex, linkFilter]
  );

  // Handlers
  const handleViewChange = useCallback(
    (map: MLMap) => {
      if (!onViewChange) return;

      if (viewChangeTimeoutRef.current) {
        clearTimeout(viewChangeTimeoutRef.current);
      }

      viewChangeTimeoutRef.current = setTimeout(() => {
        const center = map.getCenter();
        onViewChange({
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        });
      }, viewChangeDebounceMs);
    },
    [onViewChange, viewChangeDebounceMs]
  );

  // Configuração de camadas
  const setupMapLayers = useCallback(
    (map: MLMap) => {
      map.addSource(SOURCE_IDS.LINKS, {
        type: 'geojson',
        data: linksGeo as any,
        lineMetrics: true,
      });

      map.addSource(SOURCE_IDS.NODES, {
        type: 'geojson',
        data: nodesGeo as any,
      });

      map.addSource(SOURCE_IDS.HIGHLIGHT, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: LAYER_IDS.LINKS,
        type: 'line',
        source: SOURCE_IDS.LINKS,
        paint: {
          'line-color': colorByStatusExpression('status'),
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            2,
            ['+', 1.5, ['*', ['coalesce', ['get', 'utilization'], 0], 3.5]],
            12,
            ['+', 2.5, ['*', ['coalesce', ['get', 'utilization'], 0], 6]],
          ],
          'line-opacity': 0.9,
          'line-dasharray': [
            'case',
            ['==', ['get', 'status'], 'down'],
            ['literal', [2, 2]],
            ['literal', [1, 0]],
          ],
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
      });

      map.addLayer({
        id: LAYER_IDS.NODES,
        type: 'circle',
        source: SOURCE_IDS.NODES,
        paint: {
          'circle-color': colorByStatusExpression('nodeStatus'),
          'circle-stroke-width': 1.4,
          'circle-stroke-color': '#111827',
          'circle-opacity': 0.95,
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            2,
            [
              'match',
              ['get', 'type'],
              'router',
              4.5,
              'switch',
              4,
              'server',
              4,
              'firewall',
              4,
              3.5,
            ],
            10,
            [
              'match',
              ['get', 'type'],
              'router',
              8,
              'switch',
              7,
              'server',
              7,
              'firewall',
              7,
              6,
            ],
          ],
        },
      });

      if (showLabels) {
        map.addLayer({
          id: LAYER_IDS.LABELS,
          type: 'symbol',
          source: SOURCE_IDS.NODES,
          layout: {
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3,
              10,
              10,
              13,
            ],
            'text-allow-overlap': false,
            'text-optional': true,
          },
          paint: {
            'text-color': '#0f172a',
            'text-halo-color': '#f8fafc',
            'text-halo-width': 1.2,
            'text-opacity': 0.9,
          },
        });
      }

      map.addLayer({
        id: LAYER_IDS.HIGHLIGHT_NODE,
        type: 'circle',
        source: SOURCE_IDS.HIGHLIGHT,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 6, 10, 10],
          'circle-color': STATUS_COLORS.selected,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.8,
        },
      });

      map.addLayer({
        id: LAYER_IDS.HIGHLIGHT_LINK,
        type: 'line',
        source: SOURCE_IDS.HIGHLIGHT,
        paint: {
          'line-color': STATUS_COLORS.selected,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 4, 12, 8],
          'line-opacity': 0.8,
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
      });
    },
    [nodesGeo, linksGeo, showLabels]
  );

  // Interações
  const setupMapInteractions = useCallback((map: MLMap) => {
    const setPointer = (on: boolean) =>
      map.getCanvas().style.setProperty('cursor', on ? 'pointer' : '');

    const handleMouseEnter = (e: MapLayerMouseEvent) => {
      setPointer(true);
      const f = e.features?.[0];
      if (f) {
        hoveredFeatureIdRef.current = (f.properties as any)?.id ?? null;
      }
    };

    const handleMouseLeave = () => {
      setPointer(false);
      hoveredFeatureIdRef.current = null;
    };

    map.on('mousemove', LAYER_IDS.LINKS, handleMouseEnter);
    map.on('mouseleave', LAYER_IDS.LINKS, handleMouseLeave);
    map.on('mousemove', LAYER_IDS.NODES, handleMouseEnter);
    map.on('mouseleave', LAYER_IDS.NODES, handleMouseLeave);

    map.on('click', LAYER_IDS.NODES, (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as any;

      useTopologyStore.getState().setSelectedNode(p.id);

      const popup = popupRef.current!;
      popup.setLngLat(e.lngLat);
      popup.setHTML(popupHTMLForNode(p)).addTo(map);
    });

    map.on('click', LAYER_IDS.LINKS, (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as any;

      useTopologyStore.getState().setSelectedLink(p.id);

      const popup = popupRef.current!;
      popup.setLngLat(e.lngLat);
      popup.setHTML(popupHTMLForLink(p)).addTo(map);
    });

    map.on('dblclick', LAYER_IDS.NODES, (e: MapLayerMouseEvent) => {
      map.easeTo({
        center: e.lngLat,
        zoom: Math.min(map.getZoom() + 2, 18),
        duration: 500,
      });
    });
  }, []);

  // Fit-to-data
  const performFitToData = useCallback(
    (map: MLMap) => {
      const bounds = computeBoundsFromNodes(nodes);
      if (bounds) {
        try {
          map.fitBounds(bounds, {
            padding: fitPadding,
            duration: fitDuration,
            maxZoom: 15,
          });
        } catch (error) {
          console.warn('Fit bounds failed:', error);
        }
      }
    },
    [nodes, fitPadding, fitDuration]
  );

  // Inicialização do mapa
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: initialView.center ?? DEFAULT_VIEW.center,
      zoom: initialView.zoom ?? DEFAULT_VIEW.zoom,
      pitch: initialView.pitch ?? DEFAULT_VIEW.pitch,
      bearing: initialView.bearing ?? DEFAULT_VIEW.bearing,
      attributionControl: true,
      preserveDrawingBuffer: true,
    });

    mapRef.current = map;
    popupRef.current = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '320px',
      className: 'network-map-popup',
    });

    if (showControls) {
      map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: true }),
        'top-right'
      );
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserLocation: true,
        }),
        'top-right'
      );
    }

    map.on('load', () => {
      setIsMapLoaded(true);
      setupMapLayers(map);
      setupMapInteractions(map);
      dataReadyRef.current = true;

      if (
        fitToData &&
        nodes.length > 0 &&
        nodes.length <= PERFORMANCE_CONFIG.MAX_NODES_FOR_AUTO_FIT
      ) {
        performFitToData(map);
      }
    });

    map.on('moveend', () => handleViewChange(map));

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (viewChangeTimeoutRef.current) clearTimeout(viewChangeTimeoutRef.current);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setIsMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl, showControls, setupMapLayers, setupMapInteractions]);

  // Atualização de dados das fontes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const linksSrc = map.getSource(
      SOURCE_IDS.LINKS
    ) as maplibregl.GeoJSONSource | null;
    const nodesSrc = map.getSource(
      SOURCE_IDS.NODES
    ) as maplibregl.GeoJSONSource | null;

    if (linksSrc) linksSrc.setData(linksGeo as any);
    if (nodesSrc) nodesSrc.setData(nodesGeo as any);

    if (
      fitToData &&
      nodes.length > 0 &&
      nodes.length <= PERFORMANCE_CONFIG.MAX_NODES_FOR_AUTO_FIT
    ) {
      performFitToData(map);
    }
  }, [nodesGeo, linksGeo, isMapLoaded, fitToData, performFitToData, nodes.length]);

  // Highlight de seleção
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const highlightSrc = map.getSource(
      SOURCE_IDS.HIGHLIGHT
    ) as maplibregl.GeoJSONSource | null;
    if (!highlightSrc) return;

    const features: GeoJSON.Feature[] = [];

    if (selected.node) {
      const node = selected.node;
      if (Number.isFinite(node.lon) && Number.isFinite(node.lat)) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [node.lon!, node.lat!] },
          properties: { id: node.id, type: 'node' },
        } as GeoJSON.Feature);
      }
    }

    if (selected.link) {
      const link = selected.link;
      const a = nodeIndex.get(link.source);
      const b = nodeIndex.get(link.target);
      if (a && b) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [a.lon, a.lat],
              [b.lon, b.lat],
            ],
          },
          properties: { id: link.id, type: 'link' },
        } as GeoJSON.Feature);
      }
    }

    highlightSrc.setData({
      type: 'FeatureCollection',
      features,
    } as GeoJSON.FeatureCollection);
  }, [selected, nodeIndex, isMapLoaded]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
      }}
      data-testid="network-map"
    >
      {!isMapLoaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8fafc',
            color: '#64748b',
            fontSize: 14,
            zIndex: 1,
          }}
        >
          Carregando mapa...
        </div>
      )}
    </div>
  );
}

// -------------------- Hooks & Utils Extras --------------------

/** Hook para exportar o mapa como imagem */
export function useMapExport() {
  const mapRef = useRef<MLMap | null>(null);

  const exportToImage = useCallback(async (filename = 'network-map.png') => {
    const map = mapRef.current;
    if (!map) return;

    try {
      const canvas = map.getCanvas();
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, []);

  return { exportToImage, mapRef };
}

/** Hook para buscar coordenadas de um nó */
export function useNodeCoordinates(nodeId: string) {
  const nodes = useTopologyStore(selectVisibleNodes);

  return useMemo(() => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || !Number.isFinite(node.lon) || !Number.isFinite(node.lat)) {
      return null;
    }
    return [node.lon!, node.lat!] as [number, number];
  }, [nodes, nodeId]);
}

/** Mini-Overview */
export function NetworkMapOverview({ className }: { className?: string }) {
  return (
    <div className={className}>
      <NetworkMap
        styleUrl="https://demotiles.maplibre.org/style.json"
        initialView={{ zoom: 2 }}
        fitToData
        showLabels={false}
        showControls={false}
        height={200}
        fitPadding={20}
      />
    </div>
  );
}

/** Controles simples (exemplo) */
export function MapControls({
  onExport,
  onResetView,
}: {
  onExport?: () => void;
  onResetView?: () => void;
}) {
  return (
    <div className="absolute top-4 left-4 flex gap-2 z-10">
      <button
        onClick={onResetView}
        className="bg-white p-2 rounded shadow-md hover:shadow-lg transition-shadow"
        title="Resetar vista"
      >
        🏠
      </button>
      <button
        onClick={onExport}
        className="bg-white p-2 rounded shadow-md hover:shadow-lg transition-shadow"
        title="Exportar como imagem"
      >
        📸
      </button>
    </div>
  );
}
