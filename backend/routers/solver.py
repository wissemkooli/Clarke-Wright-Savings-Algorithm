from fastapi import APIRouter
from backend.schemas.vrp import VRPRequest, VRPResponse
from backend.services.clarke_wright import clarke_wright_algorithm
from backend.services.cplex_proxy import solve_with_cplex

router = APIRouter(prefix="/api/solve", tags=["solver"])


@router.post("/clarke-wright", response_model=VRPResponse)
async def solve_clarke_wright(request: VRPRequest):
    return clarke_wright_algorithm(request.nodes, request.depot_id, request.vehicle_capacity)


@router.post("/cplex")
async def solve_cplex(request: VRPRequest):
    return await solve_with_cplex(request)