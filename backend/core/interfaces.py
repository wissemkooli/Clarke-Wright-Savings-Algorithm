from abc import ABC, abstractmethod
from typing import Any

class BaseProblem(ABC):
    """Abstract mapping of a VRP Variant payload to standardized mathematical domain objects."""
    @abstractmethod
    def validate(self) -> bool:
        pass

class BaseSolver(ABC):
    """The Strategy Interface"""
    name: str = "Base"
    supported_variants: list[str] = []

    @abstractmethod
    async def solve(self, problem: BaseProblem, **kwargs) -> Any:
        """Solves the standard problem object and returns a standardized payload."""
        pass
