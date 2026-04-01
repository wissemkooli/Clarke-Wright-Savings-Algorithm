from fastapi import APIRouter
from backend.schemas.vrp import VRPRequest, VRPResponse
from backend.services.clarke_wright import clarke_wright_algorithm
from backend.services.cplex_solver import solve_with_cplex
from backend.services.osrm import get_osrm_route
import time

router = APIRouter(prefix="/api/solve", tags=["solver"])

@router.post("/clarke-wright", response_model=VRPResponse)
async def solve_clarke_wright(request: VRPRequest):
    start_time = time.perf_counter()
    result = clarke_wright_algorithm(request.nodes, request.depot_id, request.vehicle_capacity)

    depot = next(n for n in request.nodes if n.id == request.depot_id)
    node_map = {n.id: n for n in request.nodes}

    for route in result.routes:
        waypoints = (
            [(depot.lat, depot.lng)]
            + [(node_map[cid].lat, node_map[cid].lng) for cid in route.customers]
            + [(depot.lat, depot.lng)]
        )
        osrm = await get_osrm_route(waypoints)
        route.geometry = osrm.get("coordinates", [])
        route.road_distance_km = osrm.get("distance_km")
        route.duration_s = osrm.get("duration_s")

    result.total_road_distance_km = round(
        sum(r.road_distance_km for r in result.routes if r.road_distance_km), 3
    )
    result.total_duration_s = round(
        sum(r.duration_s for r in result.routes if r.duration_s), 1
    )

    result.num_vehicles = len(result.routes)
    result.computation_time_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return result

@router.post("/cplex")
async def solve_cplex(request: VRPRequest):
    return await solve_with_cplex(request)


@router.post("/compare")
async def solve_compare(request: VRPRequest):
    import asyncio
    cw, cplex = await asyncio.gather(
        solve_clarke_wright(request),
        solve_with_cplex(request),
    )
    return {
        "clarke_wright": cw,
        "cplex": cplex,
    }