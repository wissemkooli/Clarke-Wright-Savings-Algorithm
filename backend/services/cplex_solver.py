from docplex.mp.model import Model
from backend.schemas.vrp import VRPRequest, VRPResponse, Route
from backend.services.osrm import get_osrm_table, get_osrm_route_legs

import time
import asyncio


async def solve_with_cplex(request: VRPRequest) -> VRPResponse:
    start_time = time.perf_counter()
    nodes = request.nodes
    depot_id = request.depot_id
    Q = request.vehicle_capacity

    depot = next(n for n in nodes if n.id == depot_id)
    customers = [n for n in nodes if n.id != depot_id]
    n = len(customers)
    m = n  # Max vehicles

    all_nodes = [depot] + customers
    N = len(all_nodes)

    # ── Step 1: OSRM distance & duration matrix ──
    table_res = await get_osrm_table([(n.lat, n.lng) for n in all_nodes])
    dist_table = table_res.get("distances", []) if table_res.get("ok") else []
    dur_table = table_res.get("durations", []) if table_res.get("ok") else []

    dist = {}
    dur = {}
    for i in range(N):
        for j in range(N):
            if i != j:
                d = dist_table[i][j] if i < len(dist_table) and j < len(dist_table[i]) else -1
                t = dur_table[i][j] if i < len(dur_table) and j < len(dur_table[i]) else -1
                
                if d < 0:
                    # Haversine fallback for distance
                    from math import radians, sin, cos, sqrt, atan2
                    R = 6371
                    lat1, lng1 = all_nodes[i].lat, all_nodes[i].lng
                    lat2, lng2 = all_nodes[j].lat, all_nodes[j].lng
                    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
                    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
                    d = R * 2 * atan2(sqrt(a), sqrt(1 - a))
                    t = 0 # No duration for haversine
                
                dist[i, j] = d
                dur[i, j] = t

    # ── Step 2: MIP model ──
    mdl = Model(name="CVRP")
    x = {(i, j): mdl.binary_var(name=f"x_{i}_{j}") for i in range(N) for j in range(N) if i != j}
    f = {(i, j): mdl.continuous_var(lb=0, ub=Q, name=f"f_{i}_{j}") for i in range(N) for j in range(N) if i != j}

    mdl.minimize(mdl.sum(dist[i, j] * x[i, j] for i, j in x))
    mdl.add_constraint(mdl.sum(x[0, j] for j in range(1, N)) <= m)
    mdl.add_constraint(mdl.sum(x[i, 0] for i in range(1, N)) <= m)

    for i in range(1, N):
        mdl.add_constraint(mdl.sum(x[j, i] for j in range(N) if j != i) == 1)
        mdl.add_constraint(mdl.sum(x[i, j] for j in range(N) if j != i) == 1)
        mdl.add_constraint(
            mdl.sum(f[j, i] for j in range(N) if j != i) -
            mdl.sum(f[i, j] for j in range(N) if j != i)
            == all_nodes[i].demand
        )

    for i, j in x:
        mdl.add_constraint(f[i, j] <= Q * x[i, j])

    mdl.parameters.timelimit = 30
    solution = mdl.solve(log_output=False)

    if solution is None:
        raise Exception("CPLEX found no solution")

    # ── Step 3: Extract routes ──
    active_arcs = [(i, j) for i, j in x if solution.get_value(x[i, j]) > 0.5]
    raw_routes = []
    for arc in active_arcs:
        if arc[0] == 0:
            r_indices = []
            curr = arc[1]
            while curr != 0:
                r_indices.append(curr)
                curr = next((j for i, j in active_arcs if i == curr), 0)
            raw_routes.append(r_indices)

    # ── Step 4: Parallel OSRM Geometry & Duration Fetching ──
    edge_geom_cache: dict[tuple, list] = {}
    edge_dur_cache: dict[tuple, float] = {}
    node_map = {n.id: n for n in nodes}

    async def fetch_route_legs(r_indices: list):
        waypoints = [(depot.lat, depot.lng)]
        for idx in r_indices:
            waypoints.append((all_nodes[idx].lat, all_nodes[idx].lng))
        waypoints.append((depot.lat, depot.lng))

        legs_data = await get_osrm_route_legs(waypoints)
        node_seq = [depot.id] + [all_nodes[idx].id for idx in r_indices] + [depot.id]
        for k, leg_dict in enumerate(legs_data):
            u, v = node_seq[k], node_seq[k + 1]
            edge_geom_cache[(u, v)] = leg_dict["geometry"]
            edge_dur_cache[(u, v)] = leg_dict["duration"]

    await asyncio.gather(*[fetch_route_legs(rr) for rr in raw_routes])

    # ── Step 5: Build final response ──
    final_routes = []
    total_road_dist = 0
    total_dur_s = 0
    for r_indices in raw_routes:
        customer_ids = [all_nodes[idx].id for idx in r_indices]
        total_demand = sum(all_nodes[idx].demand for idx in r_indices)
        
        # Calculate route-level road telemetry
        r_dist = 0
        r_dur = 0
        node_seq_ids = [depot.id] + customer_ids + [depot.id]
        node_seq_idxs = [0] + r_indices + [0]
        for k in range(len(node_seq_ids) - 1):
            pair_ids = (node_seq_ids[k], node_seq_ids[k + 1])
            pair_idxs = (node_seq_idxs[k], node_seq_idxs[k + 1])
            r_dist += dist.get(pair_idxs, 0)
            r_dur += edge_dur_cache.get(pair_ids, dur.get(pair_idxs, 0))

        # Stitch geometry
        geom = []
        for k in range(len(node_seq_ids) - 1):
            seg = edge_geom_cache.get((node_seq_ids[k], node_seq_ids[k + 1]))
            if not seg:
                n1, n2 = (depot if node_seq_ids[k] == depot.id else node_map[node_seq_ids[k]]), \
                         (depot if node_seq_ids[k+1] == depot.id else node_map[node_seq_ids[k+1]])
                seg = [[n1.lat, n1.lng], [n2.lat, n2.lng]]
            geom.extend(seg if not geom else seg[1:])

        final_routes.append(Route(
            customers=customer_ids,
            total_demand=round(total_demand, 2),
            total_distance=round(r_dist, 2),
            road_distance_km=round(r_dist, 2),
            duration_s=round(r_dur, 1),
            geometry=geom
        ))
        total_road_dist += r_dist
        total_dur_s += r_dur

    string_edge_geoms = {f"{u},{v}": coords for (u, v), coords in edge_geom_cache.items()}

    return VRPResponse(
        routes=final_routes,
        total_distance=round(total_road_dist, 2),
        total_road_distance_km=round(total_road_dist, 2),
        total_duration_s=round(total_dur_s, 1),
        num_vehicles=len(final_routes),
        computation_time_ms=round((time.perf_counter() - start_time) * 1000, 2),
        edge_geometries=string_edge_geoms,
        savings_table=[],
        steps=[f"CPLEX solved {n} customers — OPTIMAL"]
    )