import React from "react";
import type { VRPResponse } from "../../types/vrp";
import { ROUTE_PALETTE } from "../../constants/theme";

interface ResultsSummaryProps {
  capacity: number;
  solution: VRPResponse;
  optimalSolution?: VRPResponse;
  error: string | null;
}

export function ResultsSummary({
  capacity,
  solution,
  optimalSolution,
  error,
}: ResultsSummaryProps) {
  if (error) {
    return <div className="info-text">{error}</div>;
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const v1 = solution.num_vehicles ?? solution.routes.length;
  const v2 = optimalSolution ? (optimalSolution.num_vehicles ?? optimalSolution.routes.length) : v1;

  const t1 = solution.computation_time_ms;
  const t2 = optimalSolution?.computation_time_ms;

  const d1 = solution.total_road_distance_km;
  const d2 = optimalSolution?.total_road_distance_km;

  const dr1 = solution.total_duration_s;
  const dr2 = optimalSolution?.total_duration_s;

  const isOptimal = solution.steps?.some(s => s.includes("OPTIMAL")) ?? false;

  const cards = [
    {
      label: "Vehicles",
      value: v1,
      optValue: optimalSolution ? v2 : undefined,
      isBetter: optimalSolution ? v2 < v1 : false
    },
    {
      label: "Solve time",
      value: t1 != null ? `${(t1 / 1000).toFixed(2)} s` : "—",
      optValue: t2 != null ? `${(t2 / 1000).toFixed(2)} s` : undefined,
      isBetter: t2 != null && t1 != null ? t2 < t1 : false
    },
    {
      label: "Road dist.",
      value: d1 != null ? `${d1.toFixed(2)} km` : "—",
      optValue: d2 != null ? `${d2.toFixed(2)} km` : undefined,
      isBetter: d2 != null && d1 != null ? d2 < d1 : false
    },
    {
      label: "Total drive time",
      value: dr1 != null ? formatDuration(dr1) : "—",
      optValue: dr2 != null ? formatDuration(dr2) : undefined,
      isBetter: dr2 != null && dr1 != null ? dr2 < dr1 : false
    },
    { label: "Vehicle capacity", value: capacity },
    { label: "Status", value: isOptimal ? "OPTIMAL" : "HEURISTIC", optValue: optimalSolution ? "OPTIMAL" : undefined, highlight: isOptimal },
  ];

  const renderRoutes = (routes: typeof solution.routes, title?: string, titleColor?: string) => (
    <div className="mt-6">
      {title && <div className="mb-2 text-[0.85rem] uppercase tracking-wider font-bold" style={{ color: titleColor }}>{title}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {routes.map((route, i) => {
          const utilization = Number.isFinite(capacity) && capacity > 0
            ? ((route.total_demand / capacity) * 100)
            : 0;
          
          const minId = Math.min(...route.customers);
          const color = ROUTE_PALETTE[minId % ROUTE_PALETTE.length];

          return (
            <div key={i} className="flex flex-col" style={{
              borderLeft: `4px solid ${color}`,
              background: "rgba(255,255,255,0.02)",
              borderRadius: "0 6px 6px 0",
              padding: "12px 14px",
            }}>
              <div style={{ fontWeight: 600, color, marginBottom: "4px" }}>
                Vehicle {i + 1}
              </div>
              <div style={{
                color: "var(--text-muted, #aaa)",
                marginBottom: "6px",
                lineHeight: 1.6,
                fontSize: "0.78rem",
                wordBreak: "break-word",
              }}>
                Depot → {route.customers.join(" → ")} → Depot
              </div>

              <div style={{
                height: "4px",
                background: "rgba(255,255,255,0.08)",
                borderRadius: "2px",
                marginBottom: "8px",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${utilization}%`,
                  background: color,
                  borderRadius: "2px",
                }} />
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "4px",
                fontSize: "0.72rem",
              }}>
                {[
                  { label: "Load", value: `${route.total_demand}/${capacity} (${utilization.toFixed(0)}%)` },
                  { label: "Road dist.", value: route.road_distance_km != null ? `${route.road_distance_km.toFixed(2)} km` : "—" },
                  { label: "Drive time", value: route.duration_s != null ? formatDuration(route.duration_s) : "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "4px",
                    padding: "5px 6px",
                  }}>
                    <div style={{ color: "var(--text-muted, #777)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.3px", fontSize: "0.65rem" }}>{label}</div>
                    <div style={{ color: "var(--text, #ddd)", fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "inherit", fontSize: "0.82rem" }}>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {cards.map(({ label, value, optValue, isBetter, highlight }) => (
          <div key={label} style={{
            background: highlight ? "rgba(74, 222, 128, 0.05)" : "rgba(255,255,255,0.04)",
            border: highlight ? "1px solid rgba(74, 222, 128, 0.2)" : "1px solid rgba(255,255,255,0.08)",
            borderRadius: "6px",
            padding: "8px 10px",
          }}>
            <div style={{ color: "var(--text-muted, #888)", fontSize: "0.7rem", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span style={{ color: highlight ? "#4ade80" : "var(--text, #fff)", fontWeight: 600 }}>{value}</span>
              {optValue !== undefined && (
                <span className={isBetter ? "text-green-400 font-bold" : "text-gray-400 font-medium"} style={{ fontSize: "0.7rem", marginLeft: "2px" }}>
                  {optValue !== value ? `→ ${optValue}` : `(same)`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {optimalSolution ? (
        <>
          {renderRoutes(solution.routes, "Clarke-Wright Routes", "#f39c12")}
          {renderRoutes(optimalSolution.routes, "CPLEX Routes (Optimal)", "#3498db")}
        </>
      ) : (
        renderRoutes(solution.routes)
      )}
    </div>
  );
}
