# Import all solvers here to trigger the @SolverRegistry.register decorators
from backend.solvers.cplex_solver import CPLEXSolver
from backend.solvers.clarke_wright import ClarkeWrightSolver
from backend.solvers.clarke_wright_mdvrp import ClarkeWrightMDVRPSolver

__all__ = [
    "CPLEXSolver",
    "ClarkeWrightSolver",
    "ClarkeWrightMDVRPSolver"
]
