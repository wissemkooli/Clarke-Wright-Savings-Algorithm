from pydantic import BaseModel
from typing import List, Optional, Dict
from backend.schemas.vrp import Node, Route, MergeEvent


class MDVRPRequest(BaseModel):
    nodes: List[Node]
    depot_ids: List[int]
    vehicle_capacity: float


class DepotRoutes(BaseModel):
    depot_id: int
    routes: List[Route]
    total_distance: float
    total_road_distance_km: Optional[float] = None
    total_duration_s: Optional[float] = None
    num_vehicles: int
    savings_table: List[dict] = []
    steps: List[str] = []
    merge_events: Optional[List[MergeEvent]] = None
    edge_geometries: Optional[Dict[str, List[List[float]]]] = None


class MDVRPResponse(BaseModel):
    depot_results: List[DepotRoutes]
    total_distance: float
    total_road_distance_km: Optional[float] = None
    total_duration_s: Optional[float] = None
    num_vehicles: int
    computation_time_ms: Optional[float] = None
    assignment: Dict[str, int]   # "customer_id" -> depot_id
    steps: List[str]