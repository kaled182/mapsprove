// frontend/src/components/panels/TopologyLayout.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import NetworkMap from '@/components/map/NetworkMap';
import TopologySidebar from '@/components/panels/TopologySidebar';
import {
  topologyActions,
  useSelection,
  useVisibleNodes,
  useVisibleLinks,
  type TopologyNode,
  type TopologyLink,
} from '@/store/topology';

// -------------------- Tipos para referência imperativa --------------------

export type MapViewState = {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
};

export type MapBounds = [[number, number], [number, number]];

export interface NetworkMapRef {
  /** Foca em um nó específico */
  focusOnNode: (nodeId: string) => void;
  /** Foca em um link específico */
  focusOnLink: (linkId: string) => void;
  /** Ajusta a vista para caber todos os dados */
  fitToData: (padding?: number) => void;
  /** Define uma vista específica */
  setView: (view: MapViewState) => void;
  /** Volta à vista inicial */
  resetView: () => void;
  /** Exporta o mapa como imagem */
  exportMap: (filename?: string) => void;
  /** Obtém o estado atual da vista */
  getCurrentView: () => MapViewState | null;
  /** Obtém bounds dos dados visíveis */
  getDataBounds: () => MapBounds | null;
}

// -------------------- Import seguro do stream --------------------

let useStatusStream:
  | undefined
  | ((
      opts?: {
        onTopology?: (t: {
          version?: string | number;
          nodeArray: any[];
          linkArray: any[];
        }) => void;
        onMetrics?: (m: any) => void;
        onAlert?: (a: any) => void;
        onAny?: (e: any) => void;
        persistent?: boolean;
      }
    ) => any);
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useStatusStream = require('@/hooks/useStatusStream').useStatusStream;
} catch (e) {
  // módulo opcional
}

// -------------------- NetworkMap com forwardRef para controle imperativo --------------------

const NetworkMapWithRef = forwardRef<NetworkMapRef, React.ComponentProps<typeof NetworkMap>>(
  (props, ref) => {
    // IMPORTANTE: para que isto funcione, o `NetworkMap` deve repassar o ref interno do MapLibre (forwardRef)
    const mapRef = useRef<any>(null);
    const nodes = useVisibleNodes();
    const links = useVisibleLinks();

    useImperativeHandle(
      ref,
      () => ({
        focusOnNode: (nodeId: string) => {
          const node = nodes.find((n) => n.id === nodeId);
          if (node && Number.isFinite(node.lon) && Number.isFinite(node.lat)) {
            mapRef.current?.flyTo({
              center: [node.lon!, node.lat!],
              zoom: Math.max(mapRef.current?.getZoom() || 10, 12),
              duration: 1000,
            });
          }
        },

        focusOnLink: (linkId: string) => {
          const link = links.find((l) => l.id === linkId);
          if (link) {
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
              const midLon = (sourceNode.lon! + targetNode.lon!) / 2;
              const midLat = (sourceNode.lat! + targetNode.lat!) / 2;

              mapRef.current?.flyTo({
                center: [midLon, midLat],
                zoom: Math.max(mapRef.current?.getZoom() || 8, 10),
                duration: 1000,
              });
            }
          }
        },

        fitToData: (padding = 60) => {
          const coords = nodes
            .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon))
            .map((n) => [n.lon!, n.lat!] as [number, number]);

          if (coords.length > 0) {
            let minLon = coords[0][0];
            let minLat = coords[0][1];
            let maxLon = coords[0][0];
            let maxLat = coords[0][1];

            for (const [lon, lat] of coords) {
              if (lon < minLon) minLon = lon;
              if (lat < minLat) minLat = lat;
              if (lon > maxLon) maxLon = lon;
              if (lat > maxLat) maxLat = lat;
            }

            const bounds: MapBounds = [
              [minLon, minLat],
              [maxLon, maxLat],
            ];

            mapRef.current?.fitBounds(bounds, {
              padding,
              duration: 800,
              maxZoom: 15,
            });
          }
        },

        setView: (view: MapViewState) => {
          mapRef.current?.easeTo({
            center: view.center,
            zoom: view.zoom,
            pitch: view.pitch,
            bearing: view.bearing,
            duration: 800,
          });
        },

        resetView: () => {
          mapRef.current?.easeTo({
            center: (props.initialView?.center as [number, number]) || [-47.8825, -15.7942],
            zoom: props.initialView?.zoom ?? 4,
            pitch: props.initialView?.pitch ?? 0,
            bearing: props.initialView?.bearing ?? 0,
            duration: 800,
          });
        },

        exportMap: (filename = `network-map-${new Date().toISOString().slice(0, 19)}.png`) => {
          try {
            const canvas = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas');
            if (!canvas) {
              console.warn('Canvas do mapa não encontrado');
              return;
            }

            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          } catch (error) {
            console.error('Falha ao exportar mapa:', error);
          }
        },

        getCurrentView: (): MapViewState | null => {
          if (!mapRef.current) return null;
          const center = mapRef.current.getCenter();
          return {
            center: [center.lng, center.lat],
            zoom: mapRef.current.getZoom(),
            pitch: mapRef.current.getPitch(),
            bearing: mapRef.current.getBearing(),
          };
        },

        getDataBounds: (): MapBounds | null => {
          const coords = nodes
            .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon))
            .map((n) => [n.lon!, n.lat!] as [number, number]);

          if (coords.length === 0) return null;

          let minLon = coords[0][0];
          let minLat = coords[0][1];
          let maxLon = coords[0][0];
          let maxLat = coords[0][1];

          for (const [lon, lat] of coords) {
            if (lon < minLon) minLon = lon;
            if (lat < minLat) minLat = lat;
            if (lon > maxLon) maxLon = lon;
            if (lat > maxLat) maxLat = lat;
          }

          return [
            [minLon, minLat],
            [maxLon, maxLat],
          ];
        },
      }),
      [nodes, links, props.initialView]
    );

    // @ts-expect-error: NetworkMap deve ser adaptado para fornecer ref do MapLibre (forwardRef)
    return <NetworkMap ref={mapRef} {...props} />;
  }
);

