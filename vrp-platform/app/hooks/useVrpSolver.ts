"use client";

import { useCallback, useState } from "react";
import type { Node, VRPResponse } from "../types/vrp";
import { solveClarkeWright, solveCplex } from "../services/vrpApi";

type VRPComparisonResponse = {
  clarke_wright: VRPResponse;
  cplex: VRPResponse;
};

type RenderRoute = VRPResponse["routes"][0] & {
  color: string;
  polyline: Array<[number, number]>;
};

export function useVrpSolver(
  depot: Node | null,
  customers: Node[],
  vehicleCapacity: number,
  activeAlgs: string[],
  colors: string[]
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
        .filter((route) => route.geometry?.length)
        .map((route, idx) => ({
          ...route,
          color: colors[idx % colors.length]!,
          polyline: route.geometry,
        }));
      setRenderRoutes(rendered);
      setStatusText(` Solution complete! ${data.routes.length} vehicles used.`);
    },
    [depot, colors]
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

      if (cwRes) {
        combined.push(
          ...cwRes.routes.map((r, i) => ({
            ...r,
            color: isCW && isCplex ? "#f39c12" : colors[i % colors.length],
            polyline: r.geometry,
          }))
        );
      }

      if (cpRes) {
        combined.push(
          ...cpRes.routes.map((r, i) => ({
            ...r,
            color: isCW && isCplex ? "#3498db" : colors[i % colors.length],
            polyline: r.geometry,
          }))
        );
      }
      setRenderRoutes(combined);
    };

    try {
      const cwPromise = isCW
        ? solveClarkeWright(payload).then((data) => {
            cwRes = data;
            if (!cpRes) {
              setSolution(data);
              setStatusText("Heuristic found! Waiting for CPLEX to optimize...");
            }
            updateMap();
          })
        : Promise.resolve();

      const cpPromise = isCplex
        ? solveCplex(payload).then((data) => {
            cpRes = data;
            setSolution(data);
            updateMap();
          })
        : Promise.resolve();

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
  }, [activeAlgs, colors, customers, depot, vehicleCapacity]);

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
