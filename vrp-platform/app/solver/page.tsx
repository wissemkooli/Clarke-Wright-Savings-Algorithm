"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Node, Route as VrpRoute, VRPResponse } from "../types/vrp";
import { solveClarkeWright } from "../services/vrpApi";
import { ControlPanel } from "../components/solver/ControlPanel";
import { NodesList } from "../components/solver/NodesList";
import { SavingsTable } from "../components/solver/SavingsTable";
import { AlgorithmSteps } from "../components/solver/AlgorithmSteps";

type RenderRoute = VrpRoute & {
  color: string;
  polyline: Array<[number, number]>;
};

const MapView = dynamic(() => import("../components/solver/MapView").then((m) => m.MapView), {
  ssr: false,
});

export default function SolverPage() {
  const nextCustomerId = useRef(1);
  const [mode, setMode] = useState<"idle" | "setDepot" | "addCustomer">("idle");
  const [depot, setDepot] = useState<Node | null>(null);
  const [customers, setCustomers] = useState<Node[]>([]);
  const [vehicleCapacity, setVehicleCapacity] = useState<number>(100);
  const [defaultDemand, setDefaultDemand] = useState<number>(15);

  const [activeTab, setActiveTab] = useState<"savings" | "steps">("savings");
  const [statusText, setStatusText] = useState<string>('Click "Set depot" to start.');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [solution, setSolution] = useState<VRPResponse | null>(null);
  const [renderRoutes, setRenderRoutes] = useState<RenderRoute[]>([]);
  const [fitToNodesToken, setFitToNodesToken] = useState<number>(0);

  useEffect(() => {
    document.title = "Solver · VRP Lab";
  }, []);

  const capacityViolationMessage = useMemo(() => {
    if (!Number.isFinite(vehicleCapacity) || vehicleCapacity <= 0) {
      return "Enter a valid vehicle capacity greater than zero.";
    }
    const bad = customers.filter((c) => c.demand > vehicleCapacity);
    if (!bad.length) return null;
    if (bad.length === 1) {
      const c = bad[0]!;
      return `Customer ${c.id} has demand ${c.demand} which exceeds vehicle capacity ${vehicleCapacity}.`;
    }
    return (
      `The following customers exceed vehicle capacity (${vehicleCapacity}): ` +
      bad.map((c) => `customer ${c.id} (demand ${c.demand})`).join(", ") +
      "."
    );
  }, [customers, vehicleCapacity]);

  const disableSolve = useMemo(() => {
    const baseDisable = !depot || customers.length < 2 || isLoading;
    const badCapacity = !Number.isFinite(vehicleCapacity) || vehicleCapacity <= 0;
    return baseDisable || badCapacity || capacityViolationMessage !== null;
  }, [capacityViolationMessage, customers.length, depot, isLoading, vehicleCapacity]);

  const clearAll = useCallback(() => {
    setDepot(null);
    setCustomers([]);
    nextCustomerId.current = 1;
    setMode("idle");
    setSolution(null);
    setRenderRoutes([]);
    setError(null);
    setStatusText('Click "Set depot" to start');
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (mode === "setDepot") {
        const node: Node = { id: 0, lat, lng, x: lng, y: lat, demand: 0 };
        setDepot(node);
        setMode("idle");
        setSolution(null);
        setRenderRoutes([]);
        setError(null);
        setStatusText("Depot set! Now add customers.");
        return;
      }

      if (mode === "addCustomer") {
        const id = nextCustomerId.current++;
        const demand = Number.isFinite(defaultDemand) && defaultDemand >= 0 ? Math.trunc(defaultDemand) : 0;
        const customer: Node = { id, lat, lng, x: lng, y: lat, demand };
        setCustomers((prev) => [...prev, customer]);
        setSolution(null);
        setRenderRoutes([]);
        setError(null);
        setStatusText("Customer added! Add more or click Solve.");
      }
    },
    [defaultDemand, mode],
  );

  const deleteCustomer = useCallback((customerId: number) => {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
  }, []);

  const colors = useMemo(
    () => ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e"],
    [],
  );

  const buildRenderRoutes = useCallback(
    (data: VRPResponse) => {
      if (!depot) return;
      const rendered: RenderRoute[] = data.routes
        .filter((route) => route.geometry?.length)
        .map((route, idx) => ({
          ...route,
          color: colors[idx % colors.length]!,
          polyline: route.geometry,
        }));
      setRenderRoutes(rendered);
      setStatusText(` Solution complete! ${data.routes.length} vehicles used.`);
    },
    [colors, depot],
  );

  const solve = useCallback(async () => {
    if (!depot) {
      setStatusText("Please set a depot first!");
      return;
    }
    if (customers.length < 2) {
      setStatusText("Add at least 2 customers!");
      return;
    }
    if (capacityViolationMessage) {
      setStatusText(capacityViolationMessage);
      return;
    }

    const cleanNodes: Node[] = [depot, ...customers];
    const totalDemand = customers.reduce((sum, c) => sum + c.demand, 0);
    setIsLoading(true);
    setError(null);
    setRenderRoutes([]);
    setSolution(null);
    setStatusText(`Solving... Capacity: ${vehicleCapacity} | Total Demand: ${totalDemand}`);

    try {
      const data = await solveClarkeWright({
        nodes: cleanNodes,
        depot_id: 0,
        vehicle_capacity: vehicleCapacity,
      });
      setSolution(data);
      buildRenderRoutes(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatusText(message);
    } finally {
      setIsLoading(false);
    }
  }, [buildRenderRoutes, capacityViolationMessage, customers, depot, vehicleCapacity]);

  const importFromCsvText = useCallback(
    (text: string) => {
      const parsed = parseVrpCsv(text);
      if (parsed.error) {
        setStatusText(`CSV error: ${parsed.error}`);
        return;
      }
      if (!parsed.depot || !parsed.customers) {
        setStatusText("CSV error: Could not parse depot/customers.");
        return;
      }

      const depotNode: Node = {
        id: 0,
        lat: parsed.depot.lat,
        lng: parsed.depot.lng,
        x: parsed.depot.lng,
        y: parsed.depot.lat,
        demand: 0,
      };
      const customerNodes: Node[] = parsed.customers.map((c, idx) => ({
        id: idx + 1,
        lat: c.lat,
        lng: c.lng,
        x: c.lng,
        y: c.lat,
        demand: c.demand,
      }));

      setDepot(depotNode);
      setCustomers(customerNodes);
      nextCustomerId.current = customerNodes.length + 1;
      setMode("idle");
      setSolution(null);
      setRenderRoutes([]);
      setError(null);
      setFitToNodesToken((t) => t + 1);
      setStatusText(`CSV import: loaded depot and ${customerNodes.length} customer(s).`);
    },
    [],
  );

  const nodeCount = (depot ? 1 : 0) + customers.length;

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
      <link rel="stylesheet" href="/vanilla-style.css" />

      <div id="vrp-solver-root" className="solver-page">
        <div className="solver-shell">
          <div className="solver-shell__header">
            <div>
              <h1>Clarke–Wright solver</h1>
              <p>
                Set a depot and customers on the map, then run the savings
                heuristic. Routes respect capacity and follow OSRM where
                available.
              </p>
            </div>
            <Link href="/" className="solver-back">
              ← Home
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(280px,340px)_1fr] lg:p-6">
            <div className="flex max-h-[min(800px,70vh)] flex-col gap-5 overflow-y-auto pr-1 custom-scrollbar lg:max-h-[800px]">
              <ControlPanel
                vehicleCapacity={vehicleCapacity}
                defaultDemand={defaultDemand}
                mode={mode}
                isLoading={isLoading}
                statusText={statusText}
                disableSolve={disableSolve}
                onVehicleCapacityChange={(v) => setVehicleCapacity(v)}
                onDefaultDemandChange={(v) => setDefaultDemand(v)}
                onSetDepot={() => {
                  setMode("setDepot");
                  setStatusText("Click on the map to set depot location");
                }}
                onAddCustomers={() => {
                  setMode("addCustomer");
                  setStatusText("Click on the map to add customers");
                }}
                onSolve={solve}
                onClear={clearAll}
                onImportCsvText={(csvText) => {
                  if (!csvText) {
                    setStatusText("Could not read CSV file.");
                    return;
                  }
                  importFromCsvText(csvText);
                }}
              />

              <div className="vrp-panel">
                <h2 className="vrp-panel-title">
                  Nodes (<span id="nodeCount">{nodeCount}</span>)
                </h2>
                <div id="nodesList">
                  <NodesList depot={depot} customers={customers} onDeleteCustomer={deleteCustomer} />
                </div>
              </div>

              <div className="vrp-panel" id="resultsSection" style={{ display: solution ? "block" : "none" }}>
                <h2 className="vrp-panel-title">Results</h2>
                <div id="results">
                  {solution && (
                    <ResultsSummary
                      capacity={vehicleCapacity}
                      solution={solution}
                      colors={colors}
                      error={error}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:h-[800px]">
              <div className="relative min-h-[min(420px,55vh)] flex-grow overflow-hidden rounded-[0.65rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(12,14,20,0.5)] shadow-inner lg:min-h-0">
                <div id="map" className="absolute inset-0 z-0">
                  <MapView
                    depot={depot}
                    customers={customers}
                    mode={mode}
                    routes={renderRoutes}
                    onMapClick={handleMapClick}
                    fitToNodesToken={fitToNodesToken}
                  />
                </div>
              </div>

              <div className="vrp-panel mt-5 flex-shrink-0 lg:mt-6">
                <div className="tabs pb-3">
                  <button
                    className={`tab-btn ${activeTab === "savings" ? "active" : ""}`}
                    type="button"
                    data-tab="savings"
                    onClick={() => setActiveTab("savings")}
                  >
                    Top savings
                  </button>
                  <button
                    className={`tab-btn ${activeTab === "steps" ? "active" : ""}`}
                    type="button"
                    data-tab="steps"
                    onClick={() => setActiveTab("steps")}
                  >
                    Algorithm steps
                  </button>
                </div>

                <div className="tab-content max-h-[220px] custom-scrollbar">
                  <div id="savings-tab" className={`tab-pane ${activeTab === "savings" ? "active" : ""}`}>
                    <div id="savingsTable" className="text-[var(--text-muted)]">
                      <SavingsTable savings={solution?.savings_table ?? []} />
                    </div>
                  </div>
                  <div id="steps-tab" className={`tab-pane ${activeTab === "steps" ? "active" : ""}`}>
                    <div id="stepsContent" className="text-[var(--text-muted)]">
                      <AlgorithmSteps steps={solution?.steps ?? []} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ResultsSummary({
  capacity,
  solution,
  colors,
  error,
}: {
  capacity: number;
  solution: VRPResponse;
  colors: string[];
  error: string | null;
}) {
  if (error) {
    return <div className="info-text">{error}</div>;
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const gapPct =
    solution.total_road_distance_km != null
      ? (((solution.total_road_distance_km - solution.total_distance) / solution.total_distance) * 100).toFixed(0)
      : null;

  return (
    <div style={{ fontFamily: "inherit", fontSize: "0.82rem" }}>

      {/* ── Summary cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "6px",
        marginBottom: "12px",
      }}>
        {[
          { label: "Vehicles", value: solution.num_vehicles ?? solution.routes.length },
          { label: "Solve time", value: solution.computation_time_ms != null ? `${solution.computation_time_ms} ms` : "—" },
          { label: "Road dist.", value: solution.total_road_distance_km != null ? `${solution.total_road_distance_km.toFixed(2)} km` : "—" },
          { label: "Total drive time", value: solution.total_duration_s != null ? formatDuration(solution.total_duration_s) : "—" },
          { label: "Vehicle capacity", value: capacity },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "6px",
            padding: "8px 10px",
          }}>
            <div style={{ color: "var(--text-muted, #888)", fontSize: "0.7rem", marginBottom: "2px" }}>{label}</div>
            <div style={{ color: "var(--text, #fff)", fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>


      {/* ── Per-route breakdown ── */}
      {solution.routes.map((route, i) => {
        const utilization = Number.isFinite(capacity) && capacity > 0
          ? ((route.total_demand / capacity) * 100)
          : 0;
        const color = colors[i % colors.length] ?? "#e8a598";

        return (
          <div key={i} style={{
            borderLeft: `3px solid ${color}`,
            paddingLeft: "10px",
            marginBottom: "14px",
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

            {/* utilization bar */}
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
                  <div style={{ color: "var(--text-muted, #777)", marginBottom: "2px" }}>{label}</div>
                  <div style={{ color: "var(--text, #ddd)", fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function stripVrpCsv(text: string): string {
  if (!text) return "";
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function parseVrpCsv(text: string): {
  error?: string;
  depot?: { lat: number; lng: number };
  customers?: Array<{ lat: number; lng: number; demand: number }>;
} {
  const raw = stripVrpCsv(text);
  if (!raw) return { error: "CSV is empty." };
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { error: "CSV must have a depot row (lat, lng) and at least one customer row (lat, lng, demand)." };
  }

  const depotCells = lines[0]!.split(",").map((s) => s.trim());
  if (depotCells.length !== 2) return { error: "Row 1 (depot) must have exactly 2 columns: lat, lng." };

  const depotLat = Number(depotCells[0]);
  const depotLng = Number(depotCells[1]);
  if (!Number.isFinite(depotLat) || !Number.isFinite(depotLng)) {
    return { error: "Row 1 (depot): lat and lng must be valid numbers." };
  }
  if (depotLat < -90 || depotLat > 90 || depotLng < -180 || depotLng > 180) {
    return { error: "Row 1 (depot): lat must be between -90 and 90, lng between -180 and 180." };
  }

  const customerRows: Array<{ lat: number; lng: number; demand: number }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",").map((s) => s.trim());
    if (cells.length !== 3) return { error: `Row ${i + 1} must have exactly 3 columns: lat, lng, demand.` };

    const clat = Number(cells[0]);
    const clng = Number(cells[1]);
    const demand = Number(cells[2]);
    if (!Number.isFinite(clat) || !Number.isFinite(clng) || !Number.isFinite(demand)) {
      return { error: `Row ${i + 1}: lat, lng, and demand must be valid numbers.` };
    }
    if (clat < -90 || clat > 90 || clng < -180 || clng > 180) {
      return { error: `Row ${i + 1}: lat must be between -90 and 90, lng between -180 and 180.` };
    }
    if (demand < 0) return { error: `Row ${i + 1}: demand cannot be negative.` };
    customerRows.push({ lat: clat, lng: clng, demand });
  }

  return { depot: { lat: depotLat, lng: depotLng }, customers: customerRows };
}
