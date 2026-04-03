"use client";

import { useCallback, useState } from "react";
import type { Node, VRPResponse, VRPComparisonResponse } from "../types/vrp";
import { solveClarkeWright, solveCplex, solveCompare } from "../services/vrpApi";
import { ROUTE_PALETTE } from "../constants/theme";

type RenderRoute = VRPResponse["routes"][0] & {
  color: string;
  polyline: Array<[number, number]>;
  solver?: "cw" | "cplex";
};

export function useVrpSolver(
  depot: Node | null,
  customers: Node[],
  vehicleCapacity: number,
  activeAlgs: string[]
) {
  const [solution, setSolution] = useState<VRPResponse | null>(null);
  const [comparisonSolution, setComparisonSolution] = useState<VRPComparisonResponse | null>(null);
  const [renderRoutes, setRenderRoutes] = useState<RenderRoute[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('Click "Set depot" to start.');

  const buildRenderRoutes = useCallback(
    (data: VRPResponse) => {
      if (!depot) return;
      const rendered: RenderRoute[] = data.routes
        .map((route) => {
          // Use stable min-ID coloring rule
          const colorKey = Math.min(...route.customers);
          const color = ROUTE_PALETTE[colorKey % ROUTE_PALETTE.length];
          return {
            ...route,
            color,
            polyline: route.geometry,
          };
        });
      setRenderRoutes(rendered);
      setStatusText(` Solution complete! ${data.routes.length} vehicles used.`);
    },
    [depot]
  );

  const solve = useCallback(async () => {
    if (!depot || customers.length < 2) return;

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

    let cwRes: VRPResponse | null = null;
    let cpRes: VRPResponse | null = null;

    const updateMap = () => {
      const combined: RenderRoute[] = [];
      const isCompare = isCW && isCplex;

      if (cwRes) {
        combined.push(
          ...cwRes.routes.map((r) => {
            // In compare mode: fixed orange for all CW routes so they read as one algorithm.
            // In single mode: stable per-route color from palette.
            const color = isCompare
              ? "#f97316"
              : ROUTE_PALETTE[Math.min(...r.customers) % ROUTE_PALETTE.length];
            return {
              ...r,
              color,
              solver: "cw" as const,
              polyline: r.geometry,
            };
          })
        );
      }

      if (cpRes) {
        combined.push(
          ...cpRes.routes.map((r) => {
            // In compare mode: fixed blue for all CPLEX routes.
            const color = isCompare
              ? "#3b82f6"
              : ROUTE_PALETTE[Math.min(...r.customers) % ROUTE_PALETTE.length];
            return {
              ...r,
              color,
              solver: "cplex" as const,
              polyline: r.geometry,
            };
          })
        );
      }
      setRenderRoutes(combined);
    };

    try {
      if (isCW && isCplex) {
        // Performance Optimization: Use a single backend call for comparison
        // This fetches the OSRM distance matrix only ONCE, reducing latency by 50%.
        const data = await solveCompare(payload);
        cwRes = data.clarke_wright;
        cpRes = data.cplex;
        setSolution(data.cplex); // Prefer optimal for display
        setComparisonSolution(data);
        setStatusText("Comparison complete! Heuristic (Orange) vs Optimal (Blue)");
        updateMap();
      } else if (isCW) {
        const data = await solveClarkeWright(payload);
        cwRes = data;
        setSolution(data);
        setStatusText("Heuristic found!");
        updateMap();
      } else if (isCplex) {
        const data = await solveCplex(payload);
        cpRes = data;
        setSolution(data);
        setStatusText("Optimal solution found!");
        updateMap();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatusText(message);
    } finally {
      setIsLoading(false);
    }
  }, [activeAlgs, customers, depot, vehicleCapacity]);

  const clearSolution = useCallback(() => {
    setSolution(null);
    setComparisonSolution(null);
    setRenderRoutes([]);
    setError(null);
    setStatusText('Click "Set depot" to start');
  }, []);

  return {
    solution,
    comparisonSolution,
    renderRoutes,
    isLoading,
    error,
    statusText,
    solve,
    clearSolution,
    setStatusText,
    setError,
  };
}