NetworkMapWithRef.displayName = 'NetworkMapWithRef';

// -------------------- Componente principal (forwardRef) --------------------

type Props = {
  className?: string;
  styleUrl?: string;
  autoFit?: boolean;
  showLabels?: boolean;
  mapHeight?: number | string;
  mapWidth?: number | string;
  /** Mostrar header com controles */
  showHeader?: boolean;
  /** Mostrar legendas no mapa */
  showLegend?: boolean;
  /** Callback quando a vista do mapa muda */
  onViewChange?: (view: MapViewState) => void;
  /** Callback quando dados são carregados */
  onDataLoaded?: (nodeCount: number, linkCount: number) => void;
  /** Vista inicial personalizada */
  initialView?: MapViewState;
};

// Vista padrão
const DEFAULT_VIEW: MapViewState = {
  center: [-47.8825, -15.7942],
  zoom: 4,
  pitch: 0,
  bearing: 0,
};

const TopologyLayout = forwardRef<NetworkMapRef, Props>(function TopologyLayout(
  {
    className,
    styleUrl,
    autoFit = true,
    showLabels = true,
    mapHeight = '100%',
    mapWidth = '100%',
    showHeader = false,
    showLegend = false,
    onViewChange,
    onDataLoaded,
    initialView = DEFAULT_VIEW,
  }: Props,
  forwardedRef
) {
  // Ref interno que receberá o controle do mapa
  const internalMapRef = useRef<NetworkMapRef>(null);
  // expõe o ref para o pai (proxy)
  useImperativeHandle(forwardedRef, () => internalMapRef.current as NetworkMapRef, []);

  // Estados
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const fitTimeoutRef = useRef<number | null>(null);
  const [lastAutoFitCount, setLastAutoFitCount] = useState(0);

  // Dados da store
  const nodes = useVisibleNodes();
  const links = useVisibleLinks();
  const selection = useSelection();

  // Notificar quando dados são carregados
  useEffect(() => {
    if (nodes.length > 0 || links.length > 0) {
      onDataLoaded?.(nodes.length, links.length);
    }
  }, [nodes.length, links.length, onDataLoaded]);

  // Auto-fit quando dados mudam significativamente (debounced)
  useEffect(() => {
    if (!autoFit || !isMapLoaded || nodes.length === 0) return;

    if (fitTimeoutRef.current) {
      window.clearTimeout(fitTimeoutRef.current);
    }

    fitTimeoutRef.current = window.setTimeout(() => {
      const countChanged = Math.abs(nodes.length - lastAutoFitCount) > 10;
      const timeOk = true; // heurística simples, pode-se guardar timestamp se quiser espaçar
      if (countChanged || timeOk) {
        internalMapRef.current?.fitToData();
        setLastAutoFitCount(nodes.length);
      }
    }, 800);

    return () => {
      if (fitTimeoutRef.current) window.clearTimeout(fitTimeoutRef.current);
    };
  }, [nodes.length, autoFit, isMapLoaded, lastAutoFitCount]);

  // Inicia stream (quando disponível)
  useStatusStream?.({
    persistent: true,
    onTopology: (t) => {
      topologyActions.setTopology(t.nodeArray, t.linkArray, t.version);
    },
    onMetrics: (m) => {
      if (m?.host) {
        topologyActions.updateNodeMetrics(m.host, {
          cpu: typeof m.cpu === 'number' ? m.cpu : undefined,
          memory: typeof m.mem === 'number' ? m.mem : undefined,
          disk: Array.isArray(m.disks) ? Math.max(...m.disks.map((d: any) => d.usage)) : undefined,
          lastUpdate: m.ts,
        });
      }
    },
    onAlert: (alert) => {
      // Lugar para toast/telemetria
      // console.log('Novo alerta:', alert);
    },
  });

  // --- Callbacks ---

  const handleFocusNode = useCallback((nodeId: string) => {
    topologyActions.setSelectedNode(nodeId);
    internalMapRef.current?.focusOnNode(nodeId);
  }, []);

  const handleFocusLink = useCallback((linkId: string) => {
    topologyActions.setSelectedLink(linkId);
    internalMapRef.current?.focusOnLink(linkId);
  }, []);

  const handleFitToData = useCallback((padding?: number) => {
    internalMapRef.current?.fitToData(padding);
  }, []);

  const handleResetView = useCallback(() => {
    internalMapRef.current?.resetView();
  }, []);

  const handleExportMap = useCallback((filename?: string) => {
    internalMapRef.current?.exportMap(filename);
  }, []);

  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true);
  }, []);

  const handleViewChangeInternal = useCallback(
    (view: MapViewState) => {
      onViewChange?.(view);
    },
    [onViewChange]
  );

  // Header do layout (opcional)
  const renderHeader = () => {
    if (!showHeader) return null;

    return (
      <header className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Topologia da Rede</h1>
            <p className="text-sm text-slate-600">Monitoramento em tempo real da infraestrutura de rede</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600">
              <strong>{nodes.length}</strong> nós • <strong>{links.length}</strong> links
            </div>

            <button
              onClick={() => handleFitToData()}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Ajustar Vista
            </button>
          </div>
        </div>
      </header>
    );
  };

  // Legenda do mapa (opcional)
  const renderLegend = () => {
    if (!showLegend) return null;

    return (
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg border border-slate-200 p-3 text-xs">
        <div className="font-medium text-slate-900 mb-2">Legenda</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Operacional</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>Degradado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Inoperante</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-400" />
            <span>Desconhecido</span>
          </div>
        </div>
      </div>
    );
  };

  // helper para "merge" de refs (encaminhar o instance também para o ref externo, se houver)
  const attachMapRef = useCallback(
    (instance: NetworkMapRef | null) => {
      internalMapRef.current = instance;
      if (!forwardedRef) return;
      if (typeof forwardedRef === 'function') {
        forwardedRef(instance);
      } else {
        (forwardedRef as React.MutableRefObject<NetworkMapRef | null>).current = instance;
      }
    },
    [forwardedRef]
  );

  return (
    <div className={['w-full h-full flex flex-col bg-slate-100', className || ''].join(' ')}>
      {renderHeader()}

      <div className="flex-1 flex">
        {/* Coluna do mapa */}
        <div className="flex-1 relative">
          <NetworkMapWithRef
            ref={attachMapRef}
            styleUrl={styleUrl}
            initialView={initialView}
            fitToData={false} // controlado via ref agora
            showLabels={showLabels}
            className="h-full w-full"
            height={mapHeight}
            width={mapWidth}
            // estes handlers dependem de o NetworkMap suportar as props correspondentes
            // (ok incluir no NetworkMap: onLoad e onViewChange)
            // @ts-expect-error: NetworkMap deve expor onLoad
            onLoad={handleMapLoad}
            onViewChange={handleViewChangeInternal}
          />

          {renderLegend()}

          {/* Indicador de carregamento */}
          {!isMapLoaded && (
            <div className="absolute inset-0 bg-slate-900/10 flex items-center justify-center">
              <div className="bg-white rounded-lg shadow-lg px-6 py-4 flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                <div className="text-sm text-slate-700">Carregando mapa...</div>
              </div>
            </div>
          )}
        </div>

        {/* Coluna do painel lateral */}
        <TopologySidebar
          onFocusNode={handleFocusNode}
          onFocusLink={handleFocusLink}
          onFitToData={() => handleFitToData(80)} // padding extra no ajuste manual
          onResetView={handleResetView}
          onExportMap={handleExportMap}
          compactFilters={false}
          showAdvancedFilters={true}
          showAlertsSection={true}
          showProblemsSection={true}
        />
      </div>
    </div>
  );
});

