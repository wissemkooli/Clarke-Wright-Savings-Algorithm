"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function SolverPage() {
  const isLoaded = useRef(false);

  useEffect(() => {
    document.title = "Solver · VRP Lab";
  }, []);

  useEffect(() => {
    if (isLoaded.current) return;

    const loadScripts = async () => {
      const loadScript = (src: string, id: string) => {
        return new Promise((resolve, reject) => {
          if (document.getElementById(id)) {
            resolve(true);
            return;
          }
          const script = document.createElement("script");
          script.id = id;
          script.src = src;
          script.async = false;
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      };

      try {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
          "leaflet-js",
        );
        await loadScript(
          "https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js",
          "leaflet-routing-js",
        );
        await loadScript("/vanilla-app.js", "vanilla-app-js");
        isLoaded.current = true;

        setTimeout(() => {
          if (
            typeof window !== "undefined" &&
            (window as unknown as { initializeVRPMapp?: () => void })
              .initializeVRPMapp
          ) {
            (
              window as unknown as { initializeVRPMapp: () => void }
            ).initializeVRPMapp();
          }
        }, 100);
      } catch (err) {
        console.error("Failed to load scripts", err);
      }
    };

    setTimeout(loadScripts, 100);

    return () => {};
  }, []);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"
      />
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css"
      />
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
              <div className="vrp-panel">
                <h2 className="vrp-panel-title">Configuration</h2>
                <div className="form-group">
                  <label htmlFor="capacity">Vehicle capacity</label>
                  <input
                    type="number"
                    id="capacity"
                    defaultValue="100"
                    min={1}
                  />
                </div>
                <div className="form-group mt-3">
                  <label htmlFor="defaultDemand">Default demand</label>
                  <input
                    type="number"
                    id="defaultDemand"
                    defaultValue="15"
                    min={1}
                  />
                </div>
              </div>

              <div className="vrp-panel">
                <h2 className="vrp-panel-title">Map actions</h2>
                <p className="vrp-legend">
                  <span style={{ color: "var(--vrp-rose, #e8a598)" }}>●</span>{" "}
                  Depot ·{" "}
                  <span style={{ color: "var(--vrp-violet, #b8a9d9)" }}>●</span>{" "}
                  Customer
                </p>
                <div className="flex flex-col gap-0">
                  <button id="setDepotBtn" className="btn btn-warning" type="button">
                    Set depot
                  </button>
                  <button id="addCustomerBtn" className="btn btn-primary" type="button">
                    Add customers
                  </button>
                  <button id="solveBtn" className="btn btn-success" type="button">
                    Solve Clarke–Wright
                  </button>
                  <button id="clearBtn" className="btn btn-secondary" type="button">
                    Clear all
                  </button>
                </div>
                <div className="vrp-status">
                  <span className="vrp-status-label">Status</span>
                  <span id="statusText">
                    Click &quot;Set depot&quot; to start.
                  </span>
                </div>
              </div>

              <div className="vrp-panel">
                <h2 className="vrp-panel-title">
                  Nodes (<span id="nodeCount">0</span>)
                </h2>
                <div id="nodesList" className="nodes-list custom-scrollbar" />
              </div>

              <div
                className="vrp-panel"
                id="resultsSection"
                style={{ display: "none" }}
              >
                <h2 className="vrp-panel-title">Results</h2>
                <div id="results" />
              </div>
            </div>

            <div className="flex flex-col lg:h-[800px]">
              <div className="relative min-h-[min(420px,55vh)] flex-grow overflow-hidden rounded-[0.65rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(12,14,20,0.5)] shadow-inner lg:min-h-0">
                <div id="map" className="absolute inset-0 z-0" />
              </div>

              <div className="vrp-panel mt-5 flex-shrink-0 lg:mt-6">
                <div className="tabs pb-3">
                  <button
                    className="tab-btn active"
                    type="button"
                    data-tab="savings"
                  >
                    Top savings
                  </button>
                  <button className="tab-btn" type="button" data-tab="steps">
                    Algorithm steps
                  </button>
                </div>

                <div className="tab-content max-h-[220px] custom-scrollbar">
                  <div id="savings-tab" className="tab-pane active">
                    <div id="savingsTable" className="text-[var(--text-muted)]">
                      <p className="placeholder-text">
                        Savings will appear here after you solve.
                      </p>
                    </div>
                  </div>
                  <div id="steps-tab" className="tab-pane hidden">
                    <div id="stepsContent" className="text-[var(--text-muted)]">
                      <p className="placeholder-text">
                        Steps will appear here after you solve.
                      </p>
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
