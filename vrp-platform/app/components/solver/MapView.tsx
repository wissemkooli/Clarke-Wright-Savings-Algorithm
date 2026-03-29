"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Node, Route } from "../../types/vrp";

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

export function MapView({ depot, customers, mode, routes, onMapClick, fitToNodesToken }: Props) {
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

  return (
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

      {routes.map((r, idx) => (
        <Polyline key={idx} positions={r.polyline} pathOptions={{ color: r.color, weight: 5, opacity: 0.8 }}>
          <Tooltip sticky direction="center" opacity={0.95}>
            Load: {r.total_demand}
          </Tooltip>
        </Polyline>
      ))}
    </MapContainer>
  );
}

