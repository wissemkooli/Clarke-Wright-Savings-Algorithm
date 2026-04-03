import httpx
import asyncio

OSRM_BASE = "http://localhost:5000"

# ─── Shared persistent client ────────────────────────────────────────────────
_limits = httpx.Limits(max_keepalive_connections=50, max_connections=50, keepalive_expiry=30)
_http_client = httpx.AsyncClient(timeout=3.0, limits=_limits)


async def _get(url: str) -> httpx.Response | None:
    """GET with retry."""
    for _ in range(2):
        try:
            return await _http_client.get(url)
        except Exception:
            pass
    return None


async def get_osrm_table(waypoints: list[tuple[float, float]]) -> dict:
    """Get road distance matrix (km) and duration matrix (s)."""
    if len(waypoints) < 2:
        return {"ok": False}
    coords = ";".join(f"{lng},{lat}" for lat, lng in waypoints)
    url = f"{OSRM_BASE}/table/v1/driving/{coords}?annotations=distance,duration"
    resp = await _get(url)
    if resp is None or not resp.is_success:
        return {"ok": False}
    data = resp.json()
    if data.get("code") != "Ok":
        return {"ok": False}
    
    # Process distances
    dist = [[round(d/1000, 3) if d is not None else -1 for d in row] for row in data.get("distances", [])]
    # Process durations
    dur = [[round(d, 1) if d is not None else -1 for d in row] for row in data.get("durations", [])]
    
    return {"ok": True, "distances": dist, "durations": dur}


async def get_osrm_route_legs(waypoints: list[tuple[float, float]]) -> list[dict]:
    """
    Fetch a multi-stop route and return per-leg data.
    Returns: list of dicts: {"geometry": [[lat,lng],...], "distance": meters, "duration": seconds}
    """
    if len(waypoints) < 2:
        return []
    coords = ";".join(f"{lng},{lat}" for lat, lng in waypoints)
    url = f"{OSRM_BASE}/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true"
    resp = await _get(url)
    
    if resp is None or not resp.is_success:
        return []
    data = resp.json()
    route = (data.get("routes") or [None])[0]
    if data.get("code") != "Ok" or not route:
        return []

    legs_out = []
    for leg in route.get("legs", []):
        # Correctly extract coordinates from individual steps
        pts = []
        for step in leg.get("steps", []):
            step_coords = step.get("geometry", {}).get("coordinates", [])
            for lng, lat in step_coords:
                p = [lat, lng]
                if not pts or pts[-1] != p:
                    pts.append(p)

        legs_out.append({
            "geometry": pts,
            "distance": leg.get("distance", 0),
            "duration": leg.get("duration", 0)
        })
    return legs_out