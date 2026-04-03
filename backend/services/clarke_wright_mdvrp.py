import time
import asyncio
from collections import deque
from typing import List, Dict, Tuple

from fastapi import HTTPException
from backend.schemas.vrp import Node, Route, VRPResponse
from backend.schemas.mdvrp import MDVRPRequest, MDVRPResponse, DepotRoutes
from backend.services.osrm import get_osrm_table
from backend.services.utils import haversine_distance, process_osrm_table
from backend.services.clarke_wright import clarke_wright_algorithm


# ─────────────────────────────────────────────
# PHASE 1 — Nearest-depot customer assignment
# ─────────────────────────────────────────────

def assign_customers(
    customers: List[Node],
    depots: List[Node]
) -> Dict[int, List[Node]]:
    assignment: Dict[int, List[Node]] = {d.id: [] for d in depots}
    for c in customers:
        nearest = min(depots, key=lambda d: haversine_distance(c.lat, c.lng, d.lat, d.lng))
        assignment[nearest.id].append(c)
    return assignment


# ─────────────────────────────────────────────
# LOCAL SEARCH — pure-Python CW cost (no IO)
# ─────────────────────────────────────────────

def _cw_cost_fast(
    depot: Node,
    customers: List[Node],
    capacity: float,
    road_dist: Dict[Tuple[int, int], float]
) -> float:
    """
    Mirrors the CW merge loop exactly, but uses a pre-built road_dist dict
    keyed by node ID. Zero IO — used only for local search evaluation.
    """
    if not customers:
        return 0.0

    route_map: Dict[int, deque] = {i: deque([c.id]) for i, c in enumerate(customers)}
    demand_map: Dict[int, float] = {i: c.demand for i, c in enumerate(customers)}
    endpoints: Dict[int, int] = {c.id: i for i, c in enumerate(customers)}
    next_id = len(customers)

    savings = []
    for i in range(len(customers)):
        for j in range(i + 1, len(customers)):
            c1, c2 = customers[i], customers[j]
            s = (road_dist.get((depot.id, c1.id), 0)
                 + road_dist.get((depot.id, c2.id), 0)
                 - road_dist.get((c1.id, c2.id), 0))
            savings.append((c1.id, c2.id, s))
    savings.sort(key=lambda x: x[2], reverse=True)

    for i_id, j_id, _ in savings:
        r_i, r_j = endpoints.get(i_id), endpoints.get(j_id)
        if r_i is None or r_j is None or r_i == r_j:
            continue
        if demand_map[r_i] + demand_map[r_j] > capacity:
            continue

        l_i, l_j = route_map[r_i], route_map[r_j]
        pos_i = 0 if l_i[0] == i_id else -1
        pos_j = 0 if l_j[0] == j_id else -1

        if pos_i == -1 and pos_j == 0:
            l_i.extend(l_j); nl = l_i
        elif pos_i == 0 and pos_j == -1:
            l_j.extend(l_i); nl = l_j
        elif pos_i == -1 and pos_j == -1:
            l_i.extend(reversed(l_j)); nl = l_i
        else:
            l_j.extendleft(l_i); nl = l_j

        new_demand = demand_map[r_i] + demand_map[r_j]
        del route_map[r_i], route_map[r_j]
        del demand_map[r_i], demand_map[r_j]
        endpoints.pop(i_id, None)
        endpoints.pop(j_id, None)

        route_map[next_id] = nl
        demand_map[next_id] = new_demand
        endpoints[nl[0]] = next_id
        endpoints[nl[-1]] = next_id
        next_id += 1

    # Sum route distances
    total = 0.0
    for r_id, r_deque in route_map.items():
        seq = [depot.id] + list(r_deque) + [depot.id]
        total += sum(road_dist.get((seq[k], seq[k + 1]), 0) for k in range(len(seq) - 1))
    return total


# ─────────────────────────────────────────────
# PHASE 3 — Local search reassignment
# ─────────────────────────────────────────────

