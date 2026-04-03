import math
from typing import List, Dict, Optional, Tuple
from backend.schemas.vrp import Node

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance between two points in km."""
    R = 6371
    dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def process_osrm_table(
    table_res: dict, 
    nodes: List[Node]
) -> Tuple[Dict[Tuple[int, int], float], Dict[Tuple[int, int], float]]:
    """
    Extract distance and duration maps from OSRM table with Haversine fallback.
    Returns: (distance_map, duration_map) where keys are (id_from, id_to)
    """
    osrm_ok = table_res.get("ok", False)
    dist_matrix = table_res.get("distances", [])
    dur_matrix = table_res.get("durations", [])
    
    dist_map = {}
    dur_map = {}
    
    num_nodes = len(nodes)
    node_ids = [n.id for n in nodes]
    node_coords = [(n.lat, n.lng) for n in nodes]
    
    for i in range(num_nodes):
        id_i = node_ids[i]
        lat_i, lng_i = node_coords[i]
        row_dist = dist_matrix[i] if osrm_ok and i < len(dist_matrix) else None
        row_dur = dur_matrix[i] if osrm_ok and i < len(dur_matrix) else None

        for j in range(num_nodes):
            if i == j: continue
            id_j = node_ids[j]
            d, t = -1, -1
            
            if row_dist is not None and j < len(row_dist):
                d = row_dist[j]
                t = row_dur[j] if row_dur is not None and j < len(row_dur) else -1
                
            if d >= 0:
                dist_map[(id_i, id_j)] = d
                dur_map[(id_i, id_j)] = t
            else:
                lat_j, lng_j = node_coords[j]
                h = haversine_distance(lat_i, lng_i, lat_j, lng_j)
                dist_map[(id_i, id_j)] = h
                dur_map[(id_i, id_j)] = 0
                
    return dist_map, dur_map

def stitch_route_geometry(
    edge_cache: Dict[Tuple[int, int], List[List[float]]],
    node_seq_ids: List[int],
    node_map: Dict[int, Node]
) -> List[List[float]]:
    """Connect individual leg geometries into a single route polyline."""
    full_geom = []
    for k in range(len(node_seq_ids) - 1):
        u, v = node_seq_ids[k], node_seq_ids[k + 1]
        seg = edge_cache.get((u, v))
        if not seg:
            n1, n2 = node_map[u], node_map[v]
            seg = [[n1.lat, n1.lng], [n2.lat, n2.lng]]
            
        full_geom.extend(seg if not full_geom else seg[1:])
    return full_geom
