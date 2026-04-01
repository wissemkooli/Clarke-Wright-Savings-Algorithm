import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend import models
from backend.database import engine
from backend.routers import solver, results, predictions


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        models.Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.warning(
            "PostgreSQL unavailable (%s). Solver API works; persist endpoints need a valid DATABASE_URL.",
            exc,
        )
    yield


app = FastAPI(title="Clarke-Wright VRP Solver", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(solver.router)
app.include_router(results.router)
app.include_router(predictions.router)


@app.get("/")
async def root():
    return {"message": "Clarke-Wright VRP Solver API"}