def local_search(
    assignment: Dict[int, List[Node]],
    depot_map: Dict[int, Node],
    capacity: float,
    road_dist: Dict[Tuple[int, int], float],
    max_iter: int = 50
) -> Tuple[Dict[int, List[Node]], List[str]]:
    steps = []
    for iteration in range(max_iter):
        improved = False
        for depot_id, customers in list(assignment.items()):
            for customer in list(customers):
                # Skip if this depot would become empty
                if len(assignment[depot_id]) <= 1:
                    continue

                depot = depot_map[depot_id]
                current_cost = (
                    _cw_cost_fast(depot, assignment[depot_id], capacity, road_dist)
                )

                best_gain = 0.0
                best_target = None

                for other_id, other_depot in depot_map.items():
                    if other_id == depot_id:
                        continue
                    # Demand check for target depot
                    target_customers = assignment[other_id]
                    if customer.demand + sum(c.demand for c in target_customers) > capacity * len(target_customers + [customer]):
                        pass  # capacity is per-route, not per-depot; let CW handle it

                    new_source = [c for c in assignment[depot_id] if c.id != customer.id]
                    new_target = assignment[other_id] + [customer]

                    new_cost = (
                        _cw_cost_fast(depot, new_source, capacity, road_dist)
                        + _cw_cost_fast(other_depot, new_target, capacity, road_dist)
                    )
                    old_cost = (
                        current_cost
                        + _cw_cost_fast(other_depot, assignment[other_id], capacity, road_dist)
                    )

                    gain = old_cost - new_cost
                    if gain > best_gain:
                        best_gain = gain
                        best_target = other_id

                if best_target is not None:
                    assignment[depot_id].remove(customer)
                    assignment[best_target].append(customer)
                    steps.append(
                        f"[iter {iteration+1}] Moved customer {customer.id} "
                        f"from depot {depot_id} → {best_target} (gain={best_gain:.2f})"
                    )
                    improved = True

        if not improved:
            steps.append(f"Local search converged after {iteration+1} iteration(s).")
            break

    return assignment, steps


# ─────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────

async def clarke_wright_mdvrp(request: MDVRPRequest) -> MDVRPResponse:
    start_time = time.perf_counter()

    all_nodes = request.nodes
    depot_ids = request.depot_ids
    capacity = request.vehicle_capacity

    depots = [n for n in all_nodes if n.id in depot_ids]
    customers = [n for n in all_nodes if n.id not in depot_ids]

    if not depots:
        raise HTTPException(status_code=400, detail="No valid depot IDs found in nodes.")
    if not customers:
        raise HTTPException(status_code=400, detail="No customers found.")

    depot_map = {d.id: d for d in depots}

    # ── One global OSRM call ──
    osrm_table = await get_osrm_table([(n.lat, n.lng) for n in all_nodes])
    road_dist, _ = process_osrm_table(osrm_table, all_nodes)

    # ── Phase 1 ──
    assignment = assign_customers(customers, depots)

    # ── Phase 3 — Local search (pure Python, no IO) ──
    assignment, ls_steps = local_search(assignment, depot_map, capacity, road_dist)

    # ── Phase 2 — Final CW runs in parallel (real OSRM geometry) ──
    async def run_cw_for_depot(depot_id: int) -> DepotRoutes:
        depot = depot_map[depot_id]
        depot_customers = assignment[depot_id]
        if not depot_customers:
            return DepotRoutes(
                depot_id=depot_id,
                routes=[],
                total_distance=0.0,
                num_vehicles=0,
            )

        subset_nodes = [depot] + depot_customers

        # Slice sub-table for this depot's nodes only
        sub_table = await get_osrm_table([(n.lat, n.lng) for n in subset_nodes])

        result: VRPResponse = await clarke_wright_algorithm(
            nodes=subset_nodes,
            depot_id=depot_id,
            capacity=capacity,
            precomputed_table=sub_table,
        )
        return DepotRoutes(
            depot_id=depot_id,
            routes=result.routes,
            total_distance=result.total_distance,
            total_road_distance_km=result.total_road_distance_km,
            total_duration_s=result.total_duration_s,
            num_vehicles=result.num_vehicles,
            savings_table=result.savings_table,
            steps=result.steps,
            merge_events=result.merge_events,
            edge_geometries=result.edge_geometries,
        )

    depot_results: List[DepotRoutes] = await asyncio.gather(
        *[run_cw_for_depot(d_id) for d_id in depot_ids]
    )

    total_dist = sum(dr.total_distance for dr in depot_results)
    total_road = sum(dr.total_road_distance_km or 0 for dr in depot_results)
    total_dur = sum(dr.total_duration_s or 0 for dr in depot_results)
    total_vehicles = sum(dr.num_vehicles for dr in depot_results)

    flat_assignment = {str(c.id): d_id for d_id, custs in assignment.items() for c in custs}

    all_steps = ls_steps

    return MDVRPResponse(
        depot_results=list(depot_results),
        total_distance=round(total_dist, 2),
        total_road_distance_km=round(total_road, 2),
        total_duration_s=round(total_dur, 1),
        num_vehicles=total_vehicles,
        computation_time_ms=round((time.perf_counter() - start_time) * 1000, 2),
        assignment=flat_assignment,
        steps=all_steps,
    )