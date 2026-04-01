from docplex.mp.model import Model
from backend.schemas.vrp import VRPRequest, VRPResponse, Route
from backend.services.osrm import get_osrm_route

import time


async def solve_with_cplex(request: VRPRequest) -> VRPResponse:
    nodes = request.nodes
    depot_id = request.depot_id
    Q = request.vehicle_capacity

    depot = next(n for n in nodes if n.id == depot_id)
    customers = [n for n in nodes if n.id != depot_id]
    n = len(customers)
    m = n

    all_nodes = [depot] + customers
    N = len(all_nodes)

    # ── OSRM distance matrix ──
    dist = {}
    for i in range(N):
        for j in range(N):
            if i != j:
                osrm = await get_osrm_route([
                    (all_nodes[i].lat, all_nodes[i].lng),
                    (all_nodes[j].lat, all_nodes[j].lng),
                ])
                dist[i, j] = osrm["distance_km"] if osrm["ok"] else _haversine(
                    all_nodes[i].lat, all_nodes[i].lng,
                    all_nodes[j].lat, all_nodes[j].lng
                )

    # ── MIP model ──
    start = time.perf_counter()
    mdl = Model(name="CVRP")

    x = {(i, j): mdl.binary_var(name=f"x_{i}_{j}")
         for i in range(N) for j in range(N) if i != j}
    f = {(i, j): mdl.continuous_var(lb=0, ub=Q, name=f"f_{i}_{j}")
         for i in range(N) for j in range(N) if i != j}

    mdl.minimize(mdl.sum(dist[i, j] * x[i, j] for i, j in x))

    mdl.add_constraint(mdl.sum(x[0, j] for j in range(1, N)) <= m)
    mdl.add_constraint(mdl.sum(x[i, 0] for i in range(1, N)) <= m)

    for i in range(1, N):
        mdl.add_constraint(mdl.sum(x[j, i] for j in range(N) if j != i) == 1)
        mdl.add_constraint(mdl.sum(x[i, j] for j in range(N) if j != i) == 1)

    for i in range(1, N):
        mdl.add_constraint(
            mdl.sum(f[j, i] for j in range(N) if j != i) -
            mdl.sum(f[i, j] for j in range(N) if j != i)
            == all_nodes[i].demand
        )

    for i, j in x:
        mdl.add_constraint(f[i, j] <= Q * x[i, j])

    solution = mdl.solve(log_output=False)
    computation_time_ms = round((time.perf_counter() - start) * 1000, 2)

    if solution is None:
        raise Exception("CPLEX found no solution")

    # ── Extract routes ──
    active_arcs = [(i, j) for i, j in x if solution.get_value(x[i, j]) > 0.5]

    routes = []
    for arc in active_arcs:
        if arc[0] == 0:
            route_nodes = []
            current = arc[1]
            visited = set()
            while current != 0 and current not in visited:
                visited.add(current)
                route_nodes.append(current)
                next_node = next((j for i, j in active_arcs if i == current), 0)
                current = next_node

            customer_ids = [all_nodes[k].id for k in route_nodes]
            total_demand = sum(all_nodes[k].demand for k in route_nodes)
            total_distance = (
                dist[0, route_nodes[0]]
                + sum(dist[route_nodes[k], route_nodes[k + 1]] for k in range(len(route_nodes) - 1))
                + dist[route_nodes[-1], 0]
            )

            # ── OSRM enrichment (geometry + road distance) ──
            node_map = {n.id: n for n in nodes}
            waypoints = (
                [(depot.lat, depot.lng)]
                + [(node_map[cid].lat, node_map[cid].lng) for cid in customer_ids]
                + [(depot.lat, depot.lng)]
            )
            osrm = await get_osrm_route(waypoints)

            route = Route(
                customers=customer_ids,
                total_demand=total_demand,
                total_distance=round(total_distance, 2),
            )
            route.geometry = osrm.get("coordinates", [])
            route.road_distance_km = osrm.get("distance_km")
            route.duration_s = osrm.get("duration_s")
            routes.append(route)

    result = VRPResponse(
        routes=routes,
        total_distance=round(sum(r.total_distance for r in routes), 2),
        savings_table=[],
        steps=[f"CPLEX solved {n} customers with {len(routes)} vehicles — OPTIMAL"],
        computation_time_ms=computation_time_ms,
        num_vehicles=len(routes),
    )
    result.total_road_distance_km = round(
        sum(r.road_distance_km for r in routes if r.road_distance_km), 3
    )
    result.total_duration_s = round(
        sum(r.duration_s for r in routes if r.duration_s), 1
    )
    return result


def _haversine(lat1, lng1, lat2, lng2) -> float:
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))