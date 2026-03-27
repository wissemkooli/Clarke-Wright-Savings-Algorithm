"use client";

import { useEffect, useRef } from "react";
import Head from "next/head";
import Link from "next/link";

export default function SolverPage() {
  const isLoaded = useRef(false);

  useEffect(() => {
    if (isLoaded.current) return;
    
    // Dynamically load the Leaflet dependencies sequentially
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
        await loadScript("https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js", "leaflet-js");
        await loadScript("https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js", "leaflet-routing-js");
        await loadScript("/vanilla-app.js", "vanilla-app-js");
        isLoaded.current = true;
        
        // Give leafet a tiny delay to ensure the container is sized, then mount
        setTimeout(() => {
          if (typeof window !== "undefined" && (window as any).initializeVRPMapp) {
            (window as any).initializeVRPMapp();
          }
        }, 100);
      } catch (err) {
        console.error("Failed to load scripts", err);
      }
    };

    // Delay script loading slightly to ensure DOM is perfectly ready
    setTimeout(loadScripts, 100);

    return () => {
      // In a real app we'd clean up map instances here, but vanilla-app.js binds globally
    };
  }, []);

  return (
    <>
      <Head>
        <title>VRP Solver</title>
      </Head>
      {/* We load CSS in the head directly to ensure styling is applied */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css" />
      <link rel="stylesheet" href="/vanilla-style.css" />

      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
        <div className="max-w-[1400px] mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
          
          <header className="p-8 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Clarke-Wright vs CPLEX Optimizer</h1>
              <p className="text-zinc-400 mt-2">Vehicle Routing Problem Solver with OpenStreetMap</p>
            </div>
            <Link href="/" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors">
              &larr; Back to Dashboard
            </Link>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-6 p-6">
            
            {/* Left Panel - exact IDs maintained for vanilla-app.js */}
            <div className="flex flex-col gap-6 max-h-[800px] overflow-y-auto custom-scrollbar pr-2">
              
              <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700/50">
                <h2 className="text-indigo-400 font-semibold mb-4 text-lg">Configuration</h2>
                <div className="form-group">
                  <label className="text-zinc-300">Vehicle Capacity:</label>
                  <input type="number" id="capacity" defaultValue="100" min="1" className="bg-zinc-900 text-white border border-zinc-700 rounded-lg focus:border-indigo-500" />
                </div>
                <div className="form-group mt-3">
                  <label className="text-zinc-300">Default Demand:</label>
                  <input type="number" id="defaultDemand" defaultValue="15" min="1" className="bg-zinc-900 text-white border border-zinc-700 rounded-lg focus:border-indigo-500" />
                </div>
              </div>

              <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700/50">
                <h2 className="text-indigo-400 font-semibold mb-4 text-lg">Map Controls</h2>
                <p className="text-sm text-zinc-400 mb-4">🔴 Red = Depot | 🔵 Blue = Customer</p>
                <div className="flex flex-col gap-3">
                  <button id="setDepotBtn" className="btn btn-warning shadow-md shadow-yellow-900/20 hover:shadow-yellow-900/40">Set Depot</button>
                  <button id="addCustomerBtn" className="btn btn-primary shadow-md shadow-indigo-900/20 hover:shadow-indigo-900/40">Add Customers</button>
                  <button id="solveBtn" className="btn btn-success shadow-md shadow-green-900/20 hover:shadow-green-900/40">Solve Clarke-Wright</button>
                  <button id="clearBtn" className="btn btn-secondary">Clear All</button>
                </div>
                <div className="mt-4 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                  <strong className="text-zinc-500 text-xs uppercase tracking-wider">Status:</strong> 
                  <span id="statusText" className="block text-indigo-300 font-medium text-sm mt-1">Click "Set Depot" to start</span>
                </div>
              </div>

              <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700/50">
                <h2 className="text-indigo-400 font-semibold mb-4 text-lg">Nodes (<span id="nodeCount">0</span>)</h2>
                <div id="nodesList" className="nodes-list custom-scrollbar"></div>
              </div>

              <div className="bg-indigo-900/20 p-5 rounded-xl border border-indigo-500/30" id="resultsSection" style={{ display: "none" }}>
                <h2 className="text-indigo-400 font-semibold mb-4 text-lg">CW Results</h2>
                <div id="results" className="text-zinc-300 text-sm"></div>
              </div>
            </div>

            {/* Right Panel */}
            <div className="flex flex-col h-[800px]">
              <div className="flex-grow rounded-xl overflow-hidden border-2 border-zinc-700/50 shadow-inner relative">
                {/* z-0 ensures map controls don't overlay Next.js navigation incorrectly */}
                <div id="map" className="absolute inset-0 z-0"></div>
              </div>

              <div className="mt-6 bg-zinc-800/50 rounded-xl border border-zinc-700/50 p-5 flex-shrink-0">
                <div className="tabs flex gap-2 border-b border-zinc-700 pb-4">
                  <button className="tab-btn active px-4 py-2 rounded-lg bg-zinc-700 text-white font-medium hover:bg-zinc-600 transition" data-tab="savings">Top Savings</button>
                  <button className="tab-btn px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 font-medium hover:bg-zinc-700 transition" data-tab="steps">Algorithm Steps</button>
                </div>

                <div className="tab-content mt-4 max-h-[200px] overflow-y-auto custom-scrollbar">
                  <div id="savings-tab" className="tab-pane active">
                    <div id="savingsTable" className="text-zinc-300">
                      <p className="text-zinc-500 italic text-center py-8">Savings will appear here after solving</p>
                    </div>
                  </div>
                  <div id="steps-tab" className="tab-pane hidden">
                    <div id="stepsContent" className="text-zinc-300">
                      <p className="text-zinc-500 italic text-center py-8">Algorithm steps will appear here after solving</p>
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
