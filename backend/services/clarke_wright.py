import math
from typing import List, Dict
from fastapi import HTTPException
from backend.schemas.vrp import Node, Route, VRPResponse
from backend.services.osrm import get_osrm_table, get_osrm_route_legs
import asyncio
import time


def calculate_distance(node1: Node, node2: Node) -> float:
    """Haversine distance in km."""
    R = 6371
    lat1_rad, lat2_rad = math.radians(node1.lat), math.radians(node2.lat)
    delta_lat, delta_lng = math.radians(node2.lat - node1.lat), math.radians(node2.lng - node1.lng)
    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def clarke_wright_algorithm(nodes: List[Node], depot_id: int, capacity: float) -> VRPResponse:
    start_time = time.perf_counter()
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

    # ── Step 1: Haversine Table ──
    h_dist: dict[tuple, float] = {}
    for ni in nodes:
        for nj in nodes:
            if ni.id != nj.id:
                h_dist[(ni.id, nj.id)] = calculate_distance(ni, nj)

    # ── Step 2-6: Merge Algorithm ──
    savings = []
    for i in range(len(customers)):
        for j in range(i + 1, len(customers)):
            c1, c2 = customers[i], customers[j]
            s = (h_dist[(depot.id, c1.id)] + h_dist[(depot.id, c2.id)] - h_dist[(c1.id, c2.id)])
            savings.append({'i': c1.id, 'j': c2.id, 'saving': round(s, 2)})

    savings.sort(key=lambda x: x['saving'], reverse=True)
    
    route_map: dict[int, list] = {idx: [c.id] for idx, c in enumerate(customers)}
    demand_map: dict[int, float] = {idx: c.demand for idx, c in enumerate(customers)}
    endpoints: dict[int, int] = {c.id: idx for idx, c in enumerate(customers)}
    next_id = len(customers)

    merge_events.append({"i": -1, "j": -1, "routes": [l.copy() for l in route_map.values()]})

    for sv in savings:
        i, j = sv['i'], sv['j']
        r_i, r_j = endpoints.get(i), endpoints.get(j)
        if r_i is not None and r_j is not None and r_i != r_j:
            if demand_map[r_i] + demand_map[r_j] <= capacity:
                l_i, l_j = route_map[r_i], route_map[r_j]
                pos_i = 0 if l_i[0] == i else -1
                pos_j = 0 if l_j[0] == j else -1
                
                if pos_i == -1 and pos_j == 0: nl = l_i + l_j
                elif pos_i == 0 and pos_j == -1: nl = l_j + l_i
                elif pos_i == -1 and pos_j == -1: nl = l_i + l_j[::-1]
                else: nl = l_i[::-1] + l_j

                del route_map[r_i]; del route_map[r_j]
                del demand_map[r_i]; del demand_map[r_j]
                if i in endpoints: del endpoints[i]
                if j in endpoints: del endpoints[j]

                route_map[next_id] = nl
                demand_map[next_id] = sum(node_map[cid].demand for cid in nl)
                endpoints[nl[0]] = next_id
                endpoints[nl[-1]] = next_id
                next_id += 1
                merge_events.append({"i": i, "j": j, "routes": [l.copy() for l in route_map.values()]})
                steps.append(f"Merged {i} and {j}")

    # ── Step 7: Parallel OSRM fetch ──
    osrm_table_res: dict = {}
    edge_geom_cache: dict[tuple, list] = {}
    edge_dur_cache: dict[tuple, float] = {}

    async def fetch_table():
        res = await get_osrm_table([(n.lat, n.lng) for n in nodes])
        osrm_table_res.update(res)

    async def fetch_legs(r_list: list):
        wp = [(depot.lat, depot.lng)] + [(node_map[cid].lat, node_map[cid].lng) for cid in r_list] + [(depot.lat, depot.lng)]
        legs_data = await get_osrm_route_legs(wp)
        node_seq = [depot.id] + r_list + [depot.id]
        for k, leg_dict in enumerate(legs_data):
            u, v = node_seq[k], node_seq[k + 1]
            edge_geom_cache[(u, v)] = leg_dict["geometry"]
            edge_dur_cache[(u, v)] = leg_dict["duration"]

    t2 = time.perf_counter()
    await asyncio.gather(fetch_table(), *[fetch_legs(rl) for rl in route_map.values()])
    print(f"[CW TIMING] parallel_fetch={time.perf_counter()-t2:.2f}s")

    # Final reporting distances/durations from table
    dist_table = osrm_table_res.get("distances", [])
    dur_table = osrm_table_res.get("durations", [])
    osrm_ok = osrm_table_res.get("ok") and dist_table
    
    road_dist: dict[tuple, float] = {}
    road_dur: dict[tuple, float] = {}
    
    if osrm_ok:
        for i, ni in enumerate(nodes):
            for j, nj in enumerate(nodes):
                if ni.id != nj.id:
                    d = dist_table[i][j] if i < len(dist_table) and j < len(dist_table[i]) else -1
                    t = dur_table[i][j] if i < len(dur_table) and j < len(dur_table[i]) else -1
                    road_dist[(ni.id, nj.id)] = d if d >= 0 else h_dist[(ni.id, nj.id)]
                    road_dur[(ni.id, nj.id)] = t if t >= 0 else 0
    else:
        road_dist = h_dist
        road_dur = {k: 0 for k in h_dist.keys()}

    def stitch(r_list: list) -> list:
        geom = []
        node_seq = [depot.id] + r_list + [depot.id]
        for k in range(len(node_seq) - 1):
            seg = edge_geom_cache.get((node_seq[k], node_seq[k + 1]))
            if not seg:
                n1, n2 = node_map[node_seq[k]], node_map[node_seq[k + 1]]
                seg = [[n1.lat, n1.lng], [n2.lat, n2.lng]]
            geom.extend(seg if not geom else seg[1:])
        return geom

    final_routes = []
    total_road_dist = 0
    total_dur_s = 0
    for r_id, r_list in route_map.items():
        # Duration: sum specific legs fetched for this final route
        r_dur = 0
        r_dist = 0
        node_seq = [depot.id] + r_list + [depot.id]
        for k in range(len(node_seq) - 1):
            pair = (node_seq[k], node_seq[k+1])
            r_dist += road_dist.get(pair, 0)
            r_dur += edge_dur_cache.get(pair, road_dur.get(pair, 0))

        fr = Route(
            customers=r_list,
            total_demand=round(demand_map[r_id], 2),
            total_distance=round(r_dist, 2),
            road_distance_km=round(r_dist, 2),
            duration_s=round(r_dur, 1),
            geometry=stitch(r_list)
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