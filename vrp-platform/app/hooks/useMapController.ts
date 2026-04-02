"use client";

import { useCallback, useRef, useState } from "react";
import type { Node } from "../types/vrp";

type SolverMode = "idle" | "setDepot" | "addCustomer";

export function useMapController(defaultDemand: number | "", onStatusChange: (msg: string) => void) {
  const nextCustomerId = useRef(1);
  const [mode, setMode] = useState<SolverMode>("idle");
  const [depot, setDepot] = useState<Node | null>(null);
  const [customers, setCustomers] = useState<Node[]>([]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (mode === "setDepot") {
        const node: Node = { id: 0, lat, lng, x: lng, y: lat, demand: 0 };
        setDepot(node);
        setMode("idle");
        onStatusChange("Depot set! Now add customers.");
        return;
      }

      if (mode === "addCustomer") {
        const id = nextCustomerId.current++;
        const demand = typeof defaultDemand === "number" && defaultDemand >= 0 ? Math.trunc(defaultDemand) : 0;
        const customer: Node = { id, lat, lng, x: lng, y: lat, demand };
        setCustomers((prev) => [...prev, customer]);
        onStatusChange("Customer added! Add more or click Solve.");
      }
    },
    [defaultDemand, mode, onStatusChange]
  );

  const deleteCustomer = useCallback((customerId: number) => {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
  }, []);

  const setDepotMode = useCallback(() => {
    setMode("setDepot");
    onStatusChange("Click on the map to set depot location");
  }, [onStatusChange]);

  const setAddCustomerMode = useCallback(() => {
    setMode("addCustomer");
    onStatusChange("Click on the map to add customers");
  }, [onStatusChange]);

  const resetMap = useCallback(() => {
    setDepot(null);
    setCustomers([]);
    nextCustomerId.current = 1;
    setMode("idle");
  }, []);

  const setMapData = useCallback((newDepot: Node, newCustomers: Node[]) => {
    setDepot(newDepot);
    setCustomers(newCustomers);
    nextCustomerId.current = Math.max(...newCustomers.map(c => c.id)) + 1;
    setMode("idle");
  }, []);

  return {
    mode,
    depot,
    customers,
    handleMapClick,
    deleteCustomer,
    setDepotMode,
    setAddCustomerMode,
    resetMap,
    setMapData,
  };
}
