import httpx
from fastapi import HTTPException
from backend.schemas.vrp import VRPRequest

JAVA_BACKEND_URL = "http://localhost:8080/solve"


async def solve_with_cplex(request: VRPRequest):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(JAVA_BACKEND_URL, json=request.model_dump(), timeout=60.0)
            response.raise_for_status()
            return response.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Java CPLEX solver unavailable: {str(exc)}")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Error from Java Solver: {exc.response.text}"
        )