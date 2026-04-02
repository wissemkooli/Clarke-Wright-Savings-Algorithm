import type { Node, VRPRequest, VRPResponse } from "../types/vrp";

const API_URL = "http://localhost:8000";
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 500;

/**
 * Retry logic with exponential backoff.
 * Retries on network errors and 5xx server errors.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Don't retry on 4xx errors (client mistakes), only on 5xx (server errors)
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // 5xx error: eligible for retry
      if (attempt < retries && response.status >= 500) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Retry on network errors
      if (attempt < retries) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error("Failed to fetch after retries");
}

export async function solveClarkeWright(request: VRPRequest): Promise<VRPResponse> {
  const response = await fetchWithRetry(`${API_URL}/api/solve/clarke-wright`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const msg = await parseFastApiError(response);
    throw new Error(msg);
  }

  return (await response.json()) as VRPResponse;
}

export type OsrmRouteResult =
  | { ok: true; coordinates: Array<[number, number]>; distanceKm?: number }
  | { ok: false; reason: string };

export async function fetchOsrmRoute(
  waypoints: Array<Pick<Node, "lat" | "lng">>,
): Promise<OsrmRouteResult> {
  if (waypoints.length < 2) {
    return { ok: false, reason: "Need at least two waypoints." };
  }

  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, reason: `OSRM HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        geometry?: { coordinates?: Array<[number, number]> };
      }>;
    };

    const route = data.routes?.[0];
    const raw = route?.geometry?.coordinates;
    if (data.code !== "Ok" || !raw || raw.length === 0) {
      return { ok: false, reason: "OSRM returned no route." };
    }

    // OSRM gives [lng, lat]; Leaflet expects [lat, lng]
    const coordinates = raw.map(([lng, lat]) => [lat, lng] as [number, number]);
    const distanceKm = typeof route.distance === "number" ? route.distance / 1000 : undefined;
    return { ok: true, coordinates, distanceKm };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function parseFastApiError(response: Response): Promise<string> {
  const fallback = `Server error: ${response.status}`;
  try {
    const body = (await response.json()) as { detail?: unknown };
    const d = body?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      const msgs = d
        .map((e) => (e && typeof e === "object" && "msg" in e ? (e as { msg?: unknown }).msg : null))
        .filter((m): m is string => typeof m === "string");
      if (msgs.length) return msgs.join("; ");
    }
  } catch {
    // ignore
  }
  return fallback;
}

export async function solveCplex(request: VRPRequest): Promise<VRPResponse> {
  const response = await fetchWithRetry(`${API_URL}/api/solve/cplex`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const msg = await parseFastApiError(response);
    throw new Error(msg);
  }

  return (await response.json()) as VRPResponse;
}

export async function solveCompare(request: VRPRequest): Promise<{ clarke_wright: VRPResponse, cplex: VRPResponse }> {
  const response = await fetchWithRetry(`${API_URL}/api/solve/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const msg = await parseFastApiError(response);
    throw new Error(msg);
  }

  return await response.json();
}