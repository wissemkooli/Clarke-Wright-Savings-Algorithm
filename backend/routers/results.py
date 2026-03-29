from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.schemas.results import SaveResultRequest
from backend import models

router = APIRouter(prefix="/api/results", tags=["results"])


@router.post("/save")
async def save_result(result: SaveResultRequest, db: Session = Depends(get_db)):
    db_result = models.ScenarioResult(
        scenario_name=result.scenario_name,
        algorithm=result.algorithm,
        vehicle_capacity=result.vehicle_capacity,
        total_distance=result.total_distance,
        num_vehicles=result.num_vehicles,
        routes=result.routes
    )
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    return {"status": "success", "id": db_result.id}


@router.get("/")
async def get_results(db: Session = Depends(get_db)):
    return db.query(models.ScenarioResult).order_by(models.ScenarioResult.created_at.desc()).all()