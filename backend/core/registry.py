from typing import Dict, Type
from backend.core.interfaces import BaseSolver

class SolverRegistry:
    _solvers: Dict[str, BaseSolver] = {}

    @classmethod
    def register(cls, solver_name: str):
        def wrapper(solver_class: Type[BaseSolver]):
            cls._solvers[solver_name] = solver_class()
            return solver_class
        return wrapper

    @classmethod
    def get_solver(cls, name: str) -> BaseSolver:
        if name not in cls._solvers:
            raise ValueError(f"Solver '{name}' not found in registered plugins.")
        return cls._solvers[name]
    
    @classmethod
    def list_solvers(cls) -> list[str]:
        return list(cls._solvers.keys())
