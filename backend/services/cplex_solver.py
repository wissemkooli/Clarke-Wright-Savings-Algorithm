from docplex.mp.model import Model
from backend.schemas.vrp import VRPRequest, VRPResponse, Route
from backend.services.osrm import get_osrm_table, get_osrm_route_legs
from backend.services.utils import process_osrm_table, stitch_route_geometry
import time
import asyncio
import concurrent.futures

# Module-level thread pool — CPLEX solve() is synchronous C++ and blocks the GIL.
# Running it in a dedicated executor lets asyncio continue scheduling CW geometry
# fetches (and other coroutines) while CPLEX solves in parallel on a real OS thread.
_cplex_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=2, thread_name_prefix="cplex"
)


async def solve_with_cplex(request: VRPRequest, precomputed_table: dict = None) -> VRPResponse:
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
    if precomputed_table:
        table_res = precomputed_table
    else:
        table_res = await get_osrm_table([(nd.lat, nd.lng) for nd in all_nodes])
    
    dist, dur = process_osrm_table(table_res, all_nodes)

    # Build index-based distance lookup for CPLEX model variables (0..N-1 indexed)
    dist_idx = {
        (i, j): dist.get((all_nodes[i].id, all_nodes[j].id), 0)
        for i in range(N) for j in range(N) if i != j
    }

    # ── Step 2: MIP model ──
    mdl = Model(name="CVRP")
    x = {(i, j): mdl.binary_var(name=f"x_{i}_{j}") for i in range(N) for j in range(N) if i != j}
    f = {(i, j): mdl.continuous_var(lb=0, ub=Q, name=f"f_{i}_{j}") for i in range(N) for j in range(N) if i != j}

    mdl.minimize(mdl.sum(dist_idx[i, j] * x[i, j] for i, j in x))
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

    # ── Run solve in thread pool — unblocks the asyncio event loop ──
    # Without this, mdl.solve() holds the GIL and freezes all coroutines,
    # making CW geometry fetches stall while CPLEX runs.
    loop = asyncio.get_event_loop()
    solution = await loop.run_in_executor(
        _cplex_executor, lambda: mdl.solve(log_output=False)
    )

    if solution is None:
        raise Exception("CPLEX found no solution")

    # ── Step 3: Extract routes ──
    # Build a O(1) successor dict instead of scanning all arcs on every step.
    # Old: next((j for i,j in active_arcs if i == curr), 0)  → O(arcs) per node
    # New: succ[curr]                                          → O(1)
    active_arcs = [(i, j) for i, j in x if solution.get_value(x[i, j]) > 0.5]
    succ = {i: j for i, j in active_arcs}

    raw_routes = []
    for i, j in active_arcs:
        if i == 0:
            r_indices = []
            curr = j
            while curr != 0:
                r_indices.append(curr)
                curr = succ.get(curr, 0)
            raw_routes.append(r_indices)

    # ── Step 4: Parallel OSRM Geometry & Duration Fetching ──
    edge_geom_cache: dict[tuple, list] = {}
    edge_dur_cache: dict[tuple, float] = {}
    node_map = {nd.id: nd for nd in nodes}

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
        
        node_seq_ids = [depot.id] + customer_ids + [depot.id]
        r_dist = sum(dist.get((node_seq_ids[k], node_seq_ids[k+1]), 0) for k in range(len(node_seq_ids)-1))
        r_dur = sum(edge_dur_cache.get((node_seq_ids[k], node_seq_ids[k+1]), dur.get((node_seq_ids[k], node_seq_ids[k+1]), 0)) for k in range(len(node_seq_ids)-1))

        final_routes.append(Route(
            customers=customer_ids,
            total_demand=round(total_demand, 2),
            total_distance=round(r_dist, 2),
            road_distance_km=round(r_dist, 2),
            duration_s=round(r_dur, 1),
            geometry=stitch_route_geometry(edge_geom_cache, node_seq_ids, node_map)
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