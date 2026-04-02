import httpx
import asyncio
import random

OSRM_BASE = "https://router.project-osrm.org"

# ─── Shared persistent client ────────────────────────────────────────────────
_limits = httpx.Limits(max_keepalive_connections=25, max_connections=30, keepalive_expiry=30)
_http_client = httpx.AsyncClient(timeout=8.0, limits=_limits)
_SEM = asyncio.Semaphore(6)


async def _get(url: str) -> httpx.Response | None:
    """GET with retry and staggered jitter."""
    _429_hits = 0
    await asyncio.sleep(random.uniform(0, 0.15))
    for attempt in range(4):
        try:
            async with _SEM:
                resp = await _http_client.get(url)
        except Exception:
            await asyncio.sleep(0.3 * (attempt + 1))
            continue
        if resp.status_code == 429:
            _429_hits += 1
            await asyncio.sleep(1.0 * (attempt + 1))
            continue
        if _429_hits:
            print(f"[OSRM] {_429_hits}x 429 on {url[-60:]}")
        return resp
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
    url = f"{OSRM_BASE}/route/v1/driving/{coords}?overview=false&geometries=geojson&steps=true"
    resp = await _get(url)
    
    # Fallback to straight lines if network fails
    fallback = []
    for i in range(len(waypoints) - 1):
        p1, p2 = waypoints[i], waypoints[i+1]
        fallback.append({
            "geometry": [[p1[0], p1[1]], [p2[0], p2[1]]],
            "distance": 0, "duration": 0
        })

    if resp is None or not resp.is_success:
        return fallback
    data = resp.json()
    route = (data.get("routes") or [None])[0]
    if data.get("code") != "Ok" or not route:
        return fallback

    legs_out = []
    for i, leg in enumerate(route.get("legs", [])):
        pts = []
        for step in leg.get("steps", []):
            for lng, lat in step.get("geometry", {}).get("coordinates", []):
                p = [lat, lng]
                if not pts or pts[-1] != [lat, lng]:
                    pts.append(p)
        legs_out.append({
            "geometry": pts if pts else fallback[i]["geometry"],
            "distance": leg.get("distance", 0),
            "duration": leg.get("duration", 0)
        })
    return legs_out


async def get_osrm_route(waypoints: list[tuple[float, float]]) -> dict:
    """Legacy/Single route fetch."""
    if len(waypoints) < 2: return {"ok": False}
    coords = ";".join(f"{lng},{lat}" for lat, lng in waypoints)
    url = f"{OSRM_BASE}/route/v1/driving/{coords}?overview=full&geometries=geojson"
    resp = await _get(url)
    if resp is None or not resp.is_success: return {"ok": False}
    data = resp.json()
    route = (data.get("routes") or [None])[0]
    if not route: return {"ok": False}
    return {
        "ok": True,
        "coordinates": [[lat, lng] for lng, lat in route["geometry"]["coordinates"]],
        "distance_km": route["distance"] / 1000,
        "duration_s": route["duration"]
    }