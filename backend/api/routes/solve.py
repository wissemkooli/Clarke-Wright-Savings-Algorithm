from fastapi import APIRouter, HTTPException
import asyncio
from backend.core.registry import SolverRegistry
# Trigger solver registration
import backend.solvers
from backend.domain.variants import CVRPProblem, MDVRPProblem
from backend.services.osrm import get_osrm_table

router = APIRouter(prefix="/api/solve", tags=["solver"])

@router.post("/{variant}/{solver_name}")
async def solve_vrp(variant: str, solver_name: str, payload: dict):
    try:
        solver = SolverRegistry.get_solver(solver_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    if variant not in solver.supported_variants:
        raise HTTPException(
            status_code=400, 
            detail=f"Solver {solver_name} does not support variant '{variant}'. Supported: {solver.supported_variants}"
        )
    
    if variant == "cvrp":
        problem = CVRPProblem(**payload)
    elif variant == "mdvrp":
        problem = MDVRPProblem(**payload)
    else:
        raise HTTPException(status_code=400, detail=f"Variant '{variant}' is not implemented.")
        
    if not problem.validate():
        raise HTTPException(status_code=400, detail="Problem payload failed validation.")
        
    try:
        response = await solver.solve(problem)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Legacy Frontend Hooks to New Registry System ──

@router.post("/clarke-wright")
async def solve_clarke_wright_legacy(payload: dict):
    return await solve_vrp("cvrp", "clarke-wright", payload)

@router.post("/cplex")
async def solve_cplex_legacy(payload: dict):
    return await solve_vrp("cvrp", "cplex", payload)

@router.post("/clarke-wright/multi-depot")
async def solve_mdvrp_legacy(payload: dict):
    return await solve_vrp("mdvrp", "clarke-wright-mdvrp", payload)

@router.post("/compare")
async def solve_compare(payload: dict):
    # Backward compatibility endpoint for the frontend compare mode
    # Fetch the distance table ONCE for both solvers
    problem = CVRPProblem(**payload)
    if not problem.validate():
        raise HTTPException(status_code=400, detail="Invalid CVRP request")

    all_nodes = problem.nodes
    table_res = await get_osrm_table([(n.lat, n.lng) for n in all_nodes])
    
    cw_solver = SolverRegistry.get_solver("clarke-wright")
    cplex_solver = SolverRegistry.get_solver("cplex")
    
    cw_coro = cw_solver.solve(problem, precomputed_table=table_res)
    cplex_coro = cplex_solver.solve(problem, precomputed_table=table_res)
    
    cw, cplex = await asyncio.gather(cw_coro, cplex_coro)
    
    return {
        "clarke_wright": cw,
        "cplex": cplex,
    }
