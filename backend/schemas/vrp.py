from pydantic import BaseModel
from typing import List, Optional, Any

class MergeEvent(BaseModel):
    i: int
    j: int
    routes: List[List[int]]


class Node(BaseModel):
    id: int
    lat: float
    lng: float
    x: float
    y: float
    demand: float = 0


class VRPRequest(BaseModel):
    nodes: List[Node]
    depot_id: int
    vehicle_capacity: float


class Route(BaseModel):
    customers: List[int]
    total_demand: float
    total_distance: float
    geometry: List[List[float]] = []
    road_distance_km: Optional[float] = None
    duration_s: Optional[float] = None

class VRPResponse(BaseModel):
    routes: List[Route]
    total_distance: float
    total_road_distance_km: Optional[float] = None
    total_duration_s: Optional[float] = None
    num_vehicles: int = 0
    computation_time_ms: Optional[float] = None
    savings_table: List[dict]
    steps: List[str]
    merge_events: Optional[List[MergeEvent]] = None
    # Optimized: key format "id1,id2" -> polyline
    edge_geometries: Optional[dict[str, List[List[float]]]] = None