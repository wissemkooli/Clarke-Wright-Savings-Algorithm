"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Node, Route, MergeEvent } from "../../types/vrp";

type SolverMode = "idle" | "setDepot" | "addCustomer";

export type RenderRoute = Route & {
  color: string;
  polyline: Array<[number, number]>;
  solver?: "cw" | "cplex";
};

type Props = {
  depot: Node | null;
  customers: Node[];
  mode: SolverMode;
  routes: RenderRoute[];
  onMapClick: (lat: number, lng: number) => void;
  fitToNodesToken?: number;
  mergeEvents?: MergeEvent[];
  edgeGeometries?: Record<string, Array<[number, number]>>;
  isCompareMode?: boolean;
};

import { ROUTE_PALETTE } from "../../constants/theme";

function CustomerMarker({ node, color = "#3498db" }: { node: Node, color?: string }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "custom-customer-marker",
        html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${node.id}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    [node.id, color],
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

export function MapView({
  depot,
  customers,
  mode,
  routes,
  onMapClick,
  fitToNodesToken,
  mergeEvents,
  edgeGeometries,
  isCompareMode = false
}: Props) {
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

    const isFinalStep = playbackStep === mergeEvents.length - 1;

    return activeRouteNodes.map((customerIds) => {
      // ── Stitch geometry ONLY for the final step ──
      let geom: Array<[number, number]> = [];

      if (isFinalStep) {
        const nodeSeq = [0, ...customerIds, 0]; // 0 is depot id
        for (let k = 0; k < nodeSeq.length - 1; k++) {
          const u = nodeSeq[k];
          const v = nodeSeq[k + 1];
          const edgeKey = `${u},${v}`;

          const segment = edgeGeometries?.[edgeKey];
          if (segment && segment.length > 0) {
            if (geom.length === 0) geom.push(...segment);
            else geom.push(...segment.slice(1));
          } else {
            const n1 = u === 0 ? depot : nodeMap.get(u);
            const n2 = v === 0 ? depot : nodeMap.get(v);
            if (n1 && n2) {
              const straight: [number, number][] = [[n1.lat, n1.lng], [n2.lat, n2.lng]];
              if (geom.length === 0) geom.push(...straight);
              else geom.push(straight[1]);
            }
          }
        }
      }

      let demand = 0;
      for (const cid of customerIds) {
        const c = nodeMap.get(cid);
        if (c) demand += c.demand;
      }

      // ── Dynamic but Stable Coloring ──
      // Use the minimum customer ID in the cluster as the color key.
      // This ensures that during a merge, the cluster with the smaller ID "wins" the color.
      const colorKey = Math.min(...customerIds);
      const color = ROUTE_PALETTE[colorKey % ROUTE_PALETTE.length];

      return {
        customers: customerIds,
        total_demand: demand,
        total_distance: 0,
        geometry: geom,
        color: color,
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

        {customers.map((c) => {
          // In compare mode nodes are shared by both solvers — use a neutral color
          // so the route lines (orange CW / blue CPLEX) tell the story.
          // In normal mode, inherit the route's palette color.
          let color: string;
          if (isCompareMode) {
            color = "#3d2ad2";
          } else {
            const assignedRoute = displayedRoutes.find(r => r.customers.includes(c.id));
            color = assignedRoute ? assignedRoute.color : ROUTE_PALETTE[c.id % ROUTE_PALETTE.length];
          }
          return <CustomerMarker key={c.id} node={c} color={color} />;
        })}

        {displayedRoutes.map((r, idx) => {
          // In compare mode use the pre-assigned algorithm color directly.
          // In normal mode use stable min-ID palette coloring.
          const lineColor = isCompareMode
            ? r.color
            : ROUTE_PALETTE[Math.min(...r.customers) % ROUTE_PALETTE.length];
          // CPLEX routes get a dash pattern so both algorithms are legible when they overlap
          const dashArray = (isCompareMode && r.solver === "cplex") ? "10 6" : undefined;
          const weight = (isCompareMode && r.solver === "cplex") ? 4 : 5;

          return (
            <Polyline
              key={idx}
              positions={r.polyline}
              pathOptions={{ color: lineColor, weight, opacity: 0.9, dashArray }}
            >
              <Tooltip sticky direction="center" opacity={0.95}>
                {isCompareMode ? (
                  <>
                    <strong>{r.solver === "cw" ? "Clarke-Wright" : "CPLEX"}</strong><br />
                    Load: {r.total_demand}
                  </>
                ) : (
                  <>Load: {r.total_demand}</>
                )}
              </Tooltip>
            </Polyline>
          );
        })}
      </MapContainer>

      {/* ── Compare-mode legend (sits where the playback panel normally is) ── */}
      {isCompareMode && (
        <div className="absolute top-4 right-4 z-[400] bg-[rgba(12,16,26,0.93)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3.5 shadow-2xl min-w-[190px] pointer-events-auto" style={{ backdropFilter: "blur(12px)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Map Legend
          </div>
          <div className="flex flex-col gap-3">

            {/* Clarke-Wright */}
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0" style={{ width: 32, height: 3, background: "#f97316", borderRadius: 2 }} />
              <div>
                <div className="text-[11px] font-semibold text-white">Clarke-Wright</div>
                <div className="text-[9px] uppercase tracking-wider" style={{ color: "#f9731680" }}>Heuristic</div>
              </div>
            </div>

            {/* CPLEX */}
            <div className="flex items-center gap-3">
              <svg className="flex-shrink-0" width="32" height="4" viewBox="0 0 32 4">
                <line x1="0" y1="2" x2="32" y2="2" stroke="#3b82f6" strokeWidth="3" strokeDasharray="7 4" strokeLinecap="round" />
              </svg>
              <div>
                <div className="text-[11px] font-semibold text-white">IBM CPLEX</div>
                <div className="text-[9px] uppercase tracking-wider" style={{ color: "#3b82f680" }}>Optimal</div>
              </div>
            </div>

            {/* Shared nodes */}
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 flex justify-center" style={{ width: 32 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#3d2ad2", border: "2px solid white", boxShadow: "0 1px 4px rgba(0,0,0,0.5)" }} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-white">Customer Node</div>
                <div className="text-[9px] uppercase tracking-wider text-gray-500">Shared</div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Algorithm playback (hidden in compare mode) ── */}
      {!isCompareMode && mergeEvents && mergeEvents.length > 0 && (
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

