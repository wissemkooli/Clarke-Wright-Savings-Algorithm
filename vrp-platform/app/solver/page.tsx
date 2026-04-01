"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Node, Route as VrpRoute, VRPResponse } from "../types/vrp";
import { solveClarkeWright, solveCplex, solveCompare } from "../services/vrpApi";
import { ControlPanel } from "../components/solver/ControlPanel";
import { NodesList } from "../components/solver/NodesList";
import { SavingsTable } from "../components/solver/SavingsTable";
import { AlgorithmSteps } from "../components/solver/AlgorithmSteps";

// Defining comparison type locally since vrp.ts wasn't updated
type VRPComparisonResponse = {
  clarke_wright: VRPResponse;
  cplex: VRPResponse;
};

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

  // Algorithm State
  const [activeAlgs, setActiveAlgs] = useState<string[]>(["clarke-wright"]);

  const [activeTab, setActiveTab] = useState<"savings" | "steps">("savings");
  const [statusText, setStatusText] = useState<string>('Click "Set depot" to start.');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [solution, setSolution] = useState<VRPResponse | null>(null);
  const [comparisonSolution, setComparisonSolution] = useState<VRPComparisonResponse | null>(null);
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
    const baseDisable = !depot || customers.length < 2 || isLoading || activeAlgs.length === 0;
    const badCapacity = !Number.isFinite(vehicleCapacity) || vehicleCapacity <= 0;
    return baseDisable || badCapacity || capacityViolationMessage !== null;
  }, [activeAlgs.length, capacityViolationMessage, customers.length, depot, isLoading, vehicleCapacity]);

  const clearAll = useCallback(() => {
    setDepot(null);
    setCustomers([]);
    nextCustomerId.current = 1;
    setMode("idle");
    setSolution(null);
    setComparisonSolution(null);
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
        setComparisonSolution(null);
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
        setComparisonSolution(null);
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
    if (!depot || customers.length < 2 || capacityViolationMessage) return;

    const payload = {
      nodes: [depot, ...customers],
      depot_id: 0,
      vehicle_capacity: vehicleCapacity,
    };

    setIsLoading(true);
    setError(null);
    setRenderRoutes([]);
    setSolution(null);
    setComparisonSolution(null);

    const isCW = activeAlgs.includes("clarke-wright");
    const isCplex = activeAlgs.includes("cplex");

    // Temporary storage for results as they arrive
    let cwRes: VRPResponse | null = null;
    let cpRes: VRPResponse | null = null;

    // Helper to merge and plot routes
    const updateMap = () => {
      const combined: RenderRoute[] = [];

      // Add Clarke-Wright (Heuristic) - Plotted in Orange/Dimmed
      if (cwRes) {
        combined.push(...cwRes.routes.map((r, i) => ({
          ...r,
          // If comparing, make CW orange. If solo, use standard colors.
          color: (isCW && isCplex) ? "#f39c12" : colors[i % colors.length],
          polyline: r.geometry,
        })));
      }

      // Add CPLEX (Optimal) - Plotted in Blue/Bold
      if (cpRes) {
        combined.push(...cpRes.routes.map((r, i) => ({
          ...r,
          color: (isCW && isCplex) ? "#3498db" : colors[i % colors.length],
          polyline: r.geometry,
        })));
      }
      setRenderRoutes(combined);
    };

    try {
      // 🔥 Start both at the same time, but handle them as they finish
      const cwPromise = isCW ? solveClarkeWright(payload).then(data => {
        cwRes = data;
        if (!cpRes) {
          setSolution(data); // Show CW stats while waiting
          setStatusText("Heuristic found! Waiting for CPLEX to optimize...");
        }
        updateMap();
      }) : Promise.resolve();

      const cpPromise = isCplex ? solveCplex(payload).then(data => {
        cpRes = data;
        setSolution(data); // Final stats show the Optimal result
        updateMap();
      }) : Promise.resolve();

      // Wait for the slow one to finish for the final comparison card
      await Promise.all([cwPromise, cpPromise]);

      if (cwRes && cpRes) {
        setComparisonSolution({ clarke_wright: cwRes, cplex: cpRes });
        setStatusText("Comparison complete! Heuristic (Orange) vs Optimal (Blue)");
      } else {
        setStatusText("Solution complete!");
      }

    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatusText(message);
    } finally {
      setIsLoading(false);
    }
  }, [activeAlgs, colors, capacityViolationMessage, customers, depot, vehicleCapacity]);
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
      setComparisonSolution(null);
      setRenderRoutes([]);
      setError(null);
      setFitToNodesToken((t) => t + 1);
      setStatusText(`CSV import: loaded depot and ${customerNodes.length} customer(s).`);
    },
    [],
  );

  const nodeCount = (depot ? 1 : 0) + customers.length;

  const toggleAlgorithm = (id: string) => {
    setActiveAlgs(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
      <link rel="stylesheet" href="/vanilla-style.css" />

      <div id="vrp-solver-root" className="solver-page">
        <div className="solver-shell">
          <div className="solver-shell__header">
            <div>
              <h1>VRP Multi-Engine Solver</h1>
              <p>
                Heuristic or Exact Optimal? Toggle algorithms to solve or compare performance.
              </p>

              {/* Algorithm Toggles */}
              <div className="flex gap-3 mt-4">
                {[
                  { id: "clarke-wright", label: "Clarke-Wright" },
                  { id: "cplex", label: "IBM CPLEX" }
                ].map((alg) => (
                  <button
                    key={alg.id}
                    onClick={() => toggleAlgorithm(alg.id)}
                    className={`px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold transition-all border ${activeAlgs.includes(alg.id)
                      ? "bg-blue-500/20 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                      : "bg-white/5 border-white/10 text-gray-500 hover:border-white/20"
                      }`}
                  >
                    {alg.label} {activeAlgs.includes(alg.id) && "✓"}
                  </button>
                ))}
                {activeAlgs.length === 2 && (
                  <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-1.5 rounded-full uppercase font-black self-center animate-pulse">
                    Comparison Mode
                  </span>
                )}
              </div>
            </div>
            <Link href="/" className="solver-back">
              ← Home
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(320px,400px)_1fr] lg:p-6">
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

              <div className="vrp-panel flex-shrink-0">
                <h2 className="vrp-panel-title">
                  Nodes (<span id="nodeCount">{nodeCount}</span>)
                </h2>
                <div id="nodesList">
                  <NodesList depot={depot} customers={customers} onDeleteCustomer={deleteCustomer} />
                </div>
              </div>

              <div className="vrp-panel flex-shrink-0 flex flex-col overflow-hidden" style={{ display: (solution || comparisonSolution) ? "flex" : "none" }}>
                <div className="tabs pb-3 flex flex-wrap gap-2">
                  <button
                    className={`tab-btn flex-1 text-xs px-2 py-1.5 whitespace-nowrap ${activeTab === "savings" ? "active" : ""}`}
                    type="button"
                    data-tab="savings"
                    onClick={() => setActiveTab("savings")}
                  >
                    Top savings
                  </button>
                  <button
                    className={`tab-btn flex-1 text-xs px-2 py-1.5 whitespace-nowrap ${activeTab === "steps" ? "active" : ""}`}
                    type="button"
                    data-tab="steps"
                    onClick={() => setActiveTab("steps")}
                  >
                    Algorithm steps
                  </button>
                </div>

                <div className="tab-content relative flex-grow overflow-y-auto overflow-x-auto custom-scrollbar max-h-[400px]">
                  <div id="savings-tab" className={`tab-pane ${activeTab === "savings" ? "active" : ""}`}>
                    <div id="savingsTable" className="text-[var(--text-muted)] text-[11px] min-w-[280px] pb-2">
                      <SavingsTable savings={comparisonSolution?.clarke_wright.savings_table ?? solution?.savings_table ?? []} />
                    </div>
                  </div>
                  <div id="steps-tab" className={`tab-pane ${activeTab === "steps" ? "active" : ""}`}>
                    <div id="stepsContent" className="text-[var(--text-muted)] text-[11px] min-w-[280px]">
                      <AlgorithmSteps steps={comparisonSolution?.clarke_wright.steps ?? solution?.steps ?? []} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:h-[800px]">
              <div className="relative h-[400px] flex-shrink-0 overflow-hidden rounded-[0.65rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(12,14,20,0.5)] shadow-inner">
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

              <div className="vrp-panel mt-5 flex-grow flex-col lg:mt-6 overflow-hidden" id="resultsSection" style={{ display: (solution || comparisonSolution) ? "flex" : "none" }}>
                <h2 className="vrp-panel-title flex-shrink-0">Results</h2>
                <div id="results" className="overflow-y-auto custom-scrollbar pr-2 flex-grow">
                  {comparisonSolution ? (
                    <div className="space-y-4">
                      {/* Comparison Quick-View Card */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{
                        background: "rgba(59,130,246,0.05)",
                        border: "1px solid rgba(59,130,246,0.2)",
                        borderRadius: "8px",
                        padding: "16px",
                        marginBottom: "16px"
                      }}>
                        <div>
                          <div style={{ color: "#888", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Heuristic (Clarke-Wright)</div>
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.2rem", marginTop: "4px" }}>{comparisonSolution.clarke_wright.total_road_distance_km?.toFixed(2)} km</div>
                        </div>
                        <div className="flex flex-col">
                          <div style={{ color: "#60a5fa", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Optimal (CPLEX)</div>
                          <div style={{ color: "#4ade80", fontWeight: 700, fontSize: "1.2rem", marginTop: "4px" }}>{comparisonSolution.cplex.total_road_distance_km?.toFixed(2)} km</div>
                          <div className="mt-2 text-xs text-gray-400">
                            Efficiency Gain: <span className="text-green-400 font-bold ml-1">
                              {(((comparisonSolution.clarke_wright.total_road_distance_km || 0) - (comparisonSolution.cplex.total_road_distance_km || 0)) / (comparisonSolution.clarke_wright.total_road_distance_km || 1) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <ResultsSummary
                        capacity={vehicleCapacity}
                        solution={comparisonSolution.clarke_wright}
                        optimalSolution={comparisonSolution.cplex}
                        colors={colors}
                        error={error}
                      />
                    </div>
                  ) : solution && (
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
          </div>
        </div>
      </div>
    </>
  );
}

function ResultsSummary({
  capacity,
  solution,
  optimalSolution,
  colors,
  error,
}: {
  capacity: number;
  solution: VRPResponse;
  optimalSolution?: VRPResponse;
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
      value: t1 != null ? `${t1} ms` : "—",
      optValue: t2 != null ? `${t2} ms` : undefined,
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
    { label: "Status", value: isOptimal ? "OPTIMAL" : "HEURISTIC", optValue: optimalSolution ? "OPTIMAL" : undefined, highlight: isOptimal || !!optimalSolution },
  ];

  const renderRoutes = (routes: typeof solution.routes, isOpt: boolean) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-2">
      {routes.map((route, i) => {
        const utilization = Number.isFinite(capacity) && capacity > 0
          ? ((route.total_demand / capacity) * 100)
          : 0;
        const color = optimalSolution ? (isOpt ? "#3498db" : "#f39c12") : (colors[i % colors.length] ?? "#e8a598");

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
                  <div style={{ color: "var(--text-muted, #777)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.3px", fontSize: "0.65rem" }}>{label}</div>
                  <div style={{ color: "var(--text, #ddd)", fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ fontFamily: "inherit", fontSize: "0.82rem" }}>

      {/* ── Summary cards ── */}
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

      {/* ── Per-route breakdown ── */}
      {optimalSolution && (
        <div className="mt-5 mb-1 text-[0.85rem] uppercase tracking-wider font-bold text-[#f39c12]">Clarke-Wright Routes</div>
      )}
      {renderRoutes(solution.routes, false)}

      {optimalSolution && (
        <>
          <div className="mt-8 mb-1 text-[0.85rem] uppercase tracking-wider font-bold text-[#3498db]">CPLEX Routes (Optimal)</div>
          {renderRoutes(optimalSolution.routes, true)}
        </>
      )}
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