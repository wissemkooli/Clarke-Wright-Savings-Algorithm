import httpx

OSRM_BASE = "https://router.project-osrm.org"

async def get_osrm_route(waypoints: list[tuple[float, float]]) -> dict:
    """waypoints: list of (lat, lng)"""
    if len(waypoints) < 2:
        return {"ok": False, "reason": "Need at least two waypoints."}

    coords = ";".join(f"{lng},{lat}" for lat, lng in waypoints)
    url = f"{OSRM_BASE}/route/v1/driving/{coords}?overview=full&geometries=geojson"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if not resp.is_success:
                return {"ok": False, "reason": f"OSRM HTTP {resp.status_code}"}

        data = resp.json()
        route = (data.get("routes") or [None])[0]
        raw = route and route.get("geometry", {}).get("coordinates")

        if data.get("code") != "Ok" or not raw:
            return {"ok": False, "reason": "OSRM returned no route."}

        # OSRM gives [lng, lat] → flip to [lat, lng]
        coordinates = [[lat, lng] for lng, lat in raw]
        distance_km = route["distance"] / 1000 if isinstance(route.get("distance"), (int, float)) else None
        duration_s = round(route["duration"], 1) if isinstance(route.get("duration"), (int, float)) else None


        return {"ok": True, "coordinates": coordinates, "distance_km": distance_km, "duration_s": duration_s}

    except Exception as e:
        return {"ok": False, "reason": str(e)}