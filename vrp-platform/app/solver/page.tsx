"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Node, VRPResponse, VRPComparisonResponse } from "../types/vrp";
import { ControlPanel } from "../components/solver/ControlPanel";
import { NodesList } from "../components/solver/NodesList";
import { SavingsTable } from "../components/solver/SavingsTable";
import { AlgorithmSteps } from "../components/solver/AlgorithmSteps";
import { ResultsSummary } from "../components/solver/ResultsSummary";
import { useVrpSolver, useCsvParser, useMapController } from "../hooks";
import { parseVrpCsv } from "../utils/csv";

const MapView = dynamic(() => import("../components/solver/MapView").then((m) => m.MapView), {
  ssr: false,
});

export default function SolverPage() {
  const [vehicleCapacity, setVehicleCapacity] = useState<number | "">(100);
  const [defaultDemand, setDefaultDemand] = useState<number | "">(15);
  const [activeAlgs, setActiveAlgs] = useState<string[]>(["clarke-wright"]);
  const [activeTab, setActiveTab] = useState<"savings" | "steps">("savings");
  const [fitToNodesToken, setFitToNodesToken] = useState<number>(0);

  // Map controller hook
  const {
    mode,
    depot,
    customers,
    handleMapClick,
    deleteCustomer,
    setDepotMode,
    setAddCustomerMode,
    resetMap,
    setMapData,
  } = useMapController(defaultDemand, (msg) => solver.setStatusText(msg));


  // VRP solver hook
  const solver = useVrpSolver(depot, customers, vehicleCapacity as number, activeAlgs);

  // CSV parser hook
  const { importFromCsvText, exportToCsv } = useCsvParser(solver.setStatusText);

  useEffect(() => {
    document.title = "Solver · VRP Lab";
  }, []);

  const capacityViolationMessage = useMemo(() => {
    if (vehicleCapacity === "" || !Number.isFinite(vehicleCapacity) || (vehicleCapacity as number) <= 0) {
      return "Enter a valid vehicle capacity greater than zero.";
    }
    const capNum = vehicleCapacity as number;
    const bad = customers.filter((c) => c.demand > capNum);
    if (!bad.length) return null;
    if (bad.length === 1) {
      const c = bad[0]!;
      return `Customer ${c.id} has demand ${c.demand} which exceeds vehicle capacity ${capNum}.`;
    }
    return (
      `The following customers exceed vehicle capacity (${capNum}): ` +
      bad.map((c) => `customer ${c.id} (demand ${c.demand})`).join(", ") +
      "."
    );
  }, [customers, vehicleCapacity]);

  const disableSolve = useMemo(() => {
    const baseDisable = !depot || customers.length < 2 || solver.isLoading || activeAlgs.length === 0;
    const badCapacity = vehicleCapacity === "" || !Number.isFinite(vehicleCapacity) || (vehicleCapacity as number) <= 0;
    return baseDisable || badCapacity || capacityViolationMessage !== null;
  }, [activeAlgs.length, capacityViolationMessage, customers.length, depot, solver.isLoading, vehicleCapacity]);

  const nodeCount = (depot ? 1 : 0) + customers.length;

  const toggleAlgorithm = (id: string) => {
    setActiveAlgs(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleClearAll = useCallback(() => {
    resetMap();
    solver.clearSolution();
    solver.setStatusText('Click "Set depot" to start');
  }, [resetMap, solver]);

  const handleImportCsv = useCallback((csvText: string) => {
    if (!csvText) {
      solver.setStatusText("Could not read CSV file.");
      return;
    }
    const parsed = parseVrpCsv(csvText);
    if (parsed.error) {
      solver.setStatusText(`CSV error: ${parsed.error}`);
      return;
    }
    if (!parsed.depot || !parsed.customers) {
      solver.setStatusText("CSV error: Could not parse depot/customers.");
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

    solver.clearSolution();
    solver.setError(null);
    setMapData(depotNode, customerNodes);
    setFitToNodesToken((t) => t + 1);
    solver.setStatusText(`CSV import: loaded depot and ${customerNodes.length} customer(s).`);
  }, [setMapData, solver]);

  const handleExportCsv = useCallback(() => {
    exportToCsv(depot, customers);
  }, [depot, customers, exportToCsv]);

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
      <link rel="stylesheet" href="/vanilla-style.css" />

      <div id="vrp-solver-root" className="solver-page">
        <div className="solver-shell">
          <div className="solver-shell__header">
            <div>
              <h1>VRP Multi-Engine Solver</h1>
              <p className="whitespace-nowrap">Heuristic or Exact Optimal? Toggle algorithms to solve or compare performance.</p>

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
                isLoading={solver.isLoading}
                statusText={solver.statusText}
                disableSolve={disableSolve}
                onVehicleCapacityChange={(v) => setVehicleCapacity(v as number | "")}
                onDefaultDemandChange={(v) => setDefaultDemand(v as number | "")}
                onSetDepot={setDepotMode}
                onAddCustomers={setAddCustomerMode}
                onSolve={solver.solve}
                onClear={handleClearAll}
                onImportCsvText={handleImportCsv}
                onExportCsv={handleExportCsv}
                disableExportCsv={!depot || customers.length === 0}
              />

              <div className="vrp-panel flex-shrink-0">
                <h2 className="vrp-panel-title">
                  Nodes (<span id="nodeCount">{nodeCount}</span>)
                </h2>
                <div id="nodesList">
                  <NodesList depot={depot} customers={customers} onDeleteCustomer={deleteCustomer} />
                </div>
              </div>

              <div className="vrp-panel flex-shrink-0 flex flex-col overflow-hidden" style={{ display: (solver.solution || solver.comparisonSolution) ? "flex" : "none" }}>
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
                      <SavingsTable savings={solver.comparisonSolution?.clarke_wright.savings_table ?? solver.solution?.savings_table ?? []} />
                    </div>
                  </div>
                  <div id="steps-tab" className={`tab-pane ${activeTab === "steps" ? "active" : ""}`}>
                    <div id="stepsContent" className="text-[var(--text-muted)] text-[11px] min-w-[280px]">
                      <AlgorithmSteps steps={solver.comparisonSolution?.clarke_wright.steps ?? solver.solution?.steps ?? []} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:h-[800px]">
              <div className="relative h-[480px] flex-shrink-0 overflow-hidden rounded-[0.65rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(12,14,20,0.5)] shadow-inner">
                <div id="map" className="absolute inset-0 z-0">
                  <MapView
                    depot={depot}
                    customers={customers}
                    mode={mode}
                    routes={solver.renderRoutes}
                    onMapClick={handleMapClick}
                    fitToNodesToken={fitToNodesToken}
                    mergeEvents={solver.solution?.merge_events || solver.comparisonSolution?.clarke_wright.merge_events}
                    edgeGeometries={solver.solution?.edge_geometries || solver.comparisonSolution?.clarke_wright.edge_geometries}
                    isCompareMode={activeAlgs.length === 2}
                  />
                </div>
              </div>

              <div className="vrp-panel mt-5 flex-grow flex-col lg:mt-6 overflow-hidden" id="resultsSection" style={{ display: (solver.solution || solver.comparisonSolution) ? "flex" : "none" }}>
                <h2 className="vrp-panel-title flex-shrink-0">Results</h2>
                <div id="results" className="overflow-y-auto custom-scrollbar pr-2 flex-grow">
                  {solver.comparisonSolution ? (
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
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.2rem", marginTop: "4px" }}>{solver.comparisonSolution.clarke_wright.total_road_distance_km?.toFixed(2)} km</div>
                        </div>
                        <div className="flex flex-col">
                          <div style={{ color: "#60a5fa", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Optimal (CPLEX)</div>
                          <div style={{ color: "#4ade80", fontWeight: 700, fontSize: "1.2rem", marginTop: "4px" }}>{solver.comparisonSolution.cplex.total_road_distance_km?.toFixed(2)} km</div>
                          <div className="mt-2 text-xs text-gray-400">
                            Efficiency Gain: <span className="text-green-400 font-bold ml-1">
                              {(((solver.comparisonSolution.clarke_wright.total_road_distance_km || 0) - (solver.comparisonSolution.cplex.total_road_distance_km || 0)) / (solver.comparisonSolution.clarke_wright.total_road_distance_km || 1) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <ResultsSummary
                        capacity={vehicleCapacity as number}
                        solution={solver.comparisonSolution.clarke_wright}
                        optimalSolution={solver.comparisonSolution.cplex}
                        error={solver.error}
                      />
                    </div>
                  ) : solver.solution && (
                    <ResultsSummary
                      capacity={vehicleCapacity as number}
                      solution={solver.solution}
                      error={solver.error}
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