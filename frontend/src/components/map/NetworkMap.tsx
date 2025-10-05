// frontend/src/components/map/NetworkMap.tsx
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
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

export type MapViewState = {
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
  /** Callback quando o viewport muda (com debounce) */
  onViewChange?: (view: MapViewState) => void;
  /** Callback quando o mapa terminou de carregar */
  onLoad?: () => void;
  /** Filtros customizados para nós/links */
  nodeFilter?: (node: TopologyNode) => boolean;
  linkFilter?: (link: TopologyLink) => boolean;
  /** Mostrar controles de navegação/geolocalização */
  showControls?: boolean;
  /** Padding para fitBounds (px) */
  fitPadding?: number;
  /** Duração da animação do fitBounds (ms) */
  fitDuration?: number;
  /** Debounce para atualizações de viewport (ms) */
  viewChangeDebounceMs?: number;
};

export type NetworkMapImperativeHandle = {
  /** Instância direta do MapLibre GL */
  getMap: () => MLMap | null;
  /** Foca em coordenadas específicas */
  flyTo: (options: {
    center: [number, number];
    zoom?: number;
    duration?: number;
  }) => void;
  /** Ajusta vista para caber bounds */
  fitBounds: (bounds: LngLatBoundsLike, options?: any) => void;
  /** Volta à vista inicial */
  resetView: () => void;
  /** Obtém vista atual */
  getView: () => MapViewState | null;
  /** Shortcuts adicionais */
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  getCenter: () => [number, number] | null;
  setCenter: (center: [number, number]) => void;
  easeTo: (options: any) => void;
  jumpTo: (options: any) => void;

  // Métodos estendidos
  focusOnNode: (nodeId: string) => void;
  focusOnLink: (linkId: string) => void;
  exportMap: (filename?: string) => void;
  getDataBounds: () => LngLatBoundsLike | null | undefined;
  setInteractions: (enabled: boolean) => void;
  addCustomLayer: (layer: any, beforeLayerId?: string) => boolean;
  removeCustomLayer: (layerId: string) => boolean;
  getContainer: () => HTMLDivElement | null;
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
  center: [-47.8825, -15.7942], // Brasília
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

// Config de performance
const PERFORMANCE_CONFIG = {
  MAX_NODES_FOR_AUTO_FIT: 1000,
  DEBOUNCE_VIEW_CHANGE: 500,
  FIT_DURATION: 600,
  FIT_PADDING: 60,
};

// Otimizações adicionais
const PERFORMANCE_OPTIMIZATIONS = {
  MAX_NODES_FOR_SMOOTH_INTERACTION: 500,
  DEBOUNCE_DATA_UPDATE: 100, // ms
  MAX_HISTORY_SIZE: 50,
};

// -------------------- Hooks/utilitários --------------------

function colorByStatusExpression(getProp: 'status' | 'nodeStatus' = 'status') {
  return [
    'match',
    ['get', getProp],
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
  const filtered = filter ? nodes.filter(filter) : nodes;

  return {
    type: 'FeatureCollection',
    features: filtered
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
  const filtered = filter ? links.filter(filter) : links;

  return {
    type: 'FeatureCollection',
    features: filtered
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
            utilization: typeof l.utilization === 'number' ? l.utilization : 0,
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

  const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
  for (const c of coords) bounds.extend(c);
  return bounds.toArray(); // [[swLng, swLat], [neLng, neLat]]
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
      <div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>ID:</strong> ${props.id}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>Tipo:</strong> ${props.type}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>Status:</strong> <span style="color:${statusColor}">${props.nodeStatus}</span></div>
      ${
        props.meta && Object.keys(props.meta).length > 0
          ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px">Metadados</div>
          ${Object.entries(props.meta)
            .slice(0, 3)
            .map(
              ([key, value]) => `
            <div style="font-size:11px;color:#475569"><strong>${key}:</strong> ${String(value).slice(0, 30)}${
                String(value).length > 30 ? '...' : ''
              }</div>`
            )
            .join('')}
          ${
            Object.keys(props.meta).length > 3
              ? `<div style="font-size:11px;color:#94a3b8">+${Object.keys(props.meta).length - 3} mais</div>`
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
      <div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>De:</strong> ${props.source}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>Para:</strong> ${props.target}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>Status:</strong> <span style="color:${statusColor}">${props.status}</span></div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>Utilização:</strong> <span style="color:${utilizationColor};margin-left:4px">${utilizationPercent}%</span></div>
      ${
        props.distanceKm
          ? `<div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>Distância:</strong> ${props.distanceKm} km</div>`
          : ''
      }
      ${
        props.bandwidth
          ? `<div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>Largura de banda:</strong> ${props.bandwidth} Mbps</div>`
          : ''
      }
      ${
        props.fiber
          ? `<div style="font-size:12px;color:#64748b;margin-bottom:2px"><strong>Tipo:</strong> Fibra óptica</div>`
          : ''
      }
    </div>
  `;
};

// Debounce genérico para dados
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Cache para bounds computados (chaveado pelo array de nodes)
const boundsCache = new WeakMap<object, LngLatBoundsLike | null>();

// -------------------- Componente --------------------

const NetworkMap = forwardRef<NetworkMapImperativeHandle, Props>(function NetworkMap(
  {
    styleUrl = DEFAULT_STYLE,
    initialView = DEFAULT_VIEW,
    fitToData = true,
    showLabels = true,
    className,
    height = '100%',
    width = '100%',
    onViewChange,
    onLoad,
    nodeFilter,
    linkFilter,
    showControls = true,
    fitPadding = PERFORMANCE_CONFIG.FIT_PADDING,
    fitDuration = PERFORMANCE_CONFIG.FIT_DURATION,
    viewChangeDebounceMs = PERFORMANCE_CONFIG.DEBOUNCE_VIEW_CHANGE,
  },
  forwardedRef
) {
  // Dados da store
  const nodes = useTopologyStore(selectVisibleNodes);
  const links = useTopologyStore(selectVisibleLinks);
  const selected = useTopologyStore(selectSelected);

  // Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoveredFeatureIdRef = useRef<string | null>(null);
  const isLoadedRef = useRef(false);
  const viewChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateAnimationFrameRef = useRef<number>();
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [interactionEnabled, setInteractionEnabled] = useState(true);

  // Debounce p/ dados pesados
  const debouncedNodes = useDebouncedValue(nodes, PERFORMANCE_OPTIMIZATIONS.DEBOUNCE_DATA_UPDATE);
  const debouncedLinks = useDebouncedValue(links, PERFORMANCE_OPTIMIZATIONS.DEBOUNCE_DATA_UPDATE);

  // Índice rápido de nós (memo agressivo)
  const nodeIndex = useMemo(() => {
    const idx = new Map<string, { lon: number; lat: number; status?: string }>();
    for (const n of debouncedNodes) {
      if (Number.isFinite(n.lon) && Number.isFinite(n.lat)) {
        idx.set(n.id, { lon: n.lon!, lat: n.lat!, status: n.status });
      }
    }
    return idx;
  }, [debouncedNodes]);

  // GeoJSON (memo)
  const nodesGeo = useMemo(
    () => buildNodesGeoJSON(debouncedNodes, nodeFilter),
    [debouncedNodes, nodeFilter]
  );
  const linksGeo = useMemo(
    () => buildLinksGeoJSON(debouncedLinks, nodeIndex, linkFilter),
    [debouncedLinks, nodeIndex, linkFilter]
  );

  // Bounds com cache
  const dataBounds = useMemo(() => {
    const key = debouncedNodes as unknown as object;
    if (boundsCache.has(key)) return boundsCache.get(key)!;
    const bounds = computeBoundsFromNodes(debouncedNodes);
    boundsCache.set(key, bounds);
    return bounds;
  }, [debouncedNodes]);

  // Debounced view change
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

  // Controle de performance baseado em quantidade de dados
  const shouldEnableSmoothInteractions = useMemo(
    () => debouncedNodes.length <= PERFORMANCE_OPTIMIZATIONS.MAX_NODES_FOR_SMOOTH_INTERACTION,
    [debouncedNodes.length]
  );

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    const map = mapRef.current;

    if (shouldEnableSmoothInteractions !== interactionEnabled) {
      setInteractionEnabled(shouldEnableSmoothInteractions);

      if (shouldEnableSmoothInteractions) {
        map.setMaxBounds(null as unknown as LngLatBoundsLike);
        map.setRenderWorldCopies(true);
      } else {
        if (dataBounds) map.setMaxBounds(dataBounds);
        map.setRenderWorldCopies(false);
      }
    }
  }, [shouldEnableSmoothInteractions, interactionEnabled, isMapLoaded, dataBounds]);

  // Setup: init + cleanup
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
      preserveDrawingBuffer: true, // permite export/screenshot
      maxTileCacheSize: 100,
      trackResize: true,
      refreshExpiredTiles: false,
      failIfMajorPerformanceCaveat: false,
    });

    mapRef.current = map;

    popupRef.current = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '320px',
      className: 'network-map-popup',
    });

    // Controles
    if (showControls) {
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
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

    // Eventos do mapa
    map.on('load', () => {
      isLoadedRef.current = true;
      setIsMapLoaded(true);

      // Desabilita fog para performance
      // @ts-expect-error - maplibre types permitem undefined em runtime
      map.setFog(undefined);

      // Fontes
      map.addSource(SOURCE_IDS.LINKS, { type: 'geojson', data: linksGeo as any, lineMetrics: true });
      map.addSource(SOURCE_IDS.NODES, { type: 'geojson', data: nodesGeo as any });
      map.addSource(SOURCE_IDS.HIGHLIGHT, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Camadas
      // Links
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
        layout: { 'line-join': 'round', 'line-cap': 'round' },
      });

      // Nós
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

      // Labels
      if (showLabels) {
        map.addLayer({
          id: LAYER_IDS.LABELS,
          type: 'symbol',
          source: SOURCE_IDS.NODES,
          layout: {
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
            'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 10, 13],
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

      // Highlight node
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

      // Highlight link
      map.addLayer({
        id: LAYER_IDS.HIGHLIGHT_LINK,
        type: 'line',
        source: SOURCE_IDS.HIGHLIGHT,
        paint: {
          'line-color': STATUS_COLORS.selected,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 4, 12, 8],
          'line-opacity': 0.8,
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' },
      });

      // Interações
      const setPointer = (on: boolean) =>
        map.getCanvas().style.setProperty('cursor', on ? 'pointer' : '');

      const handleMouseEnter = (e: MapLayerMouseEvent) => {
        setPointer(true);
        const f = e.features?.[0];
        if (f) hoveredFeatureIdRef.current = (f.properties as any)?.id ?? null;
      };
      const handleMouseLeave = () => {
        setPointer(false);
        hoveredFeatureIdRef.current = null;
      };

      map.on('mousemove', LAYER_IDS.LINKS, handleMouseEnter);
      map.on('mouseleave', LAYER_IDS.LINKS, handleMouseLeave);
      map.on('mousemove', LAYER_IDS.NODES, handleMouseEnter);
      map.on('mouseleave', LAYER_IDS.NODES, handleMouseLeave);

      // Clicks
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

      // Double click = zoom in em nós
      map.on('dblclick', LAYER_IDS.NODES, (e: MapLayerMouseEvent) => {
        map.easeTo({
          center: e.lngLat,
          zoom: Math.min(map.getZoom() + 2, 18),
          duration: 500,
        });
      });

      // Track moves
      map.on('moveend', () => handleViewChange(map));

      // Fit inicial
      if (
        fitToData &&
        debouncedNodes.length > 0 &&
        debouncedNodes.length <= PERFORMANCE_CONFIG.MAX_NODES_FOR_AUTO_FIT
      ) {
        const bounds = dataBounds;
        if (bounds) {
          map.fitBounds(bounds, {
            padding: fitPadding,
            duration: fitDuration,
            maxZoom: 15,
          });
        }
      }

      onLoad?.();
    });

    // Eventos de erro e WebGL
    map.on('error', (e) => console.error('MapLibre error:', (e as any).error || e));
    map.on('webglcontextlost', () => console.warn('WebGL context lost'));
    map.on('webglcontextrestored', () => console.info('WebGL context restored'));

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    // Cleanup
    return () => {
      resizeObserver.disconnect();

      if (viewChangeTimeoutRef.current) {
        window.clearTimeout(viewChangeTimeoutRef.current);
        viewChangeTimeoutRef.current = null;
      }

      if (updateAnimationFrameRef.current) {
        cancelAnimationFrame(updateAnimationFrameRef.current);
      }

      popupRef.current?.remove();

      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (err) {
          console.debug('Error during map cleanup:', err);
        }
        mapRef.current = null;
      }

      isLoadedRef.current = false;
      setIsMapLoaded(false);
    };
  }, [
    styleUrl,
    showControls,
    handleViewChange,
    fitToData,
    debouncedNodes.length,
    fitDuration,
    fitPadding,
    initialView.center,
    initialView.zoom,
    initialView.pitch,
    initialView.bearing,
    onLoad,
    dataBounds,
  ]);

  // Atualização otimizada de dados das fontes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    const updateSources = () => {
      const linksSrc = map.getSource(SOURCE_IDS.LINKS) as maplibregl.GeoJSONSource;
      const nodesSrc = map.getSource(SOURCE_IDS.NODES) as maplibregl.GeoJSONSource;

      linksSrc?.setData(linksGeo as any);
      nodesSrc?.setData(nodesGeo as any);
    };

    if (updateAnimationFrameRef.current) {
      cancelAnimationFrame(updateAnimationFrameRef.current);
    }
    updateAnimationFrameRef.current = requestAnimationFrame(updateSources);

    // Auto-fit otimizado
    if (fitToData && dataBounds && shouldEnableSmoothInteractions) {
      const performFit = () => {
        try {
          map.fitBounds(dataBounds, {
            padding: fitPadding,
            duration: fitDuration,
            maxZoom: 15,
          });
        } catch (error) {
          console.warn('Fit bounds failed:', error);
        }
      };

      // pequeno atraso para evitar conflito com outras animações
      const t = setTimeout(performFit, 50);
      return () => clearTimeout(t);
    }
  }, [
    nodesGeo,
    linksGeo,
    fitToData,
    fitDuration,
    fitPadding,
    dataBounds,
    shouldEnableSmoothInteractions,
  ]);

  // Highlight de seleção
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    const highlightSrc = map.getSource(SOURCE_IDS.HIGHLIGHT) as maplibregl.GeoJSONSource;
    if (!highlightSrc) return;

    const features: GeoJSON.Feature[] = [];

    if (selected.node) {
      const n = selected.node;
      if (Number.isFinite(n.lon) && Number.isFinite(n.lat)) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [n.lon!, n.lat!] },
          properties: { id: n.id, type: 'node' },
        } as GeoJSON.Feature);
      }
    }

    if (selected.link) {
      const l = selected.link;
      const a = nodeIndex.get(l.source);
      const b = nodeIndex.get(l.target);
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
          properties: { id: l.id, type: 'link' },
        } as GeoJSON.Feature);
      }
    }

    highlightSrc.setData({
      type: 'FeatureCollection',
      features,
    } as GeoJSON.FeatureCollection);
  }, [selected, nodeIndex]);

  // Expor métodos imperativos
  useImperativeHandle(
    forwardedRef,
    () => ({
      getMap: () => mapRef.current,

      flyTo: (options) => {
        if (mapRef.current) {
          mapRef.current.flyTo({
            center: options.center,
            zoom: options.zoom ?? mapRef.current.getZoom(),
            duration: options.duration ?? 1000,
          });
        }
      },

      fitBounds: (bounds, options = {}) => {
        if (mapRef.current) {
          mapRef.current.fitBounds(bounds, {
            padding: fitPadding,
            duration: fitDuration,
            maxZoom: 15,
            ...options,
          });
        }
      },

      resetView: () => {
        if (mapRef.current) {
          mapRef.current.easeTo({
            center: initialView.center ?? DEFAULT_VIEW.center,
            zoom: initialView.zoom ?? DEFAULT_VIEW.zoom,
            pitch: initialView.pitch ?? DEFAULT_VIEW.pitch,
            bearing: initialView.bearing ?? DEFAULT_VIEW.bearing,
            duration: 800,
          });
        }
      },

      getView: (): MapViewState | null => {
        if (!mapRef.current) return null;
        const center = mapRef.current.getCenter();
        return {
          center: [center.lng, center.lat],
          zoom: mapRef.current.getZoom(),
          pitch: mapRef.current.getPitch(),
          bearing: mapRef.current.getBearing(),
        };
      },

      getZoom: () => mapRef.current?.getZoom() ?? 0,

      setZoom: (zoom: number) => {
        if (mapRef.current) mapRef.current.setZoom(zoom);
      },

      getCenter: () => {
        if (!mapRef.current) return null;
        const c = mapRef.current.getCenter();
        return [c.lng, c.lat];
      },

      setCenter: (center: [number, number]) => {
        if (mapRef.current) mapRef.current.setCenter(center);
      },

      easeTo: (options: any) => {
        if (mapRef.current) mapRef.current.easeTo(options);
      },

      jumpTo: (options: any) => {
        if (mapRef.current) mapRef.current.jumpTo(options);
      },

      // ---- estendidos ----

      focusOnNode: (nodeId: string) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (
          node &&
          Number.isFinite(node.lon) &&
          Number.isFinite(node.lat) &&
          mapRef.current
        ) {
          mapRef.current.flyTo({
            center: [node.lon!, node.lat!],
            zoom: Math.max(mapRef.current.getZoom(), 12),
            duration: 1000,
          });
        }
      },

      focusOnLink: (linkId: string) => {
        const link = links.find((l) => l.id === linkId);
        if (link && mapRef.current) {
          const sourceNode = nodes.find((n) => n.id === link.source);
          const targetNode = nodes.find((n) => n.id === link.target);

          if (
            sourceNode &&
            targetNode &&
            Number.isFinite(sourceNode.lon) &&
            Number.isFinite(sourceNode.lat) &&
            Number.isFinite(targetNode.lon) &&
            Number.isFinite(targetNode.lat)
          ) {
            const center: [number, number] = [
              (sourceNode.lon! + targetNode.lon!) / 2,
              (sourceNode.lat! + targetNode.lat!) / 2,
            ];

            mapRef.current.flyTo({
              center,
              zoom: Math.max(mapRef.current.getZoom(), 10),
              duration: 1000,
            });
          }
        }
      },

      exportMap: (filename = `network-map-${new Date().toISOString().slice(0, 19)}.png`) => {
        const map = mapRef.current;
        if (!map) return;
        try {
          const canvas = map.getCanvas();
          const link = document.createElement('a');
          link.download = filename;
          link.href = canvas.toDataURL('image/png');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (error) {
          console.error('Failed to export map:', error);
        }
      },

      getDataBounds: () => dataBounds,

      setInteractions: (enabled: boolean) => {
        const map = mapRef.current;
        if (!map) return;
        if (enabled) {
          map.boxZoom.enable();
          map.doubleClickZoom.enable();
          map.dragPan.enable();
          map.dragRotate.enable();
          map.keyboard.enable();
          map.scrollZoom.enable();
          map.touchZoomRotate.enable();
        } else {
          map.boxZoom.disable();
          map.doubleClickZoom.disable();
          map.dragPan.disable();
          map.dragRotate.disable();
          map.keyboard.disable();
          map.scrollZoom.disable();
          map.touchZoomRotate.disable();
        }
      },

      addCustomLayer: (layer: any, beforeLayerId?: string) => {
        if (!mapRef.current || !isLoadedRef.current) return false;
        try {
          mapRef.current.addLayer(layer, beforeLayerId);
          return true;
        } catch (error) {
          console.error('Failed to add custom layer:', error);
          return false;
        }
      },

      removeCustomLayer: (layerId: string) => {
        if (!mapRef.current || !isLoadedRef.current) return false;
        try {
          if (mapRef.current.getLayer(layerId)) {
            mapRef.current.removeLayer(layerId);
            return true;
          }
          return false;
        } catch (error) {
          console.error('Failed to remove custom layer:', error);
          return false;
        }
      },

      getContainer: () => containerRef.current,
    }),
    [
      initialView.center,
      initialView.zoom,
      initialView.pitch,
      initialView.bearing,
      fitPadding,
      fitDuration,
      nodes,
      links,
      dataBounds,
    ]
  );

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
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            color: '#64748b',
            fontSize: '14px',
            zIndex: 1,
          }}
        >
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <div>Carregando mapa...</div>
            <div className="text-xs text-slate-500 mt-1">
              {nodes.length} nós • {links.length} links
            </div>
          </div>
        </div>
      )}

      {isMapLoaded && !interactionEnabled && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: 'rgba(255, 255, 255, 0.9)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#64748b',
            border: '1px solid #e2e8f0',
            zIndex: 2,
          }}
        >
          ⚡ Modo performance ativo
        </div>
      )}
    </div>
  );
});

export default NetworkMap;

// -------------------- Exports de tipos/úteis --------------------

export type { Props as NetworkMapProps };
export type { NetworkMapImperativeHandle };

export function createBoundsFromNodes(nodes: TopologyNode[]): LngLatBoundsLike | null {
  return computeBoundsFromNodes(nodes);
}

// Utilitários de export/geo
export const MapExportUtils = {
  /** Exporta com configurações customizadas */
  exportWithOptions: async (
    map: MLMap,
    options: {
      filename?: string;
      format?: 'png' | 'jpeg';
      quality?: number;
      width?: number;
      height?: number;
    } = {}
  ): Promise<boolean> => {
    try {
      const {
        filename = `network-map-${new Date().toISOString().slice(0, 19)}.png`,
        format = 'png',
        quality = 0.92,
        width,
        height,
      } = options;

      const canvas = map.getCanvas();
      const actualWidth = width || canvas.width;
      const actualHeight = height || canvas.height;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = actualWidth;
      tempCanvas.height = actualHeight;

      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return false;

      ctx.drawImage(canvas, 0, 0, actualWidth, actualHeight);

      const dataUrl = tempCanvas.toDataURL(`image/${format}`, quality);

      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return true;
    } catch (error) {
      console.error('Export with options failed:', error);
      return false;
    }
  },

  /** Gera bounds para um conjunto de nodes */
  computeBounds: (nodes: TopologyNode[]): LngLatBoundsLike | null => {
    return computeBoundsFromNodes(nodes);
  },

  /** Calcula o centro de um link */
  getLinkCenter: (link: TopologyLink, nodesList: TopologyNode[]): [number, number] | null => {
    const sourceNode = nodesList.find((n) => n.id === link.source);
    const targetNode = nodesList.find((n) => n.id === link.target);

    if (
      !sourceNode ||
      !targetNode ||
      !Number.isFinite(sourceNode.lon) ||
      !Number.isFinite(sourceNode.lat) ||
      !Number.isFinite(targetNode.lon) ||
      !Number.isFinite(targetNode.lat)
    ) {
      return null;
    }

    return [(sourceNode.lon! + targetNode.lon!) / 2, (sourceNode.lat! + targetNode.lat!) / 2];
  },
};

// Hook de conveniência
export function useNetworkMap() {
  const mapRef = useRef<NetworkMapImperativeHandle>(null);

  const focusOnNode = useCallback((nodeId: string) => {
    mapRef.current?.focusOnNode?.(nodeId);
  }, []);

  const focusOnLink = useCallback((linkId: string) => {
    mapRef.current?.focusOnLink?.(linkId);
  }, []);

  const exportMap = useCallback((filename?: string) => {
    mapRef.current?.exportMap?.(filename);
  }, []);

  const fitToData = useCallback((padding?: number) => {
    const bounds = mapRef.current?.getDataBounds?.();
    if (bounds) {
      mapRef.current?.fitBounds?.(bounds, { padding });
    }
  }, []);

  return {
    mapRef,
    actions: {
      focusOnNode,
      focusOnLink,
      exportMap,
      fitToData,
    },
  };
}

// Exportações internas úteis para debugging
export const NetworkMapInternals = {
  SOURCE_IDS,
  LAYER_IDS,
  STATUS_COLORS,
  PERFORMANCE_CONFIG,
};
