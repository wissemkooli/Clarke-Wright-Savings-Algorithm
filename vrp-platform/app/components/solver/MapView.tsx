"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Node, Route, MergeEvent } from "../../types/vrp";

type SolverMode = "idle" | "setDepot" | "addCustomer";

export type RenderRoute = Route & {
  color: string;
  polyline: Array<[number, number]>;
};

type Props = {
  depot: Node | null;
  customers: Node[];
  mode: SolverMode;
  routes: RenderRoute[];
  onMapClick: (lat: number, lng: number) => void;
  fitToNodesToken?: number;
  fitToNodesToken?: number;
  mergeEvents?: MergeEvent[];
  edgeGeometries?: Record<string, Array<[number, number]>>;
};

function CustomerMarker({ node }: { node: Node }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "custom-customer-marker",
        html: `<div style="background-color: #3498db; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${node.id}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    [node.id],
  );

  return (
    <Marker position={[node.lat, node.lng]} icon={icon}>
      <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
        Customer {node.id} · Demand {node.demand}
      </Tooltip>
    </Marker>
  );
}

function ClickHandler({ mode, onMapClick }: { mode: SolverMode; onMapClick: Props["onMapClick"] }) {
  useMapEvents({
    click(e) {
      if (mode === "setDepot" || mode === "addCustomer") {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

function FitToNodes({ depot, customers, token }: { depot: Node | null; customers: Node[]; token?: number }) {
  const map = useMap();

  useEffect(() => {
    if (!token) return;
    if (!depot) return;
    const bounds = L.latLngBounds([[depot.lat, depot.lng]]);
    for (const c of customers) bounds.extend([c.lat, c.lng]);
    try {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    } catch {
      map.setView([depot.lat, depot.lng], 13);
    }
  }, [map, depot, customers, token]);

  return null;
}

export function MapView({ depot, customers, mode, routes, onMapClick, fitToNodesToken, mergeEvents, edgeGeometries }: Props) {
  const depotIcon = useMemo(
    () =>
      L.divIcon({
        className: "custom-depot-marker",
        html: `<div style="background-color: #e74c3c; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">D</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    [],
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackStep, setPlaybackStep] = useState(0);

  useEffect(() => {
    if (!isPlaying) return;
    if (!mergeEvents || playbackStep >= mergeEvents.length - 1) {
      setIsPlaying(false);
      return;
    }
    const t = setTimeout(() => {
      setPlaybackStep((s) => s + 1);
    }, 800);
    return () => clearTimeout(t);
  }, [isPlaying, playbackStep, mergeEvents]);

  // Reset player when props change (new solve)
  useEffect(() => {
    setIsPlaying(false);
    if (mergeEvents && mergeEvents.length > 0) {
      setPlaybackStep(mergeEvents.length - 1);
    } else {
      setPlaybackStep(0);
    }
  }, [routes, mergeEvents]);

  const displayedRoutes = useMemo(() => {
    // If we're at the final step, just show the optimized routes as-is
    if (!mergeEvents || mergeEvents.length === 0) return routes;
    if (!isPlaying && playbackStep === mergeEvents.length - 1) return routes;
    
    if (!depot) return [];

    const nodeMap = new Map<number, Node>();
    for (const c of customers) nodeMap.set(c.id, c);

    const activeEvent = mergeEvents[playbackStep];
    const activeRouteNodes = activeEvent.routes;
    const routeColors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e"];

    return activeRouteNodes.map((customerIds, idx) => {
      // ── Stitch geometry for this animation frame ──
      const geom: Array<[number, number]> = [];
      const nodeSeq = [0, ...customerIds, 0]; // 0 is depot id
      
      for (let k = 0; k < nodeSeq.length - 1; k++) {
        const u = nodeSeq[k];
        const v = nodeSeq[k+1];
        const edgeKey = `${u},${v}`;
        
        const segment = edgeGeometries?.[edgeKey];
        if (segment && segment.length > 0) {
          if (geom.length === 0) {
            geom.push(...segment);
          } else {
            geom.push(...segment.slice(1)); // skip duplicate joint
          }
        } else {
          // Fallback to straight line (only for edges not in the final road cache)
          const n1 = u === 0 ? depot : nodeMap.get(u);
          const n2 = v === 0 ? depot : nodeMap.get(v);
          if (n1 && n2) {
            const straight: [number, number][] = [[n1.lat, n1.lng], [n2.lat, n2.lng]];
            if (geom.length === 0) geom.push(...straight);
            else geom.push(straight[1]);
          }
        }
      }

      let demand = 0;
      for (const cid of customerIds) {
        const c = nodeMap.get(cid);
        if (c) demand += c.demand;
      }

      return {
        customers: customerIds,
        total_demand: demand,
        total_distance: 0,
        geometry: geom,
        color: routeColors[idx % routeColors.length],
        polyline: geom
      } as RenderRoute;
    });
  }, [routes, mergeEvents, isPlaying, playbackStep, depot, customers, edgeGeometries]);

  return (
    <>
      <MapContainer
      center={[36.8065, 10.1815]}
      zoom={13}
      style={{ height: "100%", width: "100%" }}
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <ClickHandler mode={mode} onMapClick={onMapClick} />
      <FitToNodes depot={depot} customers={customers} token={fitToNodesToken} />

      {depot ? (
        <Marker position={[depot.lat, depot.lng]} icon={depotIcon}>
          <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
            Depot
          </Tooltip>
        </Marker>
      ) : null}

      {customers.map((c) => (
        <CustomerMarker key={c.id} node={c} />
      ))}

      {displayedRoutes.map((r, idx) => (
        <Polyline key={idx} positions={r.polyline} pathOptions={{ color: r.color, weight: 5, opacity: 0.8 }}>
          <Tooltip sticky direction="center" opacity={0.95}>
            Load: {r.total_demand}
          </Tooltip>
        </Polyline>
      ))}
    </MapContainer>
    
    {mergeEvents && mergeEvents.length > 0 && (
      <div className="absolute top-4 right-4 z-[400] bg-[rgba(15,20,30,0.9)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 shadow-xl flex flex-col gap-2 min-w-[200px] pointer-events-auto">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex justify-between">
          <span>Algorithm Playback</span>
          <span className="text-blue-400">Step {playbackStep} / {mergeEvents.length - 1}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); if (playbackStep >= mergeEvents.length - 1) setPlaybackStep(0); }}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded px-3 py-1.5 text-xs font-bold transition-colors"
          >
            {isPlaying ? "Pause" : (playbackStep >= mergeEvents.length - 1 ? "Replay" : "Play")}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsPlaying(false); setPlaybackStep(0); }}
            className="bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 text-xs transition-colors"
            title="Reset"
          >
            ⏮
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsPlaying(false); setPlaybackStep(mergeEvents.length - 1); }}
            className="bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 text-xs transition-colors"
            title="Skip to end"
          >
            ⏭
          </button>
        </div>
        
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
           <div 
             className="h-full bg-blue-400 transition-all duration-300"
             style={{ width: `${(playbackStep / Math.max(1, mergeEvents.length - 1)) * 100}%` }}
           />
        </div>
      </div>
    )}
    </>
  );
}

