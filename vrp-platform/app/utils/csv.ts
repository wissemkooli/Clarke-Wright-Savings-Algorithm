import type { Node } from "../types/vrp";

export function stripVrpCsv(text: string): string {
  if (!text) return "";
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function parseVrpCsv(text: string): {
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
