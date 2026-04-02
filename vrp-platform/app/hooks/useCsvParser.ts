"use client";

import { useCallback } from "react";
import type { Node } from "../types/vrp";

type CsvParseResult = {
  error?: string;
  depot?: { lat: number; lng: number };
  customers?: Array<{ lat: number; lng: number; demand: number }>;
};

function stripVrpCsv(text: string): string {
  if (!text) return "";
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function parseVrpCsv(text: string): CsvParseResult {
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

export function useCsvParser(onStatusChange: (msg: string) => void) {
  const importFromCsvText = useCallback(
    (text: string, onSuccess: (depot: Node, customers: Node[]) => void) => {
      const parsed = parseVrpCsv(text);
      if (parsed.error) {
        onStatusChange(`CSV error: ${parsed.error}`);
        return;
      }
      if (!parsed.depot || !parsed.customers) {
        onStatusChange("CSV error: Could not parse depot/customers.");
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

      onSuccess(depotNode, customerNodes);
      onStatusChange(`CSV import: loaded depot and ${customerNodes.length} customer(s).`);
    },
    [onStatusChange]
  );

  const exportToCsv = useCallback((depot: Node | null, customers: Node[]) => {
    if (!depot) {
      onStatusChange("Export failed: no depot set.");
      return;
    }

    const rows = [
      `${depot.lat},${depot.lng}`,
      ...customers.map((c) => `${c.lat},${c.lng},${c.demand}`),
    ];

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vrp_export_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onStatusChange(`CSV export ready (${customers.length} customer(s)).`);
  }, [onStatusChange]);

  return { importFromCsvText, exportToCsv };
}
