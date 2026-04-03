import math
from collections import deque
from fastapi import HTTPException
import asyncio
import time

from backend.core.interfaces import BaseSolver, BaseProblem
from backend.core.registry import SolverRegistry
from backend.domain.variants import CVRPProblem
from backend.schemas.vrp import Route, VRPResponse
from backend.services.osrm import get_osrm_table, get_osrm_route_legs
from backend.services.utils import process_osrm_table, stitch_route_geometry

@SolverRegistry.register("clarke-wright")
class ClarkeWrightSolver(BaseSolver):
    name = "Clarke-Wright"
    supported_variants = ["cvrp"]

    async def solve(self, problem: BaseProblem, precomputed_table: dict = None, **kwargs) -> VRPResponse:
        if not isinstance(problem, CVRPProblem):
            raise ValueError("ClarkeWrightSolver only supports CVRPProblem")

        start_time = time.perf_counter()
        nodes = problem.nodes
        depot_id = problem.depot_id
        capacity = problem.vehicle_capacity

        steps = []
        merge_events = []
        depot = next((n for n in nodes if n.id == depot_id), None)
        if not depot:
            raise HTTPException(status_code=400, detail=f"Depot ID {depot_id} not found.")

        customers = [n for n in nodes if n.id != depot_id]
        violations = [c for c in customers if c.demand > capacity]
        if violations:
            msg = f"Demand exceeds capacity ({capacity})"
            raise HTTPException(status_code=400, detail=msg)

        node_map = {n.id: n for n in nodes}

        if precomputed_table:
            osrm_table_res = precomputed_table
        else:
            osrm_table_res = await get_osrm_table([(n.lat, n.lng) for n in nodes])
        
        road_dist, road_dur = process_osrm_table(osrm_table_res, nodes)

        savings = []
        for i in range(len(customers)):
            for j in range(i + 1, len(customers)):
                c1, c2 = customers[i], customers[j]
                s = (road_dist[(depot.id, c1.id)] + road_dist[(depot.id, c2.id)] - road_dist[(c1.id, c2.id)])
                savings.append({'i': c1.id, 'j': c2.id, 'saving': round(s, 2)})

        savings.sort(key=lambda x: x['saving'], reverse=True)
        
        route_map: dict[int, deque] = {idx: deque([c.id]) for idx, c in enumerate(customers)}
        demand_map: dict[int, float] = {idx: c.demand for idx, c in enumerate(customers)}
        endpoints: dict[int, int] = {c.id: idx for idx, c in enumerate(customers)}
        next_id = len(customers)
        merge_count = 0

        throttle = 1 if len(nodes) < 25 else (5 if len(nodes) < 100 else 10)
        merge_events.append({"i": -1, "j": -1, "routes": [list(l) for l in route_map.values()]})

        for sv in savings:
            i, j = sv['i'], sv['j']
            r_i, r_j = endpoints.get(i), endpoints.get(j)
            if r_i is not None and r_j is not None and r_i != r_j:
                if demand_map[r_i] + demand_map[r_j] <= capacity:
                    l_i, l_j = route_map[r_i], route_map[r_j]
                    pos_i = 0 if l_i[0] == i else -1
                    pos_j = 0 if l_j[0] == j else -1

                    if pos_i == -1 and pos_j == 0:
                        l_i.extend(l_j)
                        nl = l_i
                    elif pos_i == 0 and pos_j == -1:
                        l_j.extend(l_i)
                        nl = l_j
                    elif pos_i == -1 and pos_j == -1:
                        l_i.extend(reversed(l_j))
                        nl = l_i
                    else:
                        l_j.extendleft(l_i)
                        nl = l_j

                    new_demand = demand_map[r_i] + demand_map[r_j]
                    del route_map[r_i]; del route_map[r_j]
                    del demand_map[r_i]; del demand_map[r_j]
                    if i in endpoints: del endpoints[i]
                    if j in endpoints: del endpoints[j]

                    route_map[next_id] = nl
                    demand_map[next_id] = new_demand
                    endpoints[nl[0]] = next_id
                    endpoints[nl[-1]] = next_id
                    next_id += 1
                    
                    merge_count += 1
                    if merge_count % throttle == 0:
                        merge_events.append({"i": i, "j": j, "routes": [list(l) for l in route_map.values()]})
                    
                    steps.append(f"Merged {i} and {j}")

        edge_geom_cache: dict[tuple, list] = {}
        edge_dur_cache: dict[tuple, float] = {}

        async def fetch_legs(r_deque: deque):
            r_list = list(r_deque)
            wp = [(depot.lat, depot.lng)] + [(node_map[cid].lat, node_map[cid].lng) for cid in r_list] + [(depot.lat, depot.lng)]
            legs_data = await get_osrm_route_legs(wp)
            node_seq = [depot.id] + r_list + [depot.id]
            for k, leg_dict in enumerate(legs_data):
                u, v = node_seq[k], node_seq[k + 1]
                edge_geom_cache[(u, v)] = leg_dict["geometry"]
                edge_dur_cache[(u, v)] = leg_dict["duration"]

        await asyncio.gather(*[fetch_legs(rl) for rl in route_map.values()])

        final_routes = []
        total_road_dist = 0
        total_dur_s = 0
        for r_id, r_deque in route_map.items():
            r_list = list(r_deque)
            node_seq = [depot.id] + r_list + [depot.id]
            r_dist = sum(road_dist.get((node_seq[k], node_seq[k+1]), 0) for k in range(len(node_seq)-1))
            r_dur = sum(edge_dur_cache.get((node_seq[k], node_seq[k+1]), road_dur.get((node_seq[k], node_seq[k+1]), 0)) for k in range(len(node_seq)-1))

            fr = Route(
                customers=r_list,
                total_demand=round(demand_map[r_id], 2),
                total_distance=round(r_dist, 2),
                road_distance_km=round(r_dist, 2),
                duration_s=round(r_dur, 1),
                geometry=stitch_route_geometry(edge_geom_cache, node_seq, node_map)
            )
            final_routes.append(fr)
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
            savings_table=savings[:20],
            steps=steps,
            merge_events=merge_events,
            edge_geometries=string_edge_geoms
        )
