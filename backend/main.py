# Triggering hot reload
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import math
import httpx
from sqlalchemy.orm import Session
from backend import models
from backend.database import engine, get_db

# Create DB schemas
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Clarke-Wright VRP Solver")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Node(BaseModel):
    id: int
    lat: float
    lng: float
    x: float
    y: float
    demand: float = 0

class VRPRequest(BaseModel):
    nodes: List[Node]
    depot_id: int
    vehicle_capacity: float

class Route(BaseModel):
    customers: List[int]
    total_demand: float
    total_distance: float

class VRPResponse(BaseModel):
    routes: List[Route]
    total_distance: float
    savings_table: List[dict]
    steps: List[str]

def calculate_distance(node1: Node, node2: Node) -> float:
    # Haversine formula for real geographic distance
    R = 6371  # Earth's radius in km

    lat1_rad = math.radians(node1.lat)
    lat2_rad = math.radians(node2.lat)
    delta_lat = math.radians(node2.lat - node1.lat)
    delta_lng = math.radians(node2.lng - node1.lng)

    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) *
         math.sin(delta_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c

def clarke_wright_algorithm(nodes: List[Node], depot_id: int, capacity: float):
    steps = []
    depot = next(n for n in nodes if n.id == depot_id)
    customers = [n for n in nodes if n.id != depot_id]

    violations = [c for c in customers if c.demand > capacity]
    if violations:
        if len(violations) == 1:
            c = violations[0]
            msg = (
                f"Customer {c.id} has demand {c.demand} which exceeds "
                f"vehicle capacity {capacity}."
            )
        else:
            parts = [f"customer {c.id} (demand {c.demand})" for c in violations]
            msg = (
                f"The following customers exceed vehicle capacity ({capacity}): "
                f"{', '.join(parts)}."
            )
        raise HTTPException(status_code=400, detail=msg)

    # Create customer lookup dictionary
    customer_dict = {c.id: c for c in customers}

    # Step 1: Calculate distance matrix
    steps.append("Step 1: Calculating distance matrix using Haversine formula")
    distances = {}
    for i in range(len(nodes)):
        for j in range(len(nodes)):
            if i != j:
                distances[(nodes[i].id, nodes[j].id)] = calculate_distance(nodes[i], nodes[j])

    # Step 2: Calculate savings
    steps.append("Step 2: Calculating savings for all customer pairs")
    savings = []
    for i in range(len(customers)):
        for j in range(i + 1, len(customers)):
            c1, c2 = customers[i], customers[j]
            saving_value = (distances[(depot.id, c1.id)] + 
                          distances[(depot.id, c2.id)] - 
                          distances[(c1.id, c2.id)])
            savings.append({
                'i': c1.id,
                'j': c2.id,
                'saving': round(saving_value, 2),
                'distance_i': round(distances[(depot.id, c1.id)], 2),
                'distance_j': round(distances[(depot.id, c2.id)], 2),
                'distance_ij': round(distances[(c1.id, c2.id)], 2)
            })

    # Step 3: Sort savings in descending order
    savings.sort(key=lambda x: x['saving'], reverse=True)
    steps.append(f"Step 3: Sorted {len(savings)} savings in descending order")

    # Step 4: Initialize routes - FIXED: Use list of dicts with demand tracking
    routes = [{'customers': [c.id], 'demand': c.demand} for c in customers]
    steps.append(f"Step 4: Initialized {len(routes)} individual routes with capacity {capacity}")

    # Step 5: Merge routes based on savings
    steps.append("Step 5: Merging routes based on savings...")
    merges = 0

    for saving in savings:
        i, j = saving['i'], saving['j']

        # Find routes containing i and j
        route_i_idx = None
        route_j_idx = None
        pos_i = None
        pos_j = None

        for idx, route in enumerate(routes):
            if i in route['customers']:
                route_i_idx = idx
                pos_i = 0 if route['customers'][0] == i else (len(route['customers']) - 1 if route['customers'][-1] == i else None)
            if j in route['customers']:
                route_j_idx = idx
                pos_j = 0 if route['customers'][0] == j else (len(route['customers']) - 1 if route['customers'][-1] == j else None)

        # Check if merge is possible
        if (route_i_idx is not None and route_j_idx is not None and 
            route_i_idx != route_j_idx and pos_i is not None and pos_j is not None):

            route_i = routes[route_i_idx]
            route_j = routes[route_j_idx]
            combined_demand = route_i['demand'] + route_j['demand']

            # FIXED: Proper capacity check with logging
            if combined_demand <= capacity:
                # Merge based on positions
                if pos_i == len(route_i['customers']) - 1 and pos_j == 0:
                    new_customers = route_i['customers'] + route_j['customers']
                elif pos_i == 0 and pos_j == len(route_j['customers']) - 1:
                    new_customers = route_j['customers'] + route_i['customers']
                elif pos_i == len(route_i['customers']) - 1 and pos_j == len(route_j['customers']) - 1:
                    new_customers = route_i['customers'] + route_j['customers'][::-1]
                elif pos_i == 0 and pos_j == 0:
                    new_customers = route_i['customers'][::-1] + route_j['customers']
                else:
                    continue

                # Create new merged route
                new_route = {
                    'customers': new_customers,
                    'demand': combined_demand
                }

                # Remove old routes (remove higher index first to avoid shifting)
                if route_i_idx > route_j_idx:
                    routes.pop(route_i_idx)
                    routes.pop(route_j_idx)
                else:
                    routes.pop(route_j_idx)
                    routes.pop(route_i_idx)

                # Add new merged route
                routes.append(new_route)
                merges += 1
                steps.append(f"  ✓ Merged customers {i} and {j} | Combined demand: {combined_demand:.1f}/{capacity} | Saving: {saving['saving']:.2f} km")
            else:
                steps.append(f"  ✗ Cannot merge {i} and {j} | Would exceed capacity: {combined_demand:.1f} > {capacity}")

    steps.append(f"Step 6: Completed {merges} merges, final routes: {len(routes)}")

    # Calculate final route details
    final_routes = []
    total_dist = 0

    for idx, route in enumerate(routes):
        # Calculate route distance
        route_distance = distances[(depot.id, route['customers'][0])]

        for k in range(len(route['customers']) - 1):
            route_distance += distances[(route['customers'][k], route['customers'][k+1])]

        route_distance += distances[(route['customers'][-1], depot.id)]

        # Verify demand calculation
        actual_demand = sum(customer_dict[cid].demand for cid in route['customers'])

        final_routes.append(Route(
            customers=route['customers'],
            total_demand=round(actual_demand, 2),
            total_distance=round(route_distance, 2)
        ))
        total_dist += route_distance

        steps.append(f"  Route {idx + 1}: {len(route['customers'])} customers, demand: {actual_demand:.1f}/{capacity}, distance: {route_distance:.2f} km")

    return VRPResponse(
        routes=final_routes,
        total_distance=round(total_dist, 2),
        savings_table=savings[:20],
        steps=steps
    )

@app.post("/api/solve/clarke-wright", response_model=VRPResponse)
@app.post("/solve", response_model=VRPResponse)
async def solve_vrp(request: VRPRequest):
    return clarke_wright_algorithm(request.nodes, request.depot_id, request.vehicle_capacity)

@app.post("/api/solve/cplex")
async def solve_cplex(request: VRPRequest):
    # This acts as a wrapper requesting the Java Spring Boot service
    # Assuming the Java service will run on localhost:8080
    JAVA_BACKEND_URL = "http://localhost:8080/solve"
    try:
        async with httpx.AsyncClient() as client:
            # We forward the payload directly to the Java backend
            response = await client.post(JAVA_BACKEND_URL, json=request.dict(), timeout=60.0)
            response.raise_for_status()
            return response.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Java CPLEX solver unavailable: {str(exc)}")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Error from Java Solver")

class SaveResultRequest(BaseModel):
    scenario_name: str
    algorithm: str
    vehicle_capacity: float
    total_distance: float
    num_vehicles: int
    routes: Any

@app.post("/api/results/save")
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

@app.get("/api/results")
async def get_results(db: Session = Depends(get_db)):
    return db.query(models.ScenarioResult).order_by(models.ScenarioResult.created_at.desc()).all()

@app.get("/")
async def root():
    return {"message": "Clarke-Wright VRP Solver API - Go to /static/index.html"}

@app.get("/static/index.html")
async def serve_index():
    return FileResponse("static/index.html")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")