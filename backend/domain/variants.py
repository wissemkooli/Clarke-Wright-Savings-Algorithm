from backend.core.interfaces import BaseProblem
from backend.schemas.vrp import Node, VRPRequest
from backend.schemas.mdvrp import MDVRPRequest
from typing import List

class CVRPProblem(BaseProblem, VRPRequest):
    """Domain model for standard Capacitated Vehicle Routing Problem."""
    def validate(self) -> bool:
        return len(self.nodes) > 1 and self.vehicle_capacity > 0

class MDVRPProblem(BaseProblem, MDVRPRequest):
    """Domain model for Multi-Depot Vehicle Routing Problem."""
    def validate(self) -> bool:
        return len(self.nodes) > len(self.depot_ids) and self.vehicle_capacity > 0 and len(self.depot_ids) > 0
