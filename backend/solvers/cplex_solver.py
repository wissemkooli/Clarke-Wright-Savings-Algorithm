from docplex.mp.model import Model
from backend.core.interfaces import BaseSolver, BaseProblem
from backend.core.registry import SolverRegistry
from backend.schemas.vrp import VRPResponse, Route
from backend.services.osrm import get_osrm_table, get_osrm_route_legs
from backend.services.utils import process_osrm_table, stitch_route_geometry
from backend.domain.variants import CVRPProblem
import time
import asyncio
import concurrent.futures
import math

_cplex_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=2, thread_name_prefix="cplex"
)

@SolverRegistry.register("cplex")
class CPLEXSolver(BaseSolver):
    name = "CPLEX"
    supported_variants = ["cvrp"]

    async def solve(self, problem: BaseProblem, precomputed_table: dict = None, **kwargs) -> VRPResponse:
        if not isinstance(problem, CVRPProblem):
            raise ValueError("CPLEXSolver only supports CVRPProblem")
            
        start_time = time.perf_counter()
        nodes = problem.nodes
        depot_id = problem.depot_id
        Q = problem.vehicle_capacity

        depot = next(n for n in nodes if n.id == depot_id)
        customers = [n for n in nodes if n.id != depot_id]
        n = len(customers)
        m = n  # Max vehicles

        all_nodes = [depot] + customers
        N = len(all_nodes)
        
        # Max demand check already handled by problem validation or inside solver
        max_demand = max((c.demand for c in customers), default=0)
        if Q <= 0 or max_demand > Q:
            return VRPResponse(
                routes=[], total_distance=0, savings_table=[],
                steps=[f"CPLEX Error: Max demand ({max_demand}) exceeds vehicle capacity ({Q})."]
            )

        if precomputed_table:
            table_res = precomputed_table
        else:
            table_res = await get_osrm_table([(nd.lat, nd.lng) for nd in all_nodes])
        
        dist, dur = process_osrm_table(table_res, all_nodes)

        dist_idx = {
            (i, j): dist.get((all_nodes[i].id, all_nodes[j].id), 0)
            for i in range(N) for j in range(N) if i != j
        }

        mdl = Model(name="CVRP")
        x = {(i, j): mdl.binary_var(name=f"x_{i}_{j}") for i in range(N) for j in range(N) if i != j}
        f = {(i, j): mdl.continuous_var(lb=0, ub=Q, name=f"f_{i}_{j}") for i in range(N) for j in range(N) if i != j}

        mdl.minimize(mdl.sum(dist_idx[i, j] * x[i, j] for i, j in x))
        
        total_demand = sum(c.demand for c in customers)
        m_min = math.ceil(total_demand / Q) if Q > 0 else 1
        
        mdl.add_constraint(mdl.sum(x[0, j] for j in range(1, N)) >= m_min)
        mdl.add_constraint(mdl.sum(x[0, j] for j in range(1, N)) <= m)
        mdl.add_constraint(mdl.sum(x[i, 0] for i in range(1, N)) >= m_min)
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
            if j == 0:
                mdl.add_constraint(f[i, 0] == 0)
            else:
                if i == 0:
                    mdl.add_constraint(f[0, j] <= Q * x[0, j])
                else:
                    mdl.add_constraint(f[i, j] <= (Q - all_nodes[i].demand) * x[i, j])
                mdl.add_constraint(f[i, j] >= all_nodes[j].demand * x[i, j])

        mdl.parameters.emphasis.mip = 1
        
        loop = asyncio.get_event_loop()
        solution = await loop.run_in_executor(
            _cplex_executor, lambda: mdl.solve(log_output=False)
        )

        if solution is None:
            return VRPResponse(
                routes=[], total_distance=0, savings_table=[],
                steps=["CPLEX Error: No feasible solution found, or constraints are too tight."]
            )

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