export default TopologyLayout;

// -------------------- Hook para controle do layout --------------------

export function useTopologyLayout() {
  const mapRef = useRef<NetworkMapRef>(null);

  const focusOnNode = useCallback((nodeId: string) => {
    mapRef.current?.focusOnNode(nodeId);
  }, []);

  const focusOnLink = useCallback((linkId: string) => {
    mapRef.current?.focusOnLink(linkId);
  }, []);

  const fitToData = useCallback((padding?: number) => {
    mapRef.current?.fitToData(padding);
  }, []);

  const resetView = useCallback(() => {
    mapRef.current?.resetView();
  }, []);

  const exportMap = useCallback((filename?: string) => {
    mapRef.current?.exportMap(filename);
  }, []);

  const getCurrentView = useCallback((): MapViewState | null => {
    return mapRef.current?.getCurrentView() || null;
  }, []);

  const getDataBounds = useCallback((): MapBounds | null => {
    return mapRef.current?.getDataBounds() || null;
  }, []);

  return {
    mapRef,
    actions: {
      focusOnNode,
      focusOnLink,
      fitToData,
      resetView,
      exportMap,
      getCurrentView,
      getDataBounds,
    },
  };
}

// -------------------- Componente de loading --------------------

export function TopologyLoading() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
        <div className="text-lg font-medium text-slate-700">Carregando Topologia</div>
        <div className="text-sm text-slate-500 mt-1">Conectando aos dados em tempo real...</div>
      </div>
    </div>
  );
}
