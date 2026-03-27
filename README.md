# Clarke–Wright VRP Solver 🌍🚚

Interactive web application that implements the **Clarke–Wright savings algorithm** to solve a capacitated Vehicle Routing Problem (VRP) on top of a real OpenStreetMap basemap. Users can set a depot and customer locations directly on the map, assign demands and vehicle capacity, then visualize optimized routes that respect capacity constraints and follow real road networks.

![Clarke-Wright Algorithm Demo](https://img.shields.io/badge/Algorithm-Clarke--Wright-blue)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green)
![Next.js](https://img.shields.io/badge/Frontend-Next.js-blue)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 📸 Features

- 🗺️ **Interactive OpenStreetMap interface**
  - Click to place depot and customers
  - Visual markers with IDs and demands
  - Real-time map interaction

- 🚚 **Clarke–Wright savings algorithm**
  - Classic VRP heuristic from operations research
  - Haversine distance calculation for geographic coordinates
  - Savings formula: S(i,j) = d(0,i) + d(0,j) - d(i,j)

- 📦 **Capacity-constrained routing**
  - Define vehicle capacity and customer demands
  - Routes merge only if capacity permits
  - See load per vehicle (e.g., 45/100 = 45% full)

- 🛣️ **Road-following routes**
  - Uses OSRM routing service to snap routes to real roads
  - Smooth, realistic vehicle paths
  - Hover tooltips show route information

- 📊 **Algorithm visualization & Analytics**
  - Top 20 savings pairs ranked
  - Step-by-step execution log
  - Merge decisions with capacity validation
  - Save results to PostgreSQL database

---

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Node.js v18+
- PostgreSQL server (running locally)
- Internet connection (for map tiles and routing)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/wissemkooli/Clarke-Wright-Savings-Algorithm
   cd Clarke-Wright-Savings-Algorithm
   ```

2. **Configure Database**
   Create a `.env` file in the project root and provide your PostgreSQL connection string:
   ```env
   DATABASE_URL=postgresql://vrp_user:vrp_pass@localhost:5432/vrp_db
   ```
   Ensure the database and user exist in your PostgreSQL instance.

3. **Install Backend Dependencies**
   ```bash
   pip install -r requirements.txt
   pip install python-dotenv # if not included in requirements.txt
   ```

4. **Run the Backend Server**
   ```bash
   uvicorn backend.main:app --reload
   ```
   *The API will be available at http://127.0.0.1:8000*

5. **Run the Next.js Frontend**
   In a new terminal:
   ```bash
   cd vrp-platform
   npm install
   npm run dev
   ```
   *The interactive UI will be available at http://localhost:3000*

---

## 📁 Project Structure

```
Clarke-Wright-Savings-Algorithm/
├── backend/
│   ├── main.py              # FastAPI server + Clarke-Wright algorithm
│   ├── database.py          # PostgreSQL configuration
│   └── models.py            # SQLAlchemy schema definitions
├── vrp-platform/            # Next.js 14 Frontend UI (App Router)
│   ├── app/                 # Next.js application routes (/solver, /analytics, etc)
│   ├── public/              # Static frontend assets
│   ├── components/          # Reusable React components
│   └── package.json
├── requirements.txt         # Python dependencies
└── README.md
```

---

## 🎮 How to Use

### Step 1: Set Depot
1. Navigate to http://localhost:3000/solver
2. Click **"Set Depot (click map)"**
3. Click anywhere on the map to place the depot (🔴 red marker)

### Step 2: Add Customers
1. Adjust **"Customer Demand"** if needed (default: 15)
2. Click **"Add Customers (click map)"**
3. Click on the map to add customers (🔵 blue markers)
4. Each customer shows their ID and demand

### Step 3: Configure Vehicle & Solve
1. Set **"Vehicle Capacity"**
2. Click **"Solve with Clarke-Wright"**
3. Routes will automatically appear on the map

### Step 4: Analyze & Store Results
- View execution logs and highest savings in the results sections.
- Results and analytics can be pushed to the PostgreSQL persistence layer.

---

## 🧮 Clarke–Wright Algorithm Explained
The Clarke–Wright savings algorithm is a heuristic for solving the Vehicle Routing Problem. It starts by assuming every node has a dedicated vehicle and calculates the "savings" created by joining routes based on distance: `S(i,j) = d(0,i) + d(0,j) - d(i,j)`.

Merges are executed iteratively from highest savings downwards, strictly confirming that aggregated customer demands do not breach vehicle capacity constraints.

---

## 🛠️ Technical Details
- **Backend (FastAPI, Python)**: Haversine distance functions, Pydantic type-safe validation, asynchronous routing calls, SQLAlchemy ORM mappings for Postgres integration.
- **Frontend (Next.js 14, React)**: Server-side rendering capable Next.js structure, Tailwind CSS for agile UI engineering, React Leaflet ecosystem for complex DOM layering maps.
- **Routing**: Uses OSRM open routing data for realistic road-path visualizations constraints.

---

## 👨‍💻 Author

**Wissem Kooli**
- GitHub: [@wissemkooli](https://github.com/wissemkooli)
- Project: [Clarke-Wright-Savings-Algorithm](https://github.com/wissemkooli/Clarke-Wright-Savings-Algorithm)

---

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
