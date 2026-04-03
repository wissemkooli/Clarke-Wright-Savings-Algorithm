from fastapi import APIRouter
from backend.schemas.vrp import VRPRequest, VRPResponse
from backend.services.clarke_wright import clarke_wright_algorithm
from backend.services.cplex_solver import solve_with_cplex
from backend.services.osrm import get_osrm_table
import time
import asyncio
from backend.schemas.mdvrp import MDVRPRequest, MDVRPResponse
from backend.services.clarke_wright_mdvrp import clarke_wright_mdvrp




router = APIRouter(prefix="/api/solve", tags=["solver"])

@router.post("/clarke-wright", response_model=VRPResponse)
async def solve_clarke_wright(request: VRPRequest):
    return await clarke_wright_algorithm(request.nodes, request.depot_id, request.vehicle_capacity)

@router.post("/cplex")
async def solve_cplex(request: VRPRequest):
    return await solve_with_cplex(request)

@router.post("/clarke-wright/multi-depot", response_model=MDVRPResponse)
async def solve_mdvrp(request: MDVRPRequest):
    return await clarke_wright_mdvrp(request)





@router.post("/compare")
async def solve_compare(request: VRPRequest):
    # Performance Optimization: Fetch the distance table ONCE for both solvers
    # This prevents redundant heavy OSRM calls and avoids 429 rate limits.
    all_nodes = request.nodes
    
    table_res = await get_osrm_table([(n.lat, n.lng) for n in all_nodes])
    
    # Run both solvers in parallel using the shared table
    cw_coro = clarke_wright_algorithm(
        request.nodes, 
        request.depot_id, 
        request.vehicle_capacity, 
        precomputed_table=table_res
    )
    cplex_coro = solve_with_cplex(
        request, 
        precomputed_table=table_res
    )
    
    cw, cplex = await asyncio.gather(cw_coro, cplex_coro)
    
    return {
        "clarke_wright": cw,
        "cplex": cplex,
    }


