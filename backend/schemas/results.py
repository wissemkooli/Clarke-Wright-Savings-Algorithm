from pydantic import BaseModel
from typing import Any

class SaveResultRequest(BaseModel):
    scenario_name: str
    algorithm: str
    vehicle_capacity: float
    total_distance: float
    num_vehicles: int
    routes: Any