# VRP Multi-Engine Solver

An interactive, web-based application designed to solve Capacitated Vehicle Routing Problems (CVRP). The application provides a visual interface for plotting depots and customer nodes on top of OpenStreetMap, evaluating routes using both heuristic and exact optimal solvers, and visualizing the step-by-step route merging processes.

![Clarke-Wright Algorithm Demo](https://img.shields.io/badge/Algorithm-Clarke--Wright-blue)
![IBM CPLEX](https://img.shields.io/badge/Algorithm-IBM_CPLEX-red)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green)
![Next.js](https://img.shields.io/badge/Frontend-Next.js-blue)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## Features

- **Multi-Engine Solving Capability**
  - **Clarke-Wright Savings Heuristic:** A fast, iterative combinatorial algorithm that scales efficiently for larger datasets.
  - **IBM CPLEX Exact Optimizer:** Validates the heuristic against true mathematical optimality.
  - **Comparison Mode:** Run both algorithms concurrently to evaluate efficiency overheads, time penalties, and differences in routing paths.

- **Realistic Geographic Routing (OSRM)**
  - Replaces theoretical straight-line Haversine math with precise road driving matrices via the OSRM `/table` API.
  - Generates realistic road-snapped polylines for vehicle paths.

- **Interactive UI & Playback Engine**
  - Click-to-place map interface leveraging React-Leaflet.
  - Granular control over vehicle capacities and customer demands.
  - Real-time animated playback slider that visually traverses the step-by-step merge decisions of the Clarke-Wright heuristic directly on the map.

- **Persistent Analytics**
  - Save routing solutions and telemetry data back to a local PostgreSQL instance for historical analysis.

---

## Technical Stack

- **Backend:** Python 3.10+, FastAPI, SQLAlchemy, IBM CPLEX (docplex), HTTPX, Pandas.
- **Frontend:** Node.js, Next.js 14 (App Router), React 18, Leaflet, Tailwind CSS.

---

## Installation & Setup

### Prerequisites

- Python 3.8+
- Node.js v18+
- Local PostgreSQL instance
- (Optional but recommended) IBM CPLEX Studio configured in Python environment.

### 1. Database Configuration
Create a `.env` file in the project root:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/vrpdb
```

### 2. Backend Initialization
```bash
# Clone repository
git clone https://github.com/wissemkooli/Clarke-Wright-Savings-Algorithm.git
cd Clarke-Wright-Savings-Algorithm

# Install packages
pip install -r requirements.txt

# Start FastAPI server
uvicorn backend.main:app --reload
```
The API listens on `http://127.0.0.1:8000`.

### 3. Frontend Initialization
In a secondary terminal:
```bash
cd vrp-platform
npm install
npm run dev
```
Access the client at `http://localhost:3000`.

---

## Project Structure

```
Clarke-Wright-Savings-Algorithm/
├── backend/
│   ├── main.py                 # Application entry point and CORS definition
│   ├── database.py             # PostgreSQL session scoping
│   ├── models.py               # ORM structured tables
│   ├── routers/                # FastAPI endpoint groups (solver, results, predictions)
│   └── services/               # Core business logic
│       ├── clarke_wright.py    # Asynchronous heuristic engine & map state generation
│       ├── cplex_solver.py     # Deterministic routing logic
│       └── osrm.py             # HTTP clients handling routing network maps
├── vrp-platform/
│   ├── app/                    # Next.js 14 file-based routing and page components
│   ├── public/                 # Static assets
│   ├── components/             # Reusable UI boundaries (MapView, ControlPanel, etc)
│   └── tailwind.config.ts      # CSS taxonomy
└── requirements.txt
```

---

## Usage

1. **Initialize Map:** Navigate to `/solver` and select "Set Depot" to establish the origin node.
2. **Assign Nodes:** Select "Add Customers" to populate the delivery field.
3. **Configure Limits:** Set the shared `Vehicle Capacity` constraints to control density per truck.
4. **Solve:** Toggle the required algorithms (Heuristic, CPLEX, or Both) and execute.
5. **Inspect:** Use the timeline slider in the top right of the map output to visualize step-by-step route merging behaviors.

---

## License

This architecture is published under the MIT License. Reference `LICENSE` for exact distribution terms.

**Wissem Kooli**  
[@wissemkooli](https://github.com/wissemkooli)
