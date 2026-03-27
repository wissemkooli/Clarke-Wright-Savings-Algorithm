from sqlalchemy import Column, Integer, String, Float, JSON, DateTime
from sqlalchemy.sql import func
from backend.database import Base

class ScenarioResult(Base):
    __tablename__ = "scenario_results"

    id = Column(Integer, primary_key=True, index=True)
    scenario_name = Column(String, index=True, default="Unnamed Scenario")
    algorithm = Column(String) # "clarke-wright" or "cplex"
    vehicle_capacity = Column(Float)
    total_distance = Column(Float)
    num_vehicles = Column(Integer)
    routes = Column(JSON) # Store detailed routes
    execution_time_ms = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
