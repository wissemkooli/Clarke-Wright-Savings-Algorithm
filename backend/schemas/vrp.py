from pydantic import BaseModel
from typing import List

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

class VRPResponse(BaseModel):
    routes: List[Route]
    total_distance: float
    savings_table: List[dict]
    steps: List[str